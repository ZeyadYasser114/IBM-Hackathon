/**
 * @mergemind/git-ingest
 *
 * Responsible for turning a repository location + branch names into the
 * structured source metadata (`RepositorySource`) and per-file diff records
 * (`ChangedFile`) that the rest of the pipeline consumes.
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

import { randomUUID } from 'node:crypto';

import type { BranchRef, ChangedFile, RepositorySource } from '@mergemind/domain';

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

export interface IngestAdapter {
  /** Return the HEAD SHA for a named branch */
  resolveBranch(name: string): Promise<BranchRef>;
  /** Return diffs for every file changed on a feature branch relative to base */
  getDiffs(base: BranchRef, feature: BranchRef): Promise<ChangedFile[]>;
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

  async getDiffs(base: BranchRef, feature: BranchRef): Promise<ChangedFile[]> {
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
  constructor(
    private readonly branches: Map<string, BranchRef>,
    private readonly changedFiles: ChangedFile[],
  ) {}

  async resolveBranch(name: string): Promise<BranchRef> {
    const ref = this.branches.get(name);
    if (!ref) throw new Error(`Branch '${name}' not found in InMemoryAdapter`);
    return ref;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getDiffs(_base: BranchRef, _feature: BranchRef): Promise<ChangedFile[]> {
    return this.changedFiles;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/** Human-supplied repository descriptor — resolved into a RepositorySource. */
export type RepositoryDescriptor = {
  /** Human-readable repository name, e.g. "acme/platform" */
  name: string;
  /**
   * Clone URL or local filesystem path.
   * Treated as opaque here; adapters resolve it to actual diffs.
   */
  cloneUrl: string;
  /**
   * Git hosting platform identifier ("github", "local", …).
   * Defaults to "local".
   */
  provider?: string;
};

/** The ingest result: self-describing source metadata plus file diffs. */
export type RepositoryIngestResult = {
  source: RepositorySource;
  changedFiles: ChangedFile[];
};

export async function createRepositoryContext(
  adapter: IngestAdapter,
  repo: RepositoryDescriptor,
  baseBranchName: string,
  featureBranchNames: string[],
): Promise<RepositoryIngestResult> {
  const baseBranch = await adapter.resolveBranch(baseBranchName);
  const featureBranches: BranchRef[] = await Promise.all(
    featureBranchNames.map((name) => adapter.resolveBranch(name)),
  );

  const allChangedFiles: ChangedFile[] = (
    await Promise.all(featureBranches.map((fb) => adapter.getDiffs(baseBranch, fb)))
  ).flat();

  // Deduplicate by branch + path (last write wins — deterministic for identical paths)
  const changedFiles = deduplicateChangedFiles(allChangedFiles);

  const source: RepositorySource = {
    id: randomUUID(),
    name: repo.name,
    cloneUrl: repo.cloneUrl,
    provider: repo.provider ?? 'local',
    baseBranch,
    featureBranches,
    resolvedAt: new Date().toISOString(),
  };

  return { source, changedFiles };
}

// ---------------------------------------------------------------------------
// Diff parser helpers
// ---------------------------------------------------------------------------

/**
 * Very lightweight unified-diff parser.
 * Splits a multi-file diff output into per-file ChangedFile records.
 * Does not attempt full hunk parsing — the raw patch is preserved for agents.
 */
export function parseDiffOutput(raw: string, branchName: string): ChangedFile[] {
  const results: ChangedFile[] = [];
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

    results.push({
      path,
      kind: inferChangeKind(chunk),
      patch: `diff --git ${chunk}`,
      additions,
      deletions,
      branchName,
      language: inferLanguage(path),
    });
  }

  return results;
}

/**
 * Infer the change kind from diff markers.
 * Defaults to MODIFIED when no creation/deletion marker is present.
 */
function inferChangeKind(chunk: string): ChangedFile['kind'] {
  if (/^new file mode/m.test(chunk)) return 'ADDED';
  if (/^deleted file mode/m.test(chunk)) return 'DELETED';
  return 'MODIFIED';
}

/**
 * Best-effort language hint from the file extension.
 * Null when the extension is unknown — agents must not treat it as authoritative.
 */
function inferLanguage(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'py':
      return 'python';
    case 'sql':
      return 'sql';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'json':
      return 'json';
    case 'toml':
      return 'toml';
    case 'md':
    case 'mdx':
      return 'markdown';
    case 'css':
    case 'scss':
      return 'css';
    default:
      return null;
  }
}

function deduplicateChangedFiles(files: ChangedFile[]): ChangedFile[] {
  const seen = new Map<string, ChangedFile>();
  for (const file of files) {
    seen.set(`${file.branchName}:${file.path}`, file);
  }
  return Array.from(seen.values());
}
