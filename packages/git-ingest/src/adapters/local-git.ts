/**
 * adapters/local-git.ts
 *
 * IngestAdapter that reads from a real on-disk Git repository.
 * All Git CLI calls are routed through the `GitRunner` interface so they can
 * be replaced in tests without spawning real processes.
 *
 * Shell isolation:
 *   The only public surface for shell access is `GitRunner`.
 *   `LocalGitAdapter` depends on `GitRunner`, not on `child_process` directly.
 *   Tests that need deterministic output inject a `MockGitRunner`.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { BranchRef, ChangedFile } from '@mergemind/domain';

import { parseDiff, inferLanguage } from '../diff-parser.js';
import type { IngestAdapter } from '../ingest.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// GitRunner interface — the only seam between this adapter and the OS
// ---------------------------------------------------------------------------

/**
 * Thin abstraction over `git` CLI execution.
 * Inject `RealGitRunner` in production; inject a mock in tests.
 */
export interface GitRunner {
  /**
   * Execute a git subcommand and return stdout as a string.
   * Should throw an Error (with message) on non-zero exit.
   *
   * @param args   Git arguments, e.g. ['rev-parse', 'main']
   * @param cwd    Absolute path to the repository root
   */
  run(args: string[], cwd: string): Promise<string>;
}

/**
 * Production GitRunner — delegates to the real `git` binary.
 */
export class RealGitRunner implements GitRunner {
  async run(args: string[], cwd: string): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 50 * 1024 * 1024 });
    return stdout;
  }
}

// ---------------------------------------------------------------------------
// LocalGitAdapter
// ---------------------------------------------------------------------------

/**
 * Reads an on-disk Git repository via the `git` CLI.
 *
 * @param repoPath  Absolute path to the repository root
 * @param runner    GitRunner to use (defaults to RealGitRunner)
 */
export class LocalGitAdapter implements IngestAdapter {
  private readonly runner: GitRunner;

  constructor(
    private readonly repoPath: string,
    runner?: GitRunner,
  ) {
    this.runner = runner ?? new RealGitRunner();
  }

  async resolveBranch(name: string): Promise<BranchRef> {
    const sha = (await this.runner.run(['rev-parse', name], this.repoPath)).trim();
    return { name, sha };
  }

  async getDiffs(base: BranchRef, feature: BranchRef): Promise<ChangedFile[]> {
    // --unified=3 keeps 3 lines of context — standard readable diff
    const raw = await this.runner.run(
      ['diff', '--unified=3', `${base.sha}...${feature.sha}`],
      this.repoPath,
    );
    return parseDiff(raw).map((f) => ({
      path: f.path,
      ...(f.previousPath !== undefined ? { previousPath: f.previousPath } : {}),
      kind: f.kind,
      patch: f.patch,
      additions: f.additions,
      deletions: f.deletions,
      branchName: feature.name,
      language: inferLanguage(f.path),
    }));
  }
}
