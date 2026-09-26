/**
 * severity-rules.ts
 *
 * Deterministic rules for assigning Severity and Confidence to a
 * classified conflict.
 *
 * Rules are explicit and documented so developers can reason about them.
 * No ML, no heuristics — every decision traces to a named rule.
 *
 * SEVERITY rules (MVP):
 *   HIGH   — Authorization/access-control contradiction with direct evidence.
 *            Required-vs-optional contradiction on a field a downstream
 *            component depends on.
 *   MEDIUM — Business rule contradiction without direct auth impact.
 *            Contract naming mismatch with both sides confirmed.
 *   LOW    — Contract mismatch where only one side has file-level evidence.
 *            Dependency assumption with only one file reference.
 *   INFO   — Anything else that looks suspicious but lacks strong evidence.
 *
 * CONFIDENCE rules:
 *   HIGH   — Both sides have FILE_SNIPPET or CODE_DIFF evidence AND the
 *            predicate values are directly contradictory (not just different).
 *   MEDIUM — One or both sides come from REQUIREMENT or DOCUMENTATION, or
 *            the contradiction is indirect (naming difference, not value flip).
 *   LOW    — Either side has no file-level evidence, or the predicate key
 *            was inferred rather than directly stated.
 */

import { ConflictType, Severity, Confidence, SourceType } from "../types/enums";
import { NormalizedAssumption } from "../normalization/evidence-anchor";

// ---------------------------------------------------------------------------
// Evidence quality scoring
// ---------------------------------------------------------------------------

/**
 * Returns a numeric quality score for a single assumption's evidence.
 *   2 = strong  (FILE_SNIPPET or CODE_DIFF with a known file path)
 *   1 = moderate (CODE_DIFF without file path, or REQUIREMENT)
 *   0 = weak    (DOCUMENTATION, TEST, or unknown)
 */
function evidenceQuality(assumption: NormalizedAssumption): 0 | 1 | 2 {
  const { sourceType } = assumption.raw;
  const hasFilePath = assumption.anchor.filePath !== undefined;

  if (
    (sourceType === SourceType.FILE_SNIPPET || sourceType === SourceType.CODE_DIFF) &&
    hasFilePath
  ) {
    return 2;
  }
  if (sourceType === SourceType.CODE_DIFF || sourceType === SourceType.REQUIREMENT) {
    return 1;
  }
  return 0;
}

/**
 * Combined evidence quality of a pair: min of the two sides.
 * A conflict is only as strong as its weakest side.
 */
function pairQuality(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): 0 | 1 | 2 {
  return Math.min(evidenceQuality(left), evidenceQuality(right)) as 0 | 1 | 2;
}

// ---------------------------------------------------------------------------
// Direct contradiction detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the two canonical predicate values are directly opposite:
 *   "true" / "false"  — presence/requirement flip
 *   different role names — authorization contradiction
 *
 * A direct contradiction increases confidence.
 */
function isDirectContradiction(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): boolean {
  const leftPred = left.canonicalPredicate;
  const rightPred = right.canonicalPredicate;

  const eqL = leftPred.indexOf("=");
  const eqR = rightPred.indexOf("=");
  if (eqL === -1 || eqR === -1) return false;

  const leftVal = leftPred.slice(eqL + 1).trim();
  const rightVal = rightPred.slice(eqR + 1).trim();

  // Boolean flip
  if (
    (leftVal === "true" && rightVal === "false") ||
    (leftVal === "false" && rightVal === "true")
  ) {
    return true;
  }

  // Role contradiction: both are short role words (owner/admin/member)
  const roleWords = /^(owner|admin|member|manager|viewer|editor|superuser|moderator)$/;
  if (roleWords.test(leftVal) && roleWords.test(rightVal)) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SeverityRuling {
  readonly severity: Severity;
  readonly confidence: Confidence;
  /** The named rule that determined severity. */
  readonly severityRule: string;
  /** The named rule that determined confidence. */
  readonly confidenceRule: string;
}

/**
 * Assigns deterministic Severity and Confidence to a conflict.
 *
 * @param conflictType - The classified conflict type.
 * @param left         - The left normalized assumption.
 * @param right        - The right normalized assumption.
 */
export function assignSeverityAndConfidence(
  conflictType: ConflictType,
  left: NormalizedAssumption,
  right: NormalizedAssumption
): SeverityRuling {
  const quality = pairQuality(left, right);
  const direct = isDirectContradiction(left, right);

  // ----- SEVERITY -----

  let severity: Severity;
  let severityRule: string;

  if (conflictType === ConflictType.BUSINESS_RULE) {
    const isAuthRelated =
      /role|permission|access|auth/.test(left.canonicalSubject) ||
      left.canonicalPredicate.includes("required_role");

    if (isAuthRelated && direct) {
      severity = Severity.HIGH;
      severityRule = "BUSINESS_RULE:auth_contradiction";
    } else if (isAuthRelated) {
      severity = Severity.MEDIUM;
      severityRule = "BUSINESS_RULE:auth_indirect";
    } else {
      severity = Severity.MEDIUM;
      severityRule = "BUSINESS_RULE:general_rule_contradiction";
    }
  } else if (conflictType === ConflictType.CONTRACT) {
    const bothHaveFiles =
      left.anchor.filePath !== undefined && right.anchor.filePath !== undefined;

    if (bothHaveFiles && quality >= 2) {
      severity = Severity.HIGH;
      severityRule = "CONTRACT:both_files_confirmed";
    } else if (quality >= 1) {
      severity = Severity.MEDIUM;
      severityRule = "CONTRACT:one_side_confirmed";
    } else {
      severity = Severity.LOW;
      severityRule = "CONTRACT:weak_evidence";
    }
  } else {
    // DEPENDENCY
    if (direct && quality >= 2) {
      severity = Severity.HIGH;
      severityRule = "DEPENDENCY:boolean_flip_confirmed";
    } else if (direct) {
      severity = Severity.MEDIUM;
      severityRule = "DEPENDENCY:boolean_flip_partial_evidence";
    } else {
      severity = Severity.LOW;
      severityRule = "DEPENDENCY:indirect";
    }
  }

  // ----- CONFIDENCE -----

  let confidence: Confidence;
  let confidenceRule: string;

  if (direct && quality === 2) {
    confidence = Confidence.HIGH;
    confidenceRule = "direct_contradiction_with_file_evidence";
  } else if (direct && quality >= 1) {
    confidence = Confidence.MEDIUM;
    confidenceRule = "direct_contradiction_moderate_evidence";
  } else if (quality === 2) {
    confidence = Confidence.MEDIUM;
    confidenceRule = "file_evidence_indirect_contradiction";
  } else if (quality === 1) {
    confidence = Confidence.LOW;
    confidenceRule = "moderate_evidence_indirect_contradiction";
  } else {
    confidence = Confidence.LOW;
    confidenceRule = "weak_evidence";
  }

  return { severity, confidence, severityRule, confidenceRule };
}
