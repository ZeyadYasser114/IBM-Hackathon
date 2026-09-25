/**
 * change-passport-draft.ts
 *
 * A structured, human- and machine-readable summary of what was verified.
 * The Change Passport is the permanent audit artifact produced at the end of
 * a successful verification run.  A *Draft* is the in-flight version — it
 * becomes a finalized passport when an authorized reviewer approves it.
 *
 * Design intent:
 *   - Self-contained: all data needed to understand the change is embedded
 *     (no external FK lookups).
 *   - Forward-compatible: `schemaVersion` allows parsers to evolve.
 *   - Diff-friendly: arrays are sorted deterministically so git diffs are clean.
 *
 * Serialization notes
 * -------------------
 * - `approvedBy` and `approvedAt` are null until the draft is approved.
 * - `remainingRisks` may be empty but must never be null.
 * - The embedded `verificationResult` is a snapshot — later changes to the live
 *   result do NOT back-propagate into the passport.
 */

import type { Id, ISODateString, SemVer } from '../primitives.js';
import type { VerificationResult } from './verification-result.js';

/**
 * One risk item that was identified during the run but could not be
 * automatically resolved.  These are surfaced to the reviewer for manual
 * assessment before the draft is approved.
 */
export type RiskItem = {
  /**
   * Short ID within this passport, e.g. "R-1", "R-2".
   * Used to reference this item in comments and external ticketing systems.
   */
  key: string;
  /** Plain-English description of the residual risk */
  description: string;
  /**
   * Severity classification using the same scale as ConflictFinding.severity.
   * Values: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
   */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  /**
   * ID of the ConflictFinding this risk originated from, if applicable.
   * Null for risks that were identified outside the conflict detector.
   */
  sourceConflictId: Id | null;
};

/**
 * The in-flight Change Passport before reviewer approval.
 *
 * Stored as-is when generated; transitions to an approved artifact when
 * `approvedBy` and `approvedAt` are set by the passport service.
 */
export type ChangePassportDraft = {
  /** UUID v4 — stable identifier for this passport */
  id: Id;
  /**
   * Schema version.  Increment major for breaking changes.
   * Current: "1.0.0"
   */
  schemaVersion: SemVer;
  /**
   * ID of the VerificationResult this passport is derived from.
   * Cross-reference for audit logs; the full result is also embedded below.
   */
  verificationResultId: Id;
  /**
   * Short, human-readable title for this change.
   * Typically derived from `FeatureRequest.title`.
   * Example: "Add organization billing — v1"
   */
  title: string;
  /**
   * Summary of the developer's intent in 1–3 sentences.
   * Authored by the Change Agent from the FeatureRequest.
   */
  intentSummary: string;
  /**
   * Sorted list of repo-relative paths for all files changed across all
   * feature branches in this run.
   */
  changedFiles: string[];
  /**
   * Residual risks that the reviewer must acknowledge before approving.
   * Ordered by severity (CRITICAL first).
   */
  remainingRisks: RiskItem[];
  /**
   * Key decisions or trade-offs that were made during the verification run
   * and are worth recording for future maintainers.
   * Example: "Decided to unify on 'owner' as the privileged role."
   */
  notableDecisions: string[];
  /**
   * The full VerificationResult snapshot at the time the draft was generated.
   * Embedded so the passport is self-contained; later result edits do not
   * alter the passport.
   */
  verificationResult: VerificationResult;
  /** When this draft was generated (ISO-8601 UTC) */
  generatedAt: ISODateString;
  /**
   * Identity of the person or system that approved this draft.
   * Null while the draft is awaiting review.
   */
  approvedBy: string | null;
  /**
   * When the draft was approved.
   * Null while awaiting review.
   */
  approvedAt: ISODateString | null;
};
