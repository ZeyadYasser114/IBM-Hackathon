/**
 * MergeMind API Server
 *
 * Exposes:
 *   POST /api/verify        — start a semantic verification run
 *   GET  /api/session/:id   — poll a session result
 *   GET  /api/health        — health check
 *
 * Uses the deterministic semantic-engine package from hassan-dev branch.
 * No external AI calls needed — the engine runs locally.
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
  SemanticAnalysisResult,
  ConflictReport,
} from '@mergemind/semantic-engine';

// ── Types for the HTTP API ────────────────────────────────────────────────────

interface VerifyRequest {
  repository: string;
  featureRequest: string;
  branchA: string;
  branchB: string;
  /** Optional code diffs for each branch */
  codeA?: string;
  codeB?: string;
}

interface SessionRecord {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR';
  input: VerifyRequest;
  startedAt: string;
  completedAt?: string;
  result?: SemanticAnalysisResult;
  /** Full explainable reports — served to UI clients so findings need no re-derivation. */
  reports?: readonly ConflictReport[];
  error?: string;
}

// ── In-memory session store ───────────────────────────────────────────────────

const sessions = new Map<string, SessionRecord>();

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

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

  const sessionId = uuidv4();
  const session: SessionRecord = {
    id: sessionId,
    status: 'PENDING',
    input: body,
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

async function runAnalysis(session: SessionRecord): Promise<void> {
  session.status = 'RUNNING';

  try {
    const { featureRequest, branchA, branchB, codeA, codeB } = session.input;

    // Build the AnalysisInput for the semantic engine
    const input: AnalysisInput = {
      sessionId: session.id,
      requirementText: featureRequest,
      changes: [
        {
          id: 'change-branch-a',
          label: branchA,
          content: codeA ?? `Changes from branch: ${branchA}`,
          fileSnippets: codeA
            ? [
                {
                  filePath: `${branchA}.ts`,
                  sourceType: SourceType.CODE_DIFF,
                  content: codeA,
                },
              ]
            : undefined,
        },
        {
          id: 'change-branch-b',
          label: branchB,
          content: codeB ?? `Changes from branch: ${branchB}`,
          fileSnippets: codeB
            ? [
                {
                  filePath: `${branchB}.ts`,
                  sourceType: SourceType.CODE_DIFF,
                  content: codeB,
                },
              ]
            : undefined,
        },
      ],
    };

    // Step 1: Extract assumptions
    const extractor = new DeterministicExtractor({ defaultSourceType: SourceType.CODE_DIFF });
    const pipeline = new ExtractionPipeline(extractor);
    const { assumptions, diagnostics } = await pipeline.run(input);

    // Step 2: Normalize
    const normalized = normalizeAssumptions(assumptions);

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
      warnings: diagnostics.length > 0 ? diagnostics : undefined,
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
