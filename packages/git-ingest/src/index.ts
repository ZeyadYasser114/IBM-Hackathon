/**
 * @mergemind/git-ingest
 *
 * Responsible for turning a repository location + branch names into the
 * structured RepositoryContext that the rest of the pipeline consumes.
 *
 * EXTENSION POINT
 * ---------------
 * Implement `IngestAdapter` to support new repository sources:
 *   - LocalGitAdapter  — reads an on-disk Git repo via `git diff`
 *   - GithubApiAdapter — fetches diffs via the GitHub REST API
 *   - PastedDiffAdapter — accepts raw diff text pasted by the user
 *
 * The `createRepositoryContext` function is the single entry point used by
 * the API layer. Swap the adapter without touching any other package.
 */

import type { BranchRef, FileDiff, RepositoryContext } from '@mergemind/domain';

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

export interface IngestAdapter {
  /** Return the HEAD SHA for a named branch */
  resolveBranch(name: string): Promise<BranchRef>;
  /** Return unified diffs for every file changed on a feature branch relative to base */
  getDiffs(base: BranchRef, feature: BranchRef): Promise<FileDiff[]>;
}

// ---------------------------------------------------------------------------
// Local Git adapter (uses child_process to call `git`)
// ---------------------------------------------------------------------------

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Reads an on-disk Git repository.
 *
 * @param repoPath — absolute path to the repository root
 */
export class LocalGitAdapter implements IngestAdapter {
  constructor(private readonly repoPath: string) {}

  async resolveBranch(name: string): Promise<BranchRef> {
    const { stdout } = await execFileAsync('git', ['rev-parse', name], {
      cwd: this.repoPath,
    });
    return { name, sha: stdout.trim() };
  }

  async getDiffs(base: BranchRef, feature: BranchRef): Promise<FileDiff[]> {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--unified=3', `${base.sha}...${feature.sha}`],
      { cwd: this.repoPath },
    );
    return parseDiffOutput(stdout, feature.name);
  }
}

// ---------------------------------------------------------------------------
// In-memory adapter for tests and fixtures
// ---------------------------------------------------------------------------

export class InMemoryAdapter implements IngestAdapter {
  constructor(private readonly branches: Map<string, BranchRef>, private readonly diffs: FileDiff[]) {}

  async resolveBranch(name: string): Promise<BranchRef> {
    const ref = this.branches.get(name);
    if (!ref) throw new Error(`Branch '${name}' not found in InMemoryAdapter`);
    return ref;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getDiffs(_base: BranchRef, _feature: BranchRef): Promise<FileDiff[]> {
    return this.diffs;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function createRepositoryContext(
  adapter: IngestAdapter,
  repoName: string,
  repoLocation: string,
  baseBranchName: string,
  featureBranchNames: string[],
): Promise<RepositoryContext> {
  const baseBranch = await adapter.resolveBranch(baseBranchName);
  const featureBranches: BranchRef[] = await Promise.all(
    featureBranchNames.map((name) => adapter.resolveBranch(name)),
  );

  const allDiffs: FileDiff[] = (
    await Promise.all(featureBranches.map((fb) => adapter.getDiffs(baseBranch, fb)))
  ).flat();

  // Deduplicate by path (last write wins — deterministic for identical paths)
  const dedupedDiffs = deduplicateDiffs(allDiffs);

  return {
    name: repoName,
    location: repoLocation,
    baseBranch,
    featureBranches,
    diffs: dedupedDiffs,
  };
}

// ---------------------------------------------------------------------------
// Diff parser helpers
// ---------------------------------------------------------------------------

/**
 * Very lightweight unified-diff parser.
 * Splits a multi-file diff output into per-file FileDiff records.
 * Does not attempt full hunk parsing — the raw patch is preserved for agents.
 */
export function parseDiffOutput(raw: string, _branchName: string): FileDiff[] {
  const results: FileDiff[] = [];
  // Split on "diff --git" header lines
  const chunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    // First line: "a/<path> b/<path>"
    const header = lines[0] ?? '';
    const match = header.match(/^a\/(.+?) b\/(.+)$/);
    if (!match) continue;
    const path = match[2] ?? match[1] ?? '';

    let additions = 0;
    let deletions = 0;
    for (const line of lines.slice(1)) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }

    results.push({ path, patch: `diff --git ${chunk}`, additions, deletions });
  }

  return results;
}

function deduplicateDiffs(diffs: FileDiff[]): FileDiff[] {
  const seen = new Map<string, FileDiff>();
  for (const diff of diffs) {
    seen.set(diff.path, diff);
  }
  return Array.from(seen.values());
}
