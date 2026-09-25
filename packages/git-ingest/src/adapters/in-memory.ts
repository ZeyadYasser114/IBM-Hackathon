/**
 * adapters/in-memory.ts
 *
 * IngestAdapter backed entirely by data passed at construction time.
 * Used in tests and as an integration path when the caller has already
 * resolved branches and computed diffs externally (e.g. via the tRPC API).
 */

import type { BranchRef, ChangedFile } from '@mergemind/domain';
import type { IngestAdapter } from '../ingest.js';

/**
 * In-memory adapter — no filesystem or network access.
 *
 * @param branches     Map of branch name → BranchRef (must include base + all features)
 * @param changedFiles Pre-computed ChangedFile records (all branches combined)
 *
 * `getDiffs` returns the full `changedFiles` list regardless of which base/feature
 * pair is requested. This is intentional: the caller already knows which files
 * belong to which branch via `ChangedFile.branchName`.
 */
export class InMemoryAdapter implements IngestAdapter {
  constructor(
    private readonly branches: Map<string, BranchRef>,
    private readonly changedFiles: ChangedFile[],
  ) {}

  async resolveBranch(name: string): Promise<BranchRef> {
    const ref = this.branches.get(name);
    if (!ref) throw new Error(`InMemoryAdapter: branch '${name}' not registered`);
    return ref;
  }

  async getDiffs(_base: BranchRef, feature: BranchRef): Promise<ChangedFile[]> {
    // Return only files belonging to this feature branch
    return this.changedFiles.filter((f) => f.branchName === feature.name);
  }
}
