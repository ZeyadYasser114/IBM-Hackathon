/**
 * ingest.ts
 *
 * The single orchestration entry-point for the git-ingest pipeline.
 *
 * Flow:
 *   1. Resolve base branch SHA via adapter.resolveBranch()
 *   2. Resolve all feature branch SHAs
 *   3. Fetch ChangedFile[] per feature branch via adapter.getDiffs()
 *   4. Deduplicate (branch + path key, last write wins)
 *   5. Build CodeEvidence[] by re-parsing each file's patch
 *   6. Assemble and return RepositoryIngestResult
 *
 * The IngestAdapter interface is the only seam to the outside world.
 * Swap adapters to change the data source without touching this file.
 */

import { randomUUID } from 'node:crypto';

import type { BranchRef, ChangedFile, CodeEvidence, RepositorySource } from '@mergemind/domain';

import { parseDiff } from './diff-parser.js';
import { buildAllEvidence, buildEvidenceForFile } from './evidence-builder.js';

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

/**
 * The single interface every data-source adapter must implement.
 * Implementations: LocalGitAdapter, InMemoryAdapter, PastedDiffAdapter.
 */
export interface IngestAdapter {
  /**
   * Resolve a branch name to its current HEAD SHA.
   * Must return a stable BranchRef given the same name.
   */
  resolveBranch(name: string): Promise<BranchRef>;

  /**
   * Return ChangedFile records for every file that differs between
   * the base branch and the feature branch.
   *
   * @param base     The merge target (typically main)
   * @param feature  The branch being analysed
   */
  getDiffs(base: BranchRef, feature: BranchRef): Promise<ChangedFile[]>;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Human-supplied descriptor of the repository being ingested. */
export type RepositoryDescriptor = {
  /** Human-readable repository name, e.g. "acme/platform" */
  name: string;
  /**
   * Clone URL or local filesystem path.
   * Treated as opaque by the ingest layer; adapters resolve it.
   */
  cloneUrl: string;
  /**
   * Git hosting platform identifier ("github", "gitlab", "local", …).
   * Defaults to "local" when not supplied.
   */
  provider?: string;
};

/**
 * The complete, self-describing output of a single ingest run.
 *
 * Both `source` and `changedFiles` are needed by downstream packages:
 *   - `source`       → embedded into VerificationResult (audit trail)
 *   - `changedFiles` → fed into the AnalysisPipeline
 *   - `evidence`     → flat list of CodeEvidence records for quick lookup
 */
export type RepositoryIngestResult = {
  /** Self-describing repository metadata, pinned at ingest time */
  source: RepositorySource;
  /**
   * Deduplicated list of changed files across all feature branches.
   * One entry per (branchName, path) pair.
   */
  changedFiles: ChangedFile[];
  /**
   * Flat list of CodeEvidence records derived from the diffs.
   * One or more records per changed file (one per hunk for text files).
   * Consumers can use this directly instead of re-parsing `changedFiles`.
   */
  evidence: CodeEvidence[];
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full ingest pipeline for a repository.
 *
 * @param adapter             Data source (LocalGitAdapter / InMemoryAdapter / PastedDiffAdapter)
 * @param repo                Repository descriptor (name, url, provider)
 * @param baseBranchName      Target branch (e.g. "main")
 * @param featureBranchNames  One or more branches to compare against the base
 * @returns                   RepositoryIngestResult — fully populated, ready for analysis
 */
export async function createRepositoryContext(
  adapter: IngestAdapter,
  repo: RepositoryDescriptor,
  baseBranchName: string,
  featureBranchNames: string[],
): Promise<RepositoryIngestResult> {
  if (featureBranchNames.length === 0) {
    throw new Error('createRepositoryContext: at least one feature branch name is required');
  }

  const baseBranch = await adapter.resolveBranch(baseBranchName);

  const featureBranches: BranchRef[] = await Promise.all(
    featureBranchNames.map((name) => adapter.resolveBranch(name)),
  );

  // Fetch diffs per feature branch, then flatten
  const allFiles: ChangedFile[] = (
    await Promise.all(featureBranches.map((fb) => adapter.getDiffs(baseBranch, fb)))
  ).flat();

  // Deduplicate: last write wins for (branchName, path) pairs
  const changedFiles = deduplicateChangedFiles(allFiles);

  // Build CodeEvidence from each file's patch text
  const evidence = buildEvidenceFromChangedFiles(changedFiles);

  const source: RepositorySource = {
    id: randomUUID(),
    name: repo.name,
    cloneUrl: repo.cloneUrl,
    provider: repo.provider ?? 'local',
    baseBranch,
    featureBranches,
    resolvedAt: new Date().toISOString(),
  };

  return { source, changedFiles, evidence };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function deduplicateChangedFiles(files: ChangedFile[]): ChangedFile[] {
  const seen = new Map<string, ChangedFile>();
  for (const file of files) {
    seen.set(`${file.branchName}:${file.path}`, file);
  }
  return Array.from(seen.values());
}

/**
 * Derive CodeEvidence from the `patch` field of ChangedFile records.
 *
 * For files that have a patch: re-parse the patch to get hunk-level evidence.
 * For binary/null-patch files: produce one opaque evidence record.
 *
 * We re-parse rather than threading ParsedFile through the call chain so the
 * ChangedFile type stays clean and adapters don't need to carry parser state.
 */
export function buildEvidenceFromChangedFiles(files: ChangedFile[]): CodeEvidence[] {
  return files.flatMap((file) => {
    if (!file.patch) {
      // Binary or otherwise unpatchable — one opaque record
      const meta: Record<string, string> = { changeKind: file.kind };
      if (file.previousPath) meta['previousPath'] = file.previousPath;
      return [
        {
          source: 'FILE_CHANGE' as const,
          filePath: file.path,
          lineStart: null,
          lineEnd: null,
          snippet: null,
          branchName: file.branchName,
          metadata: meta,
        } satisfies CodeEvidence,
      ];
    }

    const parsedFiles = parseDiff(file.patch);
    if (parsedFiles.length === 0) {
      // Patch was non-empty but unparseable — one fallback record
      return [
        {
          source: 'FILE_CHANGE' as const,
          filePath: file.path,
          lineStart: null,
          lineEnd: null,
          snippet: null,
          branchName: file.branchName,
          metadata: { changeKind: file.kind, parseError: 'unparseable-patch' },
        } satisfies CodeEvidence,
      ];
    }

    // Use the first parsed entry (a ChangedFile patch covers exactly one file)
    const parsedFile = parsedFiles[0]!;
    return buildEvidenceForFile(parsedFile, file.branchName);
  });
}

// Re-export buildAllEvidence for callers that have ParsedFile[] directly
export { buildAllEvidence };
