/**
 * git.ts — local Git provider
 *
 * Calls the real Git binary via simple-git to produce a ChangeSet.
 * All Git-specific logic is isolated here; downstream code depends only on
 * the types in models/index.ts and the public API in src/index.ts.
 */
import type { BranchComparison, ChangeSet } from "../models/index.js";
/**
 * Sentinel value for headRef.
 * When passed as headRef, the provider diffs the working tree (staged +
 * unstaged) against the given baseRef instead of comparing two commits.
 */
export declare const WORKING_TREE: "WORKING_TREE";
export interface LocalGitIngestionOptions {
    /**
     * Absolute path to the repository root.
     * Defaults to process.cwd() when omitted.
     */
    repositoryPath?: string;
    /**
     * The base ref (branch, tag, or commit SHA) to compare against.
     * Example: "main"
     */
    baseRef: string;
    /**
     * The head ref to compare.
     * Pass the exported WORKING_TREE constant to diff the working tree
     * (staged + unstaged changes) against baseRef.
     * Example: "feature/org-billing" or WORKING_TREE
     */
    headRef: string;
    /**
     * Optional human-readable title for the change.
     * Example: "Add organization billing"
     */
    title?: string;
    /**
     * Optional human-readable summary.
     * Must NOT be a semantic conclusion — use it for caller-supplied
     * descriptions (PR title, task description, etc.).
     */
    summary?: string;
    /**
     * Maximum number of bytes to capture per file diff.
     * Prevents runaway memory usage on very large diffs.
     * Defaults to 500_000.
     */
    maxDiffBytesPerFile?: number;
}
/**
 * Ingest a local Git comparison and return a fully populated ChangeSet.
 *
 * Two modes:
 * - **Ref-to-ref** (default): uses three-dot notation (`base...head`) so the
 *   comparison is always relative to the common merge-base, matching PR semantics.
 * - **Working-tree**: pass `headRef: WORKING_TREE` to compare staged + unstaged
 *   changes against baseRef. mergeBase will be undefined in this mode.
 *
 * Output file order is deterministic (sorted by path) regardless of the order
 * git returns entries.
 */
export declare function ingestLocalGit(options: LocalGitIngestionOptions): Promise<ChangeSet>;
/**
 * Simplified entry point that Omar (and other callers) can use directly.
 *
 * Defaults to process.cwd() as the repository path.
 *
 * ```ts
 * const changeSet = await ingestChanges("main", "feature/billing");
 * // or to inspect working-tree changes:
 * const changeSet = await ingestChanges("main", WORKING_TREE);
 * ```
 */
export declare function ingestChanges(baseRef: string, headRef: string, options?: Omit<LocalGitIngestionOptions, "baseRef" | "headRef">): Promise<ChangeSet>;
/**
 * Produce a lightweight BranchComparison without loading full diff data.
 * Useful for UI summaries and pre-flight checks before committing to a full
 * ingestLocalGit call.
 */
export declare function compareBranches(repositoryPath: string, baseRef: string, headRef: string): Promise<BranchComparison>;
//# sourceMappingURL=git.d.ts.map