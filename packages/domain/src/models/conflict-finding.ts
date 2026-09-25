/**
 * conflict-finding.ts
 *
 * A semantic conflict identified by the conflict detector between two or more
 * assumptions from different branches.  This is the primary output artifact of
 * the verification pipeline before the Change Passport is generated.
 *
 * Serialization notes
 * -------------------
 * - `affectedAssumptionIds` must reference IDs from the same VerificationResult.
 * - `affectedFiles` is a de-duplicated, sorted list for deterministic output.
 * - `proposedResolution` is null until an AI agent populates it; persist as null
 *   rather than omitting the field so consumers do not need existence checks.
 * - `resolvedAt` is null while `proposedResolution` is null; set together.
 */

import type { Id, ISODateString } from '../primitives.js';
import type { ConflictCategory, ConflictSeverity } from '../enums.js';
import type { CodeEvidence } from './code-evidence.js';

/**
 * A semantic conflict between assumptions from two or more branches.
 *
 * Each ConflictFinding should be independently actionable — a developer reading
 * only this record and its evidence should understand what the conflict is and
 * where to look.
 */
export type ConflictFinding = {
  /** UUID v4 */
  id: Id;
  /**
   * Short title for display in the UI and summary reports.
   * Example: "Privileged role assumption mismatch"
   * Should be < 80 characters.
   */
  title: string;
  /**
   * Full explanation of why these assumptions conflict and what the consequence
   * is if the merge proceeds without resolution.
   * Plain English; avoid jargon.
   */
  description: string;
  /**
   * How urgent this conflict is to resolve before merge.
   * @see ConflictSeverity
   */
  severity: ConflictSeverity;
  /**
   * The category of conflict this is.  Used for grouping and routing.
   * @see ConflictCategory
   */
  category: ConflictCategory;
  /**
   * IDs of the Assumption records that are in direct conflict.
   * Must reference `Assumption.id` values in the same VerificationResult.
   */
  affectedAssumptionIds: Id[];
  /**
   * Sorted, de-duplicated list of repo-relative file paths involved.
   * Derived from the evidence of each affected assumption.
   */
  affectedFiles: string[];
  /**
   * Evidence items that directly demonstrate the conflict (not just each
   * assumption's own evidence — evidence that shows them conflicting).
   * May be empty when the conflict is entirely inferential.
   */
  conflictEvidence: CodeEvidence[];
  /**
   * AI-generated suggested fix, populated by the Change Agent.
   * Null until a resolution is proposed; null must be serialized explicitly.
   */
  proposedResolution: string | null;
  /**
   * When a resolution was accepted or applied.
   * Null while the conflict is unresolved.
   */
  resolvedAt: ISODateString | null;
};
