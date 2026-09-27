/**
 * MergeMind API Server
 *
 * Exposes:
 *   POST /api/verify        — start a semantic verification run
 *   GET  /api/session/:id   — poll a session result
 *   GET  /api/health        — health check
 *
 * Real pipeline: GitHub repository ingestion (clone/fetch/diff as source
 * text only — repository code is never executed) → deterministic
 * semantic-engine analysis → ConflictReport[] served to the UI.
 *
 * Uses the deterministic semantic-engine package. No external AI calls —
 * the engine runs locally. Bob/agent execution remains an extension point
 * (see @mergemind/analysis AgentRunner) and is NOT claimed here.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import {
  DeterministicExtractor,
  ExtractionPipeline,
  normalizeAssumptions,
  detectConflicts,
  explainConflicts,
  AnalysisStatus,
  SourceType,
} from '@mergemind/semantic-engine';
import type {
  AnalysisInput,
  ChangeDescription,
  SemanticAnalysisResult,
  ConflictReport,
} from '@mergemind/semantic-engine';

import {
  ingestRemoteRepository,
  changeSetFromIngestResult,
  buildSemanticAnalysisInput,
} from '@mergemind/git-ingest';
import { runBobAssist } from './bob-assist';

// ── Types for the HTTP API ────────────────────────────────────────────────────

export type SessionStatus =
  'PENDING' | 'INGESTING' | 'ANALYZING' | 'VERIFYING' | 'COMPLETE' | 'ERROR';

interface VerifyRequest {
  /** Canonical field: public GitHub URL (https://github.com/<owner>/<repo>). */
  repository: string;
  featureRequest: string;
  /** Base branch both changes are compared against. Defaults to "main". */
  baseBranch?: string;
  branchA: string;
  branchB: string;
  /** Optional code diffs for each branch (legacy path, no clone). */
  codeA?: string;
  codeB?: string;
}

interface SessionRecord {
  id: string;
  status: SessionStatus;
  input: VerifyRequest;
  startedAt: string;
  completedAt?: string;
  result?: SemanticAnalysisResult;
  /** Full explainable reports — served to UI clients so findings need no re-derivation. */
  reports?: readonly ConflictReport[];
  /** Distinct changed files measured during ingestion (null when not ingested). */
  filesChanged?: number;
  changedFiles?: string[];
  /**
   * Developer merge attestation. Set via POST /api/session/:id/merge after
   * the developer merges with Git. Advisory record only — MergeMind never
   * merges or modifies the source repository itself.
   */
  merge?: MergeRecord;
  error?: string;
}

export interface MergeRecord {
  markedAt: string;
  note?: string;
}

// ── In-memory session store ───────────────────────────────────────────────────

const sessions = new Map<string, SessionRecord>();

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
});

// ── POST /api/verify ──────────────────────────────────────────────────────────

app.post('/api/verify', (req: Request, res: Response) => {
  const body = req.body as VerifyRequest;

  if (!body.featureRequest || !body.repository) {
    res.status(400).json({ error: 'featureRequest and repository are required' });
    return;
  }
  if (!body.branchA || !body.branchB) {
    res.status(400).json({ error: 'branchA and branchB are required' });
    return;
  }
  // Fail fast for URL-shaped repositories that are not public GitHub URLs.
  // Plain slugs (e.g. "acme-org/platform") keep the legacy no-clone path.
  if (body.repository.includes('://') && !isGitHubUrl(body.repository)) {
    res.status(400).json({
      error: 'repository must be a public GitHub URL (https://github.com/<owner>/<repo>)',
    });
    return;
  }

  const sessionId = uuidv4();
  const session: SessionRecord = {
    id: sessionId,
    status: 'PENDING',
    input: {
      repository: body.repository,
      featureRequest: body.featureRequest,
      baseBranch: body.baseBranch?.trim() || 'main',
      branchA: body.branchA,
      branchB: body.branchB,
      ...(body.codeA !== undefined ? { codeA: body.codeA } : {}),
      ...(body.codeB !== undefined ? { codeB: body.codeB } : {}),
    },
    startedAt: new Date().toISOString(),
  };
  sessions.set(sessionId, session);

  // Run analysis asynchronously — return immediately
  void runAnalysis(session);

  res.status(202).json({ sessionId, status: 'PENDING' });
});

// ── GET /api/session/:id ──────────────────────────────────────────────────────

app.get('/api/session/:id', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(formatSession(session));
});

// ── POST /api/session/:id/merge ─────────────────────────────────────────────
// Developer attestation that the verified changes were merged with Git.
// Only COMPLETE sessions can be marked. This records the decision — it does
// not perform any merge; the source repository is never touched.

app.post('/api/session/:id/merge', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (session.status !== 'COMPLETE' || !session.result) {
    res.status(409).json({ error: 'Only COMPLETE sessions can be marked as merged' });
    return;
  }
  const note = (req.body as { note?: unknown } | undefined)?.note;
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
    res.status(400).json({ error: 'note must be a string of at most 500 characters' });
    return;
  }
  session.merge = {
    markedAt: new Date().toISOString(),
    ...(typeof note === 'string' && note.trim().length > 0 ? { note: note.trim() } : {}),
  };
  res.json(formatSession(session));
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// ── Server startup ────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`MergeMind API server running on http://localhost:${PORT}`);
});

// ── Analysis runner ───────────────────────────────────────────────────────────

function isGitHubUrl(repository: string): boolean {
  return /^https:\/\/github\.com\//i.test(repository.trim());
}

async function runAnalysis(session: SessionRecord): Promise<void> {
  try {
    const { featureRequest, branchA, branchB, codeA, codeB } = session.input;
    const baseBranch = session.input.baseBranch?.trim() || 'main';

    let changeAContent: string;
    let changeBContent: string;
    let snippetsA: { filePath: string; sourceType: SourceType; content: string }[] = [];
    let snippetsB: { filePath: string; sourceType: SourceType; content: string }[] = [];
    const ingestWarnings: string[] = [];

    // Map one contract change to engine input under the single-feed rule:
    // payload travels in fileSnippets when files exist, else in content.
    const toEngineFeed = (
      files: Array<{ path: string; content: string }>,
      branch: string,
    ): { content: string; snippets: typeof snippetsA } => {
      const usable = files.filter((f) => f.content.trim().length > 0);
      if (usable.length === 0) {
        return {
          content: `No textual differences between ${baseBranch} and ${branch}.`,
          snippets: [],
        };
      }
      return {
        content: '—',
        snippets: usable.map((f) => ({
          filePath: f.path,
          sourceType: SourceType.CODE_DIFF,
          content: f.content,
        })),
      };
    };

    if (isGitHubUrl(session.input.repository) && codeA === undefined && codeB === undefined) {
      // ── Real remote ingestion path (shared @mergemind/git-ingest contract) ──
      session.status = 'INGESTING';
      const ingested = await ingestRemoteRepository({
        repository: session.input.repository,
        baseBranch,
        changeA: branchA,
        changeB: branchB,
      });
      try {
        const semantic = buildSemanticAnalysisInput(
          changeSetFromIngestResult(ingested),
          featureRequest,
        );
        const distinctPaths = Array.from(
          new Set(semantic.changes.flatMap((c) => c.files.map((f) => f.path))),
        ).sort();
        session.filesChanged = distinctPaths.length;
        session.changedFiles = distinctPaths;
        ingestWarnings.push(...semantic.warnings.map((w) => `${w.code}: ${w.message}`));
        const byBranch = new Map(semantic.changes.map((c) => [c.branchName, c.files] as const));
        ({ content: changeAContent, snippets: snippetsA } = toEngineFeed(
          byBranch.get(branchA) ?? [],
          branchA,
        ));
        ({ content: changeBContent, snippets: snippetsB } = toEngineFeed(
          byBranch.get(branchB) ?? [],
          branchB,
        ));
      } finally {
        await ingested.cleanup();
      }
    } else {
      // ── Legacy path: caller-supplied code or placeholder (no clone) ──
      session.status = 'INGESTING';
      // Single-feed rule: the snippet carries the payload, content is inert.
      changeAContent = '—';
      changeBContent = '—';
      snippetsA = [
        {
          filePath: `${branchA}.ts`,
          sourceType: SourceType.CODE_DIFF,
          content: codeA ?? `Changes from branch: ${branchA}`,
        },
      ];
      snippetsB = [
        {
          filePath: `${branchB}.ts`,
          sourceType: SourceType.CODE_DIFF,
          content: codeB ?? `Changes from branch: ${branchB}`,
        },
      ];
    }

    session.status = 'ANALYZING';

    // Opt-in Bob analysis: when BOB_API_KEY is set, validated Bob assumptions
    // become additional engine input. Bob never bypasses the engine — the
    // deterministic pipeline below still makes the final verdict. Failures
    // surface as warnings, never as fabricated assumptions.
    const bobDiagnostics: string[] = [];
    const bobChanges: ChangeDescription[] = [];
    // Bob needs real diff text (the '—' placeholders above are engine-only).
    // Placeholder-only sessions skip Bob: nothing real to analyze.
    const bobDiffA = snippetsA.map((s) => s.content).join('\n') || changeAContent;
    const bobDiffB = snippetsB.map((s) => s.content).join('\n') || changeBContent;
    const hasBobInputs =
      (isGitHubUrl(session.input.repository) && codeA === undefined && codeB === undefined) ||
      codeA !== undefined ||
      codeB !== undefined;
    if ((process.env.BOB_API_KEY ?? '').trim().length > 0 && hasBobInputs) {
      try {
        const assist = await runBobAssist({
          requirementText: featureRequest,
          branchA,
          branchB,
          diffA: bobDiffA,
          diffB: bobDiffB,
        });
        // One combined Bob change with exact-duplicate lines removed: the five
        // agents analyze the same diffs (temperature 0), so identical claims
        // must not multiply into duplicate conflicts. Single-feed rule applies.
        const seen = new Set<string>();
        const uniqueLines: string[] = [];
        for (const t of assist.texts) {
          for (const line of t.content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || seen.has(trimmed)) continue;
            seen.add(trimmed);
            uniqueLines.push(trimmed);
          }
        }
        if (uniqueLines.length > 0) {
          const combined = uniqueLines.join('\n');
          bobChanges.push({
            id: 'change-bob-findings',
            label: 'Bob findings',
            content: '—',
            fileSnippets: [
              {
                filePath: 'bob-findings.txt',
                sourceType: SourceType.CODE_DIFF,
                content: combined,
              },
            ],
          });
        }
        bobDiagnostics.push(...assist.failures);
      } catch (e) {
        bobDiagnostics.push(
          `Bob analysis unavailable: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Build the AnalysisInput for the semantic engine
    const input: AnalysisInput = {
      sessionId: session.id,
      requirementText: featureRequest,
      changes: [
        {
          id: 'change-branch-a',
          label: branchA,
          content: changeAContent,
          fileSnippets: snippetsA.length > 0 ? snippetsA : undefined,
        },
        {
          id: 'change-branch-b',
          label: branchB,
          content: changeBContent,
          fileSnippets: snippetsB.length > 0 ? snippetsB : undefined,
        },
        ...bobChanges,
      ],
    };

    // Step 1: Extract assumptions
    const extractor = new DeterministicExtractor({ defaultSourceType: SourceType.CODE_DIFF });
    const pipeline = new ExtractionPipeline(extractor);
    const { assumptions, diagnostics } = await pipeline.run(input);
    const allDiagnostics = [...diagnostics, ...bobDiagnostics, ...ingestWarnings];

    // Step 2: Normalize
    const normalized = normalizeAssumptions(assumptions);

    session.status = 'VERIFYING';

    // Step 3: Detect conflicts
    const rawConflicts = detectConflicts(normalized);
    const reports = explainConflicts(normalized);

    // Step 4: Assemble result
    const hasConflictsFound = rawConflicts.length > 0;
    const result: SemanticAnalysisResult = {
      sessionId: session.id,
      status: hasConflictsFound ? AnalysisStatus.CONFLICTS_FOUND : AnalysisStatus.PASS,
      completedAt: new Date().toISOString(),
      assumptions,
      candidates: [],
      conflicts: rawConflicts,
      summary: hasConflictsFound
        ? `${rawConflicts.length} semantic conflict(s) detected. ${assumptions.length} assumptions extracted.`
        : `No semantic conflicts detected. ${assumptions.length} assumptions extracted and all agree.`,
      warnings: allDiagnostics.length > 0 ? allDiagnostics : undefined,
    };

    session.result = result;
    session.reports = reports;
    session.status = 'COMPLETE';
    session.completedAt = new Date().toISOString();

    console.log(
      `Session ${session.id}: ${result.status} — ${rawConflicts.length} conflicts, ${assumptions.length} assumptions`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Session ${session.id} error:`, message);
    session.status = 'ERROR';
    session.error = message;
    session.completedAt = new Date().toISOString();
  }
}

// ── Session serializer ────────────────────────────────────────────────────────

function formatSession(session: SessionRecord) {
  const base = {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    input: session.input,
    merge: session.merge ?? null,
  };

  if (session.status === 'ERROR') {
    return { ...base, error: session.error };
  }

  if (!session.result) return base;

  const r = session.result;
  return {
    ...base,
    result: {
      status: r.status,
      summary: r.summary,
      assumptionsFound: r.assumptions.length,
      conflictsFound: r.conflicts.length,
      filesChanged: session.filesChanged ?? null,
      changedFiles: session.changedFiles ?? [],
      conflicts: r.conflicts.map((c) => ({
        id: c.id,
        conflictType: c.conflictType,
        severity: c.severity,
        confidence: c.confidence,
        explanation: c.explanation,
        affectedEntity: c.affectedEntity,
        affectedFiles: c.affectedFiles ?? [],
      })),
      reports: session.reports ?? [],
      warnings: r.warnings ?? [],
    },
  };
}
