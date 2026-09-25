/**
 * candidate.ts
 *
 * ConflictCandidate — intermediate representation before a SemanticConflict is confirmed.
 */

import { Confidence, ConflictType, Severity } from "./enums";
import { SemanticAssumption, validateSemanticAssumption } from "./assumption";

export enum CandidateStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  DISMISSED = "DISMISSED",
}

export interface ConflictCandidate {
  readonly id: string;
  readonly conflictType: ConflictType;
  readonly leftAssumption: SemanticAssumption;
  readonly rightAssumption: SemanticAssumption;
  readonly affectedEntity: string;
  readonly estimatedSeverity: Severity;
  readonly confidence: Confidence;
  readonly status: CandidateStatus;
  readonly pairingRationale: string;
}

export interface CandidateValidationError {
  readonly field: string;
  readonly message: string;
}

export function validateConflictCandidate(c: ConflictCandidate): CandidateValidationError[] {
  const errors: CandidateValidationError[] = [];

  if (!c.id || c.id.trim().length === 0) {
    errors.push({ field: "id", message: "id must be a non-empty string" });
  }
  if (!Object.values(ConflictType).includes(c.conflictType)) {
    errors.push({ field: "conflictType", message: `conflictType must be one of: ${Object.values(ConflictType).join(", ")}` });
  }
  if (!Object.values(Severity).includes(c.estimatedSeverity)) {
    errors.push({ field: "estimatedSeverity", message: `estimatedSeverity must be one of: ${Object.values(Severity).join(", ")}` });
  }
  if (!Object.values(Confidence).includes(c.confidence)) {
    errors.push({ field: "confidence", message: `confidence must be one of: ${Object.values(Confidence).join(", ")}` });
  }
  if (!Object.values(CandidateStatus).includes(c.status)) {
    errors.push({ field: "status", message: `status must be one of: ${Object.values(CandidateStatus).join(", ")}` });
  }
  if (!c.affectedEntity || c.affectedEntity.trim().length === 0) {
    errors.push({ field: "affectedEntity", message: "affectedEntity must be a non-empty string" });
  }
  if (!c.pairingRationale || c.pairingRationale.trim().length === 0) {
    errors.push({ field: "pairingRationale", message: "pairingRationale must be a non-empty string" });
  }

  validateSemanticAssumption(c.leftAssumption).forEach((e) => {
    errors.push({ field: `leftAssumption.${e.field}`, message: e.message });
  });
  validateSemanticAssumption(c.rightAssumption).forEach((e) => {
    errors.push({ field: `rightAssumption.${e.field}`, message: e.message });
  });

  if (
    c.leftAssumption.subject.trim().toLowerCase() !==
    c.rightAssumption.subject.trim().toLowerCase()
  ) {
    errors.push({
      field: "affectedEntity",
      message: "leftAssumption.subject and rightAssumption.subject must share the same normalized entity",
    });
  }

  return errors;
}

export function assertValidConflictCandidate(c: ConflictCandidate): void {
  const errors = validateConflictCandidate(c);
  if (errors.length > 0) {
    throw new Error(
      `Invalid ConflictCandidate (id="${c.id}"): ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`
    );
  }
}
