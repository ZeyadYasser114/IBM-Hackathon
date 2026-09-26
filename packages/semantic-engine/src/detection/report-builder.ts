/**
 * report-builder.ts
 *
 * Builds a ConflictReport from a SemanticConflict + the two NormalizedAssumptions
 * that produced it.
 *
 * Responsibilities:
 *  - generate the concise title
 *  - build both EvidenceSide objects
 *  - compose the whyIncompatible explanation
 *  - generate the verificationHint
 *  - re-apply severity/confidence using the deterministic rules from severity-rules.ts
 */

import { SemanticConflict } from "../types/conflict";
import { ConflictType } from "../types/enums";
import { NormalizedAssumption } from "../normalization/evidence-anchor";
import { EvidenceReference } from "../types/evidence";
import { ConflictReport, EvidenceSide } from "./conflict-report";
import { assignSeverityAndConfidence } from "./severity-rules";

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

function buildTitle(
  conflictType: ConflictType,
  affectedEntity: string
): string {
  switch (conflictType) {
    case ConflictType.BUSINESS_RULE:
      return `Authorization contradiction on '${affectedEntity}'`;
    case ConflictType.CONTRACT:
      return `Contract mismatch on '${affectedEntity}'`;
    case ConflictType.DEPENDENCY:
      return `Dependency assumption conflict on '${affectedEntity}'`;
  }
}

// ---------------------------------------------------------------------------
// Source label
// ---------------------------------------------------------------------------

function buildSourceLabel(assumption: NormalizedAssumption): string {
  if (assumption.anchor.filePath) {
    return assumption.anchor.filePath;
  }
  // Use /g flag so all underscores are replaced (e.g. "code_diff" → "code diff")
  return assumption.raw.sourceType.toLowerCase().replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// EvidenceSide builder
// ---------------------------------------------------------------------------

function buildEvidenceSide(assumption: NormalizedAssumption): EvidenceSide {
  return {
    sourceLabel: buildSourceLabel(assumption),
    statement: assumption.raw.statement,
    canonicalPredicate: assumption.canonicalPredicate,
    evidenceText: assumption.raw.evidenceText,
    evidenceReferences: assumption.anchor.references,
    ...(assumption.anchor.filePath !== undefined
      ? { filePath: assumption.anchor.filePath }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// whyIncompatible explanation
// ---------------------------------------------------------------------------

function buildWhyIncompatible(
  conflictType: ConflictType,
  left: NormalizedAssumption,
  right: NormalizedAssumption
): string {
  const entity = left.canonicalSubject;
  const leftPred = left.canonicalPredicate;
  const rightPred = right.canonicalPredicate;

  const eqL = leftPred.indexOf("=");
  const eqR = rightPred.indexOf("=");
  const leftVal = eqL !== -1 ? leftPred.slice(eqL + 1).trim() : leftPred;
  const rightVal = eqR !== -1 ? rightPred.slice(eqR + 1).trim() : rightPred;

  const leftLabel = buildSourceLabel(left);
  const rightLabel = buildSourceLabel(right);

  switch (conflictType) {
    case ConflictType.BUSINESS_RULE:
      return (
        `'${leftLabel}' assumes that the privileged value for '${entity}' is '${leftVal}', ` +
        `but '${rightLabel}' assumes it is '${rightVal}'. ` +
        `Both cannot be true simultaneously. ` +
        `At runtime, one side will grant access while the other denies it, ` +
        `depending on which code path executes.`
      );
    case ConflictType.CONTRACT:
      return (
        `'${leftLabel}' produces or expects '${leftVal}' for '${entity}', ` +
        `but '${rightLabel}' produces or expects '${rightVal}'. ` +
        `When these components interact, the receiver will look for a field or type ` +
        `that the sender does not provide, causing a runtime failure.`
      );
    case ConflictType.DEPENDENCY:
      return (
        `'${leftLabel}' treats '${entity}' as ${leftVal === "true" ? "required (always present)" : "optional (may be absent)"}, ` +
        `but '${rightLabel}' treats it as ${rightVal === "true" ? "required (always present)" : "optional (may be absent)"}. ` +
        `Any code path that reaches '${rightLabel}' after '${leftLabel}' has set '${entity}' ` +
        `to absent will fail when it attempts to use '${entity}'.`
      );
  }
}

// ---------------------------------------------------------------------------
// Verification hint generation
// ---------------------------------------------------------------------------

function buildVerificationHint(
  conflictType: ConflictType,
  left: NormalizedAssumption,
  right: NormalizedAssumption
): string {
  const entity = left.canonicalSubject;
  const leftLabel = buildSourceLabel(left);
  const rightLabel = buildSourceLabel(right);

  const eqL = left.canonicalPredicate.indexOf("=");
  const eqR = right.canonicalPredicate.indexOf("=");
  const leftVal = eqL !== -1 ? left.canonicalPredicate.slice(eqL + 1).trim() : "?";
  const rightVal = eqR !== -1 ? right.canonicalPredicate.slice(eqR + 1).trim() : "?";

  switch (conflictType) {
    case ConflictType.BUSINESS_RULE:
      return (
        `1. Search the codebase for every reference to '${entity}' and confirm which value ('${leftVal}' or '${rightVal}') the requirement intends. ` +
        `2. Add a regression test that asserts the incorrect value is explicitly rejected. ` +
        `3. Check '${leftLabel}' and '${rightLabel}' for any other role/permission references that may carry the same inconsistency.`
      );
    case ConflictType.CONTRACT:
      return (
        `1. Open '${leftLabel}' and '${rightLabel}' side by side and confirm the expected field name or type for '${entity}'. ` +
        `2. Run the integration test suite between these two components — a test that calls the producer and asserts the consumer field will fail. ` +
        `3. If no such integration test exists, add one that covers this boundary.`
      );
    case ConflictType.DEPENDENCY:
      return (
        `1. Search all callers that use '${entity}' from '${rightLabel}' and verify they handle the absent case. ` +
        `2. Add a unit test that exercises the code path in '${rightLabel}' with '${entity}' absent. ` +
        `3. If '${entity}' is intentionally optional, update '${rightLabel}' to guard against null/undefined before use.`
      );
  }
}

// ---------------------------------------------------------------------------
// Evidence deduplication
// ---------------------------------------------------------------------------

function deduplicateRefs(
  ...sources: readonly (readonly EvidenceReference[])[]
): EvidenceReference[] {
  const seen = new Set<string>();
  const result: EvidenceReference[] = [];
  for (const source of sources) {
    for (const ref of source) {
      if (!seen.has(ref.id)) {
        seen.add(ref.id);
        result.push(ref);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildReport(
  conflict: SemanticConflict,
  left: NormalizedAssumption,
  right: NormalizedAssumption
): ConflictReport {
  const ruling = assignSeverityAndConfidence(conflict.conflictType, left, right);

  const affectedFiles: string[] = [];
  if (left.anchor.filePath) affectedFiles.push(left.anchor.filePath);
  if (right.anchor.filePath && right.anchor.filePath !== left.anchor.filePath) {
    affectedFiles.push(right.anchor.filePath);
  }

  const allEvidenceReferences = deduplicateRefs(
    left.anchor.references,
    right.anchor.references
  );

  return {
    id: conflict.id,
    title: buildTitle(conflict.conflictType, left.canonicalSubject),
    conflictType: conflict.conflictType,
    affectedEntity: left.canonicalSubject,
    assumptionA: buildEvidenceSide(left),
    assumptionB: buildEvidenceSide(right),
    whyIncompatible: buildWhyIncompatible(conflict.conflictType, left, right),
    severity: ruling.severity,
    confidence: ruling.confidence,
    severityRule: ruling.severityRule,
    confidenceRule: ruling.confidenceRule,
    affectedFiles,
    allEvidenceReferences,
    verificationHint: buildVerificationHint(conflict.conflictType, left, right),
    detectedAt: conflict.confirmedAt,
  };
}
