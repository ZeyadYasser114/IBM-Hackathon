/**
 * semantic-input.ts
 *
 * Shared ingestion contract (Amr's contract): the single shape that carries
 * repository changes from any ingestion adapter into semantic analysis.
 *
 * Pipeline position:
 *
 *   IngestAdapter → ingestChanges / createRepositoryContext
 *       → ChangeSet → buildSemanticAnalysisInput → SemanticAnalysisInput
 *       → (consumer maps to engine AnalysisInput) → semantic engine
 *
 * Single-feed rule (duplicate-conflict prevention):
 *   A change carries its payload EITHER in `content` (no per-file data) OR in
 *   `files` (per-file data present). When files are present, `content` is the
 *   placeholder '—' so the engine extracts each claim exactly once instead of
 *   reporting one logical conflict per overlapping evidence source.
 *   Consumers must skip files whose content is empty (e.g. binary files) —
 *   the engine rejects empty snippets.
 */

import type { BranchRef, ChangedFile, ChangeKind } from '@mergemind/domain';

import { parseDiff } from './diff-parser.js';
import type { IngestAdapter, RepositoryDescriptor } from './ingest.js';
import type { RemoteIngestResult } from './adapters/remote-git.js';

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

/** Where a change record originated. */
export type ChangeSource = 'GIT_DIFF' | 'PASTED_DIFF' | 'API';

/** One auditable evidence excerpt inside a changed file. */
export interface EvidenceSnippet {
  filePath: string;
  branchName: string;
  lineStart: number | null;
  lineEnd: number | null;
  snippet: string | null;
  source: ChangeSource;
}

/** One changed file with its evidence attached. */
export interface FileChangeInput {
  path: string;
  kind: ChangeKind;
  patch: string | null;
  additions: number;
  deletions: number;
  language: string | null;
  branchName: string;
  evidence: EvidenceSnippet[];
}

/** The diff of one head ref against the base, with ingestion warnings. */
export interface BranchComparison {
  base: BranchRef;
  head: BranchRef;
  files: FileChangeInput[];
  warnings: IngestionWarning[];
}

/** Non-fatal ingestion observations (binary files, unparseable patches, caps). */
export interface IngestionWarning {
  code: string;
  message: string;
}

/** All compared changes for one repository snapshot. */
export interface ChangeSet {
  repository: { name: string; cloneUrl: string; provider: string };
  baseBranch: string;
  comparisons: BranchComparison[];
  source: ChangeSource;
}

/** One engine-ready change: payload in `files` when present, else `content`. */
export interface SemanticChangeInput {
  id: string;
  label: string;
  branchName: string;
  /** Payload when `files` is empty; otherwise the '—' placeholder (single-feed rule). */
  content: string;
  files: Array<{ path: string; content: string }>;
}

/** Consumer-neutral semantic payload (consumers map it to engine input). */
export interface SemanticAnalysisInput {
  requirementText: string;
  changes: SemanticChangeInput[];
  warnings: IngestionWarning[];
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Per-file characters forwarded to analysis (cost bound). */
export const MAX_FILE_CHARS = 20_000;
/** Files forwarded per change (cost bound). */
export const MAX_FILES_PER_CHANGE = 50;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const MAX_SNIPPET_LINES = 5;

/**
 * Compare two refs through any IngestAdapter and return a structured
 * BranchComparison. Never throws for diff-level problems — those become
 * warnings; only branch-resolution failures reject.
 */
export async function ingestChanges(
  adapter: IngestAdapter,
  repo: RepositoryDescriptor,
  baseName: string,
  headName: string,
  source: ChangeSource = 'GIT_DIFF',
): Promise<BranchComparison> {
  const base = await adapter.resolveBranch(baseName);
  const head = await adapter.resolveBranch(headName);
  const changed = await adapter.getDiffs(base, head);
  const files = changed
    .filter((f) => f.branchName === head.name)
    .map((f) => toFileChangeInput(f, source));
  const warnings: IngestionWarning[] = [];
  for (const f of files) {
    if (!f.patch) {
      warnings.push({
        code: 'BINARY_OR_EMPTY_PATCH',
        message: `${f.path} on ${head.name} has no textual patch — excluded from semantic input`,
      });
    }
  }
  return { base, head, files, warnings };
}

function toEvidence(
  filePath: string,
  branchName: string,
  headStart: number,
  headCount: number,
  lines: string[],
  source: ChangeSource,
): EvidenceSnippet {
  const lineStart = headStart > 0 ? headStart : null;
  return {
    filePath,
    branchName,
    lineStart,
    lineEnd: lineStart !== null && headCount > 0 ? lineStart + headCount - 1 : lineStart,
    snippet: lines.length > 0 ? lines.slice(0, MAX_SNIPPET_LINES).join('\n') : null,
    source,
  };
}

function toFileChangeInput(file: ChangedFile, source: ChangeSource): FileChangeInput {
  if (!file.patch) {
    return {
      path: file.path,
      kind: file.kind,
      patch: file.patch,
      additions: file.additions,
      deletions: file.deletions,
      language: file.language,
      branchName: file.branchName,
      evidence: [],
    };
  }
  const parsed = parseDiff(file.patch);
  const entry = parsed.length > 0 ? parsed[0]! : null;
  const evidence =
    entry !== null && !entry.isBinary
      ? entry.hunks.map((h) =>
          toEvidence(
            entry.path,
            file.branchName,
            h.headStart,
            h.headCount,
            h.addedLines.concat(h.removedLines),
            source,
          ),
        )
      : [];
  return {
    path: file.path,
    kind: file.kind,
    patch: file.patch,
    additions: file.additions,
    deletions: file.deletions,
    language: file.language,
    branchName: file.branchName,
    evidence,
  };
}

/**
 * Build a ChangeSet from a completed ingestRemoteRepository run.
 * Groups the deduplicated changed files under their head refs so every
 * verified change is represented even when its diff is empty.
 */
export function changeSetFromIngestResult(
  result: RemoteIngestResult,
  source: ChangeSource = 'GIT_DIFF',
): ChangeSet {
  const byBranch = new Map<string, ChangedFile[]>();
  for (const file of result.changedFiles) {
    const list = byBranch.get(file.branchName) ?? [];
    list.push(file);
    byBranch.set(file.branchName, list);
  }
  const comparisons: BranchComparison[] = [result.changeARef, result.changeBRef].map((head) => {
    const files = (byBranch.get(head.name) ?? []).map((f) => toFileChangeInput(f, source));
    const warnings: IngestionWarning[] = [];
    for (const f of files) {
      if (!f.patch) {
        warnings.push({
          code: 'BINARY_OR_EMPTY_PATCH',
          message: `${f.path} on ${head.name} has no textual patch — excluded from semantic input`,
        });
      }
    }
    return { base: result.base, head, files, warnings };
  });
  return {
    repository: {
      name: result.parsed.name,
      cloneUrl: result.parsed.canonicalUrl,
      provider: 'github',
    },
    baseBranch: result.base.name,
    comparisons,
    source,
  };
}

/**
 * Build the consumer-neutral semantic payload from a ChangeSet.
 * Applies the single-feed rule and the forwarding caps (overflow → warnings).
 */
export function buildSemanticAnalysisInput(
  changeSet: ChangeSet,
  requirementText: string,
): SemanticAnalysisInput {
  const warnings: IngestionWarning[] = changeSet.comparisons.flatMap((c) => c.warnings);
  const changes: SemanticChangeInput[] = changeSet.comparisons.map((comparison, idx) => {
    const withPatch = comparison.files.filter((f) => f.patch && f.patch.trim().length > 0);
    const forwarded = withPatch.slice(0, MAX_FILES_PER_CHANGE);
    if (withPatch.length > forwarded.length) {
      warnings.push({
        code: 'FILES_TRUNCATED',
        message: `${comparison.head.name}: forwarded ${forwarded.length} of ${withPatch.length} files`,
      });
    }
    const files = forwarded.map((f) => ({
      path: f.path,
      content: (f.patch as string).slice(0, MAX_FILE_CHARS),
    }));
    return {
      id: `change-${idx}-${comparison.head.name}`,
      label: comparison.head.name,
      branchName: comparison.head.name,
      content: files.length > 0 ? '—' : `No textual differences for ${comparison.head.name}.`,
      files,
    };
  });
  return { requirementText, changes, warnings };
}
