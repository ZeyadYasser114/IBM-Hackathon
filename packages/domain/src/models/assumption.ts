/**
 * assumption.ts
 *
 * A structured claim extracted from a branch's changes by one of the analysis
 * agents.  Assumptions are the atomic unit of the MergeMind analysis pipeline:
 * agents produce them, the conflict detector compares them.
 *
 * Serialization notes
 * -------------------
 * - `evidence` should contain at least one entry; an assumption with zero
 *   evidence degrades confidence to LOW automatically.
 * - `numericConfidence` is the raw score (0.0–1.0) that backs the `confidence`
 *   label; store both so consumers can apply their own thresholds.
 * - `relatedAssumptionIds` stores cross-references within the same run; they
 *   are not FK constraints — missing IDs must be tolerated gracefully.
 */

import type { Id, ISODateString } from '../primitives.js';
import type { AgentType, ConfidenceLevel } from '../enums.js';
import type { CodeEvidence } from './code-evidence.js';

/**
 * A verifiable claim about a concept, value, or behaviour found in one branch.
 *
 * Two Assumptions with the same `concept` but different `value` fields on
 * different branches are the seed of a ConflictFinding.
 */
export type Assumption = {
  /** UUID v4 — stable identifier assigned by the pipeline before storage */
  id: Id;
  /** Short branch name where this assumption was found */
  branchName: string;
  /**
   * Repo-relative path of the primary source file.
   * The canonical location of the assumption; may be one of several evidence
   * files listed in `evidence`.
   */
  sourceFile: string;
  /**
   * Human-readable statement of the assumption in plain English.
   * Example: "The privileged organization role is 'owner'"
   * Must be unique enough that a human can judge two assumptions as conflicting
   * without reading the code.
   */
  statement: string;
  /**
   * Normalized concept key shared across branches.
   * Used by the conflict detector to group assumptions for comparison.
   * Should be lowercase, kebab-case.
   * Example: "privileged-role", "user-id-field", "session-timeout-seconds"
   */
  concept: string;
  /**
   * The concrete value or expression the assumption asserts.
   * For scalar assumptions this is the literal: "'owner'", "300", "true".
   * For structural assumptions this is a compact representation: "{ id: string; role: string }".
   */
  value: string;
  /** The analysis agent that produced this assumption */
  sourceAgent: AgentType;
  /**
   * Ordered list of evidence items supporting this assumption.
   * The strongest evidence should appear first.
   * An empty list is valid but lowers the confidence to LOW.
   */
  evidence: CodeEvidence[];
  /**
   * Categorized confidence in this assumption's correctness.
   * Derived from `numericConfidence` using the thresholds in ConfidenceLevel.
   * @see ConfidenceLevel
   */
  confidence: ConfidenceLevel;
  /**
   * Raw confidence score from 0.0 (no confidence) to 1.0 (certainty).
   * Stored alongside `confidence` so consumers can apply custom thresholds.
   */
  numericConfidence: number;
  /**
   * IDs of other Assumption records in the same run that this one is related to
   * (e.g. it extends, qualifies, or was derived from them).
   * Not a hard dependency — absent IDs must be tolerated.
   */
  relatedAssumptionIds: Id[];
  /** When this assumption was extracted (ISO-8601 UTC) */
  extractedAt: ISODateString;
};
