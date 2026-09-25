/**
 * verification-result.ts
 *
 * The top-level output of a MergeMind verification run.  Everything produced
 * by the pipeline is assembled here.  This document is:
 *   - returned by the API at the end of a run
 *   - stored as the canonical artifact for audit and replay
 *   - embedded verbatim inside a ChangePassportDraft
 *
 * Serialization notes
 * -------------------
 * - `completedAt` is null while the run is PENDING or IN_PROGRESS.
 * - `conflicts` and `assumptions` are always arrays — never null/undefined.
 * - `summary` is always present, even for a PENDING run (zeroed counts).
 * - `schemaVersion` enables forward-compatible deserialization; parsers should
 *   reject documents with a major version they do not understand.
 */

import type { Id, ISODateString, SemVer } from '../primitives.js';
import type { VerificationStatus } from '../enums.js';
import type { Assumption } from './assumption.js';
import type { ConflictFinding } from './conflict-finding.js';
import type { RepositorySource } from './repository-source.js';
import type { FeatureRequest } from './feature-request.js';

/**
 * Aggregate counts derived from the verification run.
 * Always present; zero-valued for runs that have not yet completed.
 */
export type VerificationSummary = {
  /** Total number of Assumption records extracted across all agents */
  assumptionsFound: number;
  /** Total number of ConflictFinding records raised */
  conflictsFound: number;
  /**
   * Number of conflicts that have a non-null `proposedResolution`.
   * ≤ conflictsFound
   */
  conflictsResolved: number;
  /** Total distinct files changed across all feature branches */
  filesChanged: number;
  /**
   * Percentage of `FeatureRequest.acceptanceCriteria` backed by at least one
   * Assumption.  Range: 0–100.  Null when there are no acceptance criteria.
   */
  requirementCoverage: number | null;
  /**
   * Breakdown of conflict count by severity level.
   * Agents may set any subset of the fields; missing keys imply zero.
   */
  conflictsBySeverity: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
};

/**
 * The complete, self-contained result of one MergeMind verification run.
 */
export type VerificationResult = {
  /** UUID v4 — stable across result updates (status changes, resolution edits) */
  id: Id;
  /**
   * Schema version of this document.
   * Increment the major version for breaking field changes.
   * Current: "1.0.0"
   */
  schemaVersion: SemVer;
  /**
   * The feature request this run was triggered for.
   * Embedded directly so the result is self-describing without a DB join.
   */
  featureRequest: FeatureRequest;
  /**
   * The repository and branch metadata at the time the run was started.
   * Embedded for the same self-describing reason as `featureRequest`.
   */
  repositorySource: RepositorySource;
  /**
   * Lifecycle status of the run.
   * @see VerificationStatus
   */
  status: VerificationStatus;
  /** When the run was accepted into the queue (ISO-8601 UTC) */
  startedAt: ISODateString;
  /**
   * When the run reached a terminal status (PASS / FAIL / CANCELLED / ERROR).
   * Null while PENDING or IN_PROGRESS.
   */
  completedAt: ISODateString | null;
  /**
   * All assumptions extracted by the analysis agents.
   * Empty array if no assumptions were found or the run did not complete.
   */
  assumptions: Assumption[];
  /**
   * All conflict findings raised by the conflict detector.
   * Empty array if no conflicts were found or the run did not complete.
   */
  conflicts: ConflictFinding[];
  /** Aggregate summary counts — always present, zeroed for incomplete runs */
  summary: VerificationSummary;
  /**
   * Free-text error message, set only when `status === 'ERROR'`.
   * Should describe the root cause in terms a developer can act on.
   * Null in all other statuses.
   */
  errorMessage: string | null;
};
