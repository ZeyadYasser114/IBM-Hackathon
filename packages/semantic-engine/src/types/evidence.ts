/**
 * evidence.ts
 *
 * EvidenceReference — a pointer to a specific piece of text that supports
 * an assumption or conflict finding.
 */

import { SourceType } from "./enums";

export interface EvidenceReference {
  readonly id: string;
  readonly sourceType: SourceType;
  readonly filePath?: string;
  readonly lineRange?: readonly [number, number];
  readonly text: string;
  readonly label?: string;
}

export interface EvidenceValidationError {
  readonly field: string;
  readonly message: string;
}

export function validateEvidenceReference(
  e: EvidenceReference
): EvidenceValidationError[] {
  const errors: EvidenceValidationError[] = [];

  if (!e.id || e.id.trim().length === 0) {
    errors.push({ field: "id", message: "id must be a non-empty string" });
  }

  if (!Object.values(SourceType).includes(e.sourceType)) {
    errors.push({
      field: "sourceType",
      message: `sourceType must be one of: ${Object.values(SourceType).join(", ")}`,
    });
  }

  if (e.text.trim().length === 0) {
    errors.push({ field: "text", message: "text must be a non-empty string" });
  }

  if (e.lineRange !== undefined) {
    const [start, end] = e.lineRange;
    if (!Number.isInteger(start) || start < 1) {
      errors.push({ field: "lineRange[0]", message: "lineRange start must be a positive integer" });
    }
    if (!Number.isInteger(end) || end < 1) {
      errors.push({ field: "lineRange[1]", message: "lineRange end must be a positive integer" });
    }
    if (Number.isInteger(start) && Number.isInteger(end) && start > end) {
      errors.push({ field: "lineRange", message: "lineRange start must be less than or equal to end" });
    }
  }

  return errors;
}

export function assertValidEvidenceReference(e: EvidenceReference): void {
  const errors = validateEvidenceReference(e);
  if (errors.length > 0) {
    throw new Error(
      `Invalid EvidenceReference (id="${e.id}"): ${errors.map((err) => `${err.field} — ${err.message}`).join("; ")}`
    );
  }
}
