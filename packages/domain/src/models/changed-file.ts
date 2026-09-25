/**
 * changed-file.ts
 *
 * A file-level diff record with richer metadata than a raw unified-diff string.
 * `ChangedFile` is produced by git-ingest and consumed by all analysis agents.
 *
 * Serialization notes
 * -------------------
 * - `patch` may be null for binary files or files that exceed the diff size limit.
 * - `previousPath` is only set when `kind === 'RENAMED'`.
 * - `language` is a best-effort hint; agents must not treat it as authoritative.
 */

import type { ChangeKind } from '../enums.js';

/**
 * A single file that changed in a feature branch relative to the base branch.
 */
export type ChangedFile = {
  /**
   * Repository-relative path of the file **after** the change.
   * Uses forward slashes regardless of the host OS.
   * Example: "src/auth/roles.ts"
   */
  path: string;
  /**
   * Nature of the change from the base branch's perspective.
   * @see ChangeKind
   */
  kind: ChangeKind;
  /**
   * Previous path, set only when `kind === 'RENAMED'`.
   * Undefined / absent for all other change kinds.
   */
  previousPath?: string;
  /**
   * Unified diff text (patch format).
   * Null when the file is binary or the diff was too large to include.
   */
  patch: string | null;
  /** Number of lines added in this file */
  additions: number;
  /** Number of lines removed in this file */
  deletions: number;
  /**
   * Short branch name that introduced this change.
   * Matches a `BranchRef.name` in the parent `RepositorySource`.
   */
  branchName: string;
  /**
   * Best-effort programming language / file type hint.
   * Derived from the file extension.
   * Examples: "typescript", "python", "sql", "yaml"
   * Null when the type is unknown or not relevant.
   */
  language: string | null;
};
