/**
 * verify.ts — shared verification runner for the MCP tools.
 *
 * Both tools run the same deterministic semantic-engine pipeline the API
 * server uses (no LLM calls, no invented findings):
 *
 *   AnalysisInput → ExtractionPipeline → normalizeAssumptions → explainConflicts
 *
 * `verifyChanges` analyses caller-supplied change text.
 * `verifyGitHubRepository` clones a public GitHub repository (source text
 * only — repository code is never executed) and analyses the real diffs.
 */

import {
  DeterministicExtractor,
  ExtractionPipeline,
  normalizeAssumptions,
  explainConflicts,
  assertValidAnalysisInput,
  SourceType,
} from '@mergemind/semantic-engine';
import type { AnalysisInput, ConflictReport } from '@mergemind/semantic-engine';
import {
  ingestRemoteRepository,
  changeSetFromIngestResult,
  buildSemanticAnalysisInput,
} from '@mergemind/git-ingest';

export interface TextChange {
  label: string;
  content: string;
  filePath?: string | undefined;
}

export interface VerificationOutcome {
  status: 'PASS' | 'CONFLICTS_FOUND';
  assumptionsFound: number;
  conflictsFound: number;
  summary: string;
  reports: readonly ConflictReport[];
  filesChanged: number | null;
}

function toFileSnippet(changeId: string, change: TextChange) {
  const filePath = change.filePath?.trim() || `${changeId}.diff`;
  return {
    filePath,
    sourceType: SourceType.CODE_DIFF,
    content: change.content,
  };
}

/**
 * Verify two caller-supplied changes against a requirement.
 * Pure engine analysis — no network, no filesystem access.
 */
export async function verifyChanges(
  sessionId: string,
  requirementText: string,
  changeA: TextChange,
  changeB: TextChange,
): Promise<VerificationOutcome> {
  if (!requirementText || requirementText.trim().length === 0) {
    throw new Error('requirementText must be a non-empty string');
  }
  for (const [name, change] of [
    ['changeA', changeA],
    ['changeB', changeB],
  ] as const) {
    if (!change || !change.label?.trim() || !change.content?.trim()) {
      throw new Error(`${name}.label and ${name}.content must be non-empty strings`);
    }
  }

  const input: AnalysisInput = {
    sessionId,
    requirementText,
    // Single-feed rule: the snippet carries the payload, content is inert,
    // so each claim is extracted exactly once (no duplicate conflicts).
    changes: [
      {
        id: 'change-a',
        label: changeA.label,
        content: '—',
        fileSnippets: [toFileSnippet('change-a', changeA)],
      },
      {
        id: 'change-b',
        label: changeB.label,
        content: '—',
        fileSnippets: [toFileSnippet('change-b', changeB)],
      },
    ],
  };
  assertValidAnalysisInput(input);

  const pipeline = new ExtractionPipeline(
    new DeterministicExtractor({ defaultSourceType: SourceType.CODE_DIFF }),
  );
  const { assumptions } = await pipeline.run(input);
  const normalized = normalizeAssumptions(assumptions);
  const reports = explainConflicts(normalized);

  return {
    status: reports.length > 0 ? 'CONFLICTS_FOUND' : 'PASS',
    assumptionsFound: assumptions.length,
    conflictsFound: reports.length,
    summary:
      reports.length > 0
        ? `${reports.length} semantic conflict(s) detected. ${assumptions.length} assumptions extracted.`
        : `No semantic conflicts detected. ${assumptions.length} assumptions extracted and all agree.`,
    reports,
    filesChanged: null,
  };
}

export interface GitHubVerifyOptions {
  repository: string;
  baseBranch?: string;
  changeA: string;
  changeB: string;
  featureRequest: string;
}

export interface GitHubVerificationOutcome extends VerificationOutcome {
  changedFiles: string[];
}

/**
 * Verify two real branches/commits of a public GitHub repository.
 * Clones into a temp dir, diffs both changes against the base, analyses the
 * real diff text, and always cleans up. Repository code is never executed.
 */
export async function verifyGitHubRepository(
  sessionId: string,
  options: GitHubVerifyOptions,
): Promise<GitHubVerificationOutcome> {
  if (!options.featureRequest || options.featureRequest.trim().length === 0) {
    throw new Error('featureRequest must be a non-empty string');
  }
  const ingested = await ingestRemoteRepository({
    repository: options.repository,
    baseBranch: options.baseBranch?.trim() || 'main',
    changeA: options.changeA,
    changeB: options.changeB,
  });

  try {
    // Shared ingestion contract: single-feed rule already applied, so each
    // claim is extracted exactly once (no duplicate conflicts).
    const semantic = buildSemanticAnalysisInput(
      changeSetFromIngestResult(ingested),
      options.featureRequest,
    );

    const toChange = (change: (typeof semantic.changes)[number]) => {
      const fileSnippets = change.files
        .filter((f) => f.content.trim().length > 0)
        .map((f) => ({
          filePath: f.path,
          sourceType: SourceType.CODE_DIFF,
          content: f.content,
        }));
      return {
        id: change.id,
        label: change.label,
        content: change.content,
        ...(fileSnippets.length > 0 ? { fileSnippets } : {}),
      };
    };

    const input: AnalysisInput = {
      sessionId,
      requirementText: semantic.requirementText,
      changes: semantic.changes.map(toChange),
    };
    assertValidAnalysisInput(input);

    const pipeline = new ExtractionPipeline(
      new DeterministicExtractor({ defaultSourceType: SourceType.CODE_DIFF }),
    );
    const { assumptions } = await pipeline.run(input);
    const normalized = normalizeAssumptions(assumptions);
    const reports = explainConflicts(normalized);

    const changedFiles = Array.from(new Set(ingested.changedFiles.map((f) => f.path)));
    return {
      status: reports.length > 0 ? 'CONFLICTS_FOUND' : 'PASS',
      assumptionsFound: assumptions.length,
      conflictsFound: reports.length,
      summary:
        reports.length > 0
          ? `${reports.length} semantic conflict(s) detected. ${assumptions.length} assumptions extracted.`
          : `No semantic conflicts detected. ${assumptions.length} assumptions extracted and all agree.`,
      reports,
      filesChanged: changedFiles.length,
      changedFiles,
    };
  } finally {
    await ingested.cleanup();
  }
}
