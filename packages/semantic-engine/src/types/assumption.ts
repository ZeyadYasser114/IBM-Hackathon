/**
 * assumption.ts
 *
 * SemanticAssumption — the atomic unit of semantic analysis.
 */

import { Confidence, SourceType } from "./enums";
import { EvidenceReference, validateEvidenceReference } from "./evidence";

export interface SemanticAssumption {
  readonly id: string;
  readonly statement: string;
  readonly subject: string;
  readonly predicate: string;
  readonly sourceType: SourceType;
  readonly sourceFile?: string;
  readonly evidenceText: string;
  readonly confidence: Confidence;
  readonly supportingEvidence?: readonly EvidenceReference[];
}

export interface AssumptionValidationError {
  readonly field: string;
  readonly message: string;
}

export function validateSemanticAssumption(
  a: SemanticAssumption
): AssumptionValidationError[] {
  const errors: AssumptionValidationError[] = [];

  if (!a.id || a.id.trim().length === 0) {
    errors.push({ field: "id", message: "id must be a non-empty string" });
  }
  if (!a.statement || a.statement.trim().length === 0) {
    errors.push({ field: "statement", message: "statement must be a non-empty string" });
  }
  if (!a.subject || a.subject.trim().length === 0) {
    errors.push({ field: "subject", message: "subject must be a non-empty string" });
  }
  if (!a.predicate || a.predicate.trim().length === 0) {
    errors.push({ field: "predicate", message: "predicate must be a non-empty string" });
  }
  if (!Object.values(SourceType).includes(a.sourceType)) {
    errors.push({ field: "sourceType", message: `sourceType must be one of: ${Object.values(SourceType).join(", ")}` });
  }
  if (!a.evidenceText || a.evidenceText.trim().length === 0) {
    errors.push({ field: "evidenceText", message: "evidenceText must be a non-empty string" });
  }
  if (!Object.values(Confidence).includes(a.confidence)) {
    errors.push({ field: "confidence", message: `confidence must be one of: ${Object.values(Confidence).join(", ")}` });
  }
  if (a.supportingEvidence !== undefined) {
    a.supportingEvidence.forEach((ev, idx) => {
      validateEvidenceReference(ev).forEach((evErr) => {
        errors.push({ field: `supportingEvidence[${idx}].${evErr.field}`, message: evErr.message });
      });
    });
  }

  return errors;
}

export function normalizeAssumption(a: SemanticAssumption): SemanticAssumption {
  return {
    ...a,
    subject: a.subject.trim().toLowerCase(),
    statement: a.statement.trim(),
    predicate: a.predicate.trim(),
    evidenceText: a.evidenceText.trim(),
  };
}

export function assertValidSemanticAssumption(a: SemanticAssumption): void {
  const errors = validateSemanticAssumption(a);
  if (errors.length > 0) {
    throw new Error(
      `Invalid SemanticAssumption (id="${a.id}"): ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`
    );
  }
}
