/**
 * conflict-classifier.ts
 *
 * Pure classification rules: given two NormalizedAssumptions that share
 * the same canonicalSubject, decide whether they conflict and, if so,
 * which ConflictType applies.
 *
 * Design principles:
 *  - Never classify a conflict unless the evidence is unambiguous.
 *  - Style differences, whitespace, and unrelated edits must not trigger conflicts.
 *  - Each classifier is a pure function with no side effects.
 *  - Classifiers return null when uncertain (conservative).
 *
 * Severity and confidence are now assigned by severity-rules.ts at report
 * time rather than here, so ClassificationResult carries only the conflict
 * type and explanation.  Severity/Confidence fields are kept for backward
 * compatibility with the existing SemanticConflict type and are set to
 * placeholder values that get overridden by the report builder.
 */

import { NormalizedAssumption } from "../normalization/evidence-anchor";
import { ConflictType, Confidence, Severity } from "../types/enums"; // Severity/Confidence used in ClassificationResult interface
import { assignSeverityAndConfidence } from "./severity-rules";

// ---------------------------------------------------------------------------
// Classification result
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  readonly conflictType: ConflictType;
  readonly severity: Severity;
  readonly confidence: Confidence;
  /** Plain-language explanation written for a developer audience. */
  readonly explanation: string;
}

// ---------------------------------------------------------------------------
// Predicate value extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the value part from a canonical predicate of the form "key = value".
 * Returns null when the predicate has no value part.
 */
function extractValue(canonicalPredicate: string): string | null {
  const eqIdx = canonicalPredicate.indexOf("=");
  if (eqIdx === -1) return null;
  const value = canonicalPredicate.slice(eqIdx + 1).trim();
  return value.length > 0 ? value : null;
}

/**
 * Extracts the key part from a canonical predicate of the form "key = value".
 */
function extractKey(canonicalPredicate: string): string {
  const eqIdx = canonicalPredicate.indexOf("=");
  return eqIdx === -1
    ? canonicalPredicate.trim()
    : canonicalPredicate.slice(0, eqIdx).trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when both assumptions share the same canonical predicate KEY
 * but have different canonical VALUES.
 * This is the core signal for all three conflict types.
 */
function hasSameKeyDifferentValue(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): boolean {
  const leftKey = extractKey(left.canonicalPredicate);
  const rightKey = extractKey(right.canonicalPredicate);
  if (leftKey !== rightKey) return false;

  const leftVal = extractValue(left.canonicalPredicate);
  const rightVal = extractValue(right.canonicalPredicate);

  // Both must have a value, and the values must differ
  if (leftVal === null || rightVal === null) return false;
  return leftVal !== rightVal;
}

/**
 * Returns true when the predicates are the same key but one is "true"
 * and the other is "false" — the classic required-vs-optional conflict.
 */
function isBooleanFlip(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): boolean {
  const leftVal = extractValue(left.canonicalPredicate);
  const rightVal = extractValue(right.canonicalPredicate);
  if (leftVal === null || rightVal === null) return false;
  return (
    (leftVal === "true" && rightVal === "false") ||
    (leftVal === "false" && rightVal === "true")
  );
}

/**
 * Returns true when the subject looks like a role/authorization entity.
 */
function isRoleSubject(subject: string): boolean {
  return /role|permission|access|auth/.test(subject);
}

/**
 * Returns true when the predicate key is role-related.
 */
function isRolePredicate(key: string): boolean {
  return key === "required_role" || key === "role";
}

/**
 * Returns true when the subject looks like an API / contract entity.
 */
function isContractSubject(subject: string): boolean {
  return /api|field|response|request|endpoint|payload|param|signature/.test(subject);
}

/**
 * Returns true when the predicate key relates to field naming or type.
 */
function isContractPredicate(key: string): boolean {
  return /field_name|expected_field|response_field|type|signature/.test(key);
}

/**
 * Returns true when the predicate key relates to field presence/optionality.
 */
function isDependencyPredicate(key: string): boolean {
  return /is_required|always_present|dependency_required|must_exist/.test(key);
}

// ---------------------------------------------------------------------------
// Individual classifiers
// ---------------------------------------------------------------------------

/**
 * BUSINESS_RULE classifier.
 *
 * Fires when:
 *  - same entity, same predicate key, different values, AND
 *  - either the subject or the predicate key is role/authorization-related.
 *
 * Also fires for generic "must_be" or "prohibited" predicate disagreements.
 */
function classifyBusinessRule(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): ClassificationResult | null {
  if (!hasSameKeyDifferentValue(left, right)) return null;

  const key = extractKey(left.canonicalPredicate);
  const leftVal = extractValue(left.canonicalPredicate)!;
  const rightVal = extractValue(right.canonicalPredicate)!;

  const isRole = isRoleSubject(left.canonicalSubject) || isRolePredicate(key);
  const isRule = /must_be|prohibited|allowed_actor/.test(key);

  if (!isRole && !isRule) return null;

  const entity = left.canonicalSubject;
  const { severity, confidence } = assignSeverityAndConfidence(ConflictType.BUSINESS_RULE, left, right);

  return {
    conflictType: ConflictType.BUSINESS_RULE,
    severity,
    confidence,
    explanation:
      `Business rule conflict on '${entity}': ` +
      `one change assumes '${leftVal}' while another assumes '${rightVal}'. ` +
      `If both are in production simultaneously, authorization checks will disagree ` +
      `and access control will behave inconsistently.`,
  };
}

/**
 * CONTRACT classifier.
 *
 * Fires when:
 *  - same entity, same predicate key, different values, AND
 *  - subject or predicate key is API/contract-related (field name, type, signature).
 */
function classifyContract(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): ClassificationResult | null {
  if (!hasSameKeyDifferentValue(left, right)) return null;

  const key = extractKey(left.canonicalPredicate);
  const leftVal = extractValue(left.canonicalPredicate)!;
  const rightVal = extractValue(right.canonicalPredicate)!;

  if (!isContractSubject(left.canonicalSubject) && !isContractPredicate(key)) return null;

  const entity = left.canonicalSubject;
  const { severity, confidence } = assignSeverityAndConfidence(ConflictType.CONTRACT, left, right);

  return {
    conflictType: ConflictType.CONTRACT,
    severity,
    confidence,
    explanation:
      `Contract conflict on '${entity}': ` +
      `one component produces/uses '${leftVal}' while another expects '${rightVal}'. ` +
      `This mismatch will cause runtime failures when the components interact.`,
  };
}

/**
 * DEPENDENCY classifier.
 *
 * Fires when:
 *  - same entity, same predicate key, values are a boolean flip (true/false), AND
 *  - predicate key relates to presence or requirement.
 */
function classifyDependency(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): ClassificationResult | null {
  if (!hasSameKeyDifferentValue(left, right)) return null;

  const key = extractKey(left.canonicalPredicate);
  if (!isDependencyPredicate(key)) return null;
  if (!isBooleanFlip(left, right)) return null;

  const entity = left.canonicalSubject;
  const leftVal = extractValue(left.canonicalPredicate)!;
  const madeOptional = leftVal === "false";
  const { severity, confidence } = assignSeverityAndConfidence(ConflictType.DEPENDENCY, left, right);

  return {
    conflictType: ConflictType.DEPENDENCY,
    severity,
    confidence,
    explanation:
      `Dependency conflict on '${entity}': ` +
      (madeOptional
        ? `one change makes '${entity}' optional, but another component depends on it always being present. `
        : `one change requires '${entity}' to always be present, but another component treats it as optional. `) +
      `Components that assume presence will fail at runtime when the value is absent.`,
  };
}

// ---------------------------------------------------------------------------
// Classifier registry (tried in order — first match wins)
// ---------------------------------------------------------------------------

type Classifier = (
  left: NormalizedAssumption,
  right: NormalizedAssumption
) => ClassificationResult | null;

const CLASSIFIERS: readonly Classifier[] = [
  classifyBusinessRule,
  classifyContract,
  classifyDependency,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given two normalized assumptions that share the same canonicalSubject,
 * attempt to classify them as a conflict.
 *
 * Returns null when no meaningful conflict is detected (conservative).
 * The pair is also tried in reversed order so neither ordering is privileged.
 */
export function classify(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): ClassificationResult | null {
  for (const classifier of CLASSIFIERS) {
    const result = classifier(left, right) ?? classifier(right, left);
    if (result !== null) return result;
  }
  return null;
}
