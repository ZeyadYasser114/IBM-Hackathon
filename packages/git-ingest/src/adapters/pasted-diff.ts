/**
 * adapters/pasted-diff.ts
 *
 * IngestAdapter that ingests a raw unified-diff string supplied directly
 * by the user (e.g. copied from a PR, CI log, or `git diff` terminal output).
 *
 * Use cases:
 *   - UI "paste a diff" input mode
 *   - Offline / air-gapped environments with no Git CLI
 *   - Tests that need a real diff without a real repo
 *
 * Because the raw text is already the diff, `getDiffs` simply parses it.
 * `resolveBranch` manufactures synthetic BranchRefs with a placeholder SHA
 * (since there is no Git history to resolve against).
 *
 * Limitations:
 *   - Branch SHAs are synthetic ("0000…" + a hash of the branch name).
 *   - All files in the diff are attributed to the supplied feature branch name.
 *   - Only one base and one feature branch are supported per adapter instance.
 */

import type { BranchRef, ChangedFile } from '@mergemind/domain';

import { parseDiff, inferLanguage } from '../diff-parser.js';
import type { IngestAdapter } from '../ingest.js';

/**
 * Create a reproducible but clearly synthetic SHA for a branch name.
 * Uses a simple string hash so the value is stable across runs.
 */
function syntheticSha(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').repeat(5); // 40 hex chars
}

/**
 * IngestAdapter that parses a pre-supplied unified-diff string.
 *
 * @param rawDiff         The full `git diff` text (may contain multiple files)
 * @param featureBranch   Name to assign to the feature branch
 * @param baseBranchName  Name to use for the base branch (default: "main")
 */
export class PastedDiffAdapter implements IngestAdapter {
  private readonly baseName: string;
  private readonly featureName: string;
  private readonly parsed: ChangedFile[];

  constructor(rawDiff: string, featureBranch: string, baseBranchName = 'main') {
    this.baseName = baseBranchName;
    this.featureName = featureBranch;

    // Parse eagerly so errors surface at construction time, not at ingest time
    this.parsed = parseDiff(rawDiff).map((f) => ({
      path: f.path,
      ...(f.previousPath !== undefined ? { previousPath: f.previousPath } : {}),
      kind: f.kind,
      patch: f.patch,
      additions: f.additions,
      deletions: f.deletions,
      branchName: featureBranch,
      language: inferLanguage(f.path),
    }));
  }

  async resolveBranch(name: string): Promise<BranchRef> {
    // Manufacture a synthetic SHA from the branch name so the record is
    // deterministic and clearly not a real Git SHA.
    return { name, sha: syntheticSha(name) };
  }

  async getDiffs(_base: BranchRef, _feature: BranchRef): Promise<ChangedFile[]> {
    return this.parsed;
  }

  /** Expose the parsed files for direct inspection in tests and examples. */
  get files(): ReadonlyArray<ChangedFile> {
    return this.parsed;
  }

  /** Number of files parsed from the supplied diff. */
  get fileCount(): number {
    return this.parsed.length;
  }
}
