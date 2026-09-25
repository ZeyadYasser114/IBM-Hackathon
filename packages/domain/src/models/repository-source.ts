/**
 * repository-source.ts
 *
 * Describes where the code lives and which branches are participating in a
 * MergeMind verification run.
 *
 * Serialization notes
 * -------------------
 * - `featureBranches` must contain at least one entry; the system cannot compare
 *   branches without at least one feature branch.
 * - `provider` is intentionally an open-ended string so new Git hosting platforms
 *   can be added without a schema migration.
 */

import type { Id, ISODateString } from '../primitives.js';

/**
 * A specific, resolved reference to a branch at a point in time.
 * Both fields together form an immutable pointer — even if the branch later
 * moves, `sha` guarantees reproducibility.
 */
export type BranchRef = {
  /** Short branch name, e.g. "feature/add-billing" */
  name: string;
  /**
   * Full 40-hex-character Git commit SHA.
   * Must be the tip of the branch at the time the run was started.
   */
  sha: string;
};

/**
 * The Git repository that is the subject of a verification run.
 *
 * `RepositorySource` is created once per run and stored verbatim in the
 * VerificationResult so every artifact is self-describing.
 */
export type RepositorySource = {
  /** UUID v4 — stable identifier for this repository record */
  id: Id;
  /** Human-readable repository name, e.g. "acme/platform" */
  name: string;
  /**
   * Clone URL or local filesystem path.
   * - HTTPS URL format for remote repositories: "https://github.com/acme/platform"
   * - Absolute path for local repositories: "/workspace/platform"
   * git-ingest resolves this to actual diffs; the domain layer treats it as opaque.
   */
  cloneUrl: string;
  /**
   * Git hosting platform identifier.
   * Well-known values: "github", "gitlab", "bitbucket", "azure-devops", "local"
   * The field is open-ended — unknown values must not cause parsing failures.
   */
  provider: string;
  /**
   * The branch that will receive the merge (the "target").
   * Typically "main" or "develop".
   */
  baseBranch: BranchRef;
  /**
   * One or more feature branches being verified against each other and the base.
   * Must contain at least one entry.
   */
  featureBranches: BranchRef[];
  /** When the repository metadata was resolved (branches looked up, SHAs pinned) */
  resolvedAt: ISODateString;
};
