/**
 * conflict.ts
 *
 * SemanticConflict — the confirmed output of the semantic analysis engine.
 */

import { Confidence, ConflictType, Severity } from "./enums";
import { SemanticAssumption, validateSemanticAssumption } from "./assumption";
import { EvidenceReference, validateEvidenceReference } from "./evidence";

export interface SemanticConflict {
  readonly id: string;
  readonly conflictType: ConflictType;
  readonly leftAssumption: SemanticAssumption;
  readonly rightAssumption: SemanticAssumption;
  readonly explanation: string;
  readonly affectedEntity: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly evidenceReferences: readonly EvidenceReference[];
  readonly affectedFiles?: readonly string[];
  readonly confirmedAt: string;
}

export interface ConflictValidationError {
  readonly field: string;
  readonly message: string;
}

export function validateSemanticConflict(c: SemanticConflict): ConflictValidationError[] {
  const errors: ConflictValidationError[] = [];

  if (!c.id || c.id.trim().length === 0) {
    errors.push({ field: "id", message: "id must be a non-empty string" });
  }
  if (!Object.values(ConflictType).includes(c.conflictType)) {
    errors.push({ field: "conflictType", message: `conflictType must be one of: ${Object.values(ConflictType).join(", ")}` });
  }
  if (!c.explanation || c.explanation.trim().length === 0) {
    errors.push({ field: "explanation", message: "explanation must be a non-empty string" });
  }
  if (!c.affectedEntity || c.affectedEntity.trim().length === 0) {
    errors.push({ field: "affectedEntity", message: "affectedEntity must be a non-empty string" });
  }
  if (!Object.values(Severity).includes(c.severity)) {
    errors.push({ field: "severity", message: `severity must be one of: ${Object.values(Severity).join(", ")}` });
  }
  if (!Object.values(Confidence).includes(c.confidence)) {
    errors.push({ field: "confidence", message: `confidence must be one of: ${Object.values(Confidence).join(", ")}` });
  }
  if (!c.evidenceReferences || c.evidenceReferences.length === 0) {
    errors.push({ field: "evidenceReferences", message: "at least one evidence reference is required for a confirmed conflict" });
  } else {
    c.evidenceReferences.forEach((ev, idx) => {
      validateEvidenceReference(ev).forEach((evErr) => {
        errors.push({ field: `evidenceReferences[${idx}].${evErr.field}`, message: evErr.message });
      });
    });
  }
  if (!c.confirmedAt || c.confirmedAt.trim().length === 0) {
    errors.push({ field: "confirmedAt", message: "confirmedAt must be a non-empty ISO-8601 timestamp" });
  } else if (isNaN(Date.parse(c.confirmedAt))) {
    errors.push({ field: "confirmedAt", message: "confirmedAt must be a valid ISO-8601 date string" });
  }

  validateSemanticAssumption(c.leftAssumption).forEach((e) => {
    errors.push({ field: `leftAssumption.${e.field}`, message: e.message });
  });
  validateSemanticAssumption(c.rightAssumption).forEach((e) => {
    errors.push({ field: `rightAssumption.${e.field}`, message: e.message });
  });

  return errors;
}

export function assertValidSemanticConflict(c: SemanticConflict): void {
  const errors = validateSemanticConflict(c);
  if (errors.length > 0) {
    throw new Error(
      `Invalid SemanticConflict (id="${c.id}"): ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`
    );
  }
}
