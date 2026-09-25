/**
 * input.ts
 *
 * AnalysisInput — the single, strongly typed entry-point contract for the semantic engine.
 */

import { SourceType } from "./enums";

export interface ChangeDescription {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly fileSnippets?: readonly FileSnippet[];
}

export interface FileSnippet {
  readonly filePath: string;
  readonly sourceType: SourceType;
  readonly content: string;
  readonly lineRange?: readonly [number, number];
}

export interface AnalysisInput {
  readonly sessionId: string;
  readonly requirementText: string;
  readonly changes: readonly ChangeDescription[];
  readonly contextDocuments?: readonly FileSnippet[];
}

export interface InputValidationError {
  readonly field: string;
  readonly message: string;
}

export function validateAnalysisInput(input: AnalysisInput): InputValidationError[] {
  const errors: InputValidationError[] = [];

  if (!input.sessionId || input.sessionId.trim().length === 0) {
    errors.push({ field: "sessionId", message: "sessionId must be a non-empty string" });
  }
  if (!input.requirementText || input.requirementText.trim().length === 0) {
    errors.push({ field: "requirementText", message: "requirementText must be a non-empty string" });
  }
  if (!input.changes || input.changes.length === 0) {
    errors.push({ field: "changes", message: "at least one change description is required" });
  } else {
    const seenIds = new Set<string>();
    input.changes.forEach((change, idx) => {
      if (!change.id || change.id.trim().length === 0) {
        errors.push({ field: `changes[${idx}].id`, message: "change id must be a non-empty string" });
      } else if (seenIds.has(change.id)) {
        errors.push({ field: `changes[${idx}].id`, message: `duplicate change id "${change.id}"` });
      } else {
        seenIds.add(change.id);
      }
      if (!change.label || change.label.trim().length === 0) {
        errors.push({ field: `changes[${idx}].label`, message: "change label must be a non-empty string" });
      }
      if (!change.content || change.content.trim().length === 0) {
        errors.push({ field: `changes[${idx}].content`, message: "change content must be a non-empty string" });
      }
      if (change.fileSnippets) {
        change.fileSnippets.forEach((snippet, sIdx) => {
          if (!snippet.filePath || snippet.filePath.trim().length === 0) {
            errors.push({ field: `changes[${idx}].fileSnippets[${sIdx}].filePath`, message: "filePath must be a non-empty string" });
          }
          if (!snippet.content || snippet.content.trim().length === 0) {
            errors.push({ field: `changes[${idx}].fileSnippets[${sIdx}].content`, message: "snippet content must be a non-empty string" });
          }
          if (snippet.lineRange !== undefined) {
            const [start, end] = snippet.lineRange;
            if (!Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < 1 || start > end) {
              errors.push({ field: `changes[${idx}].fileSnippets[${sIdx}].lineRange`, message: "lineRange must be [start, end] with start >= 1 and start <= end" });
            }
          }
        });
      }
    });
  }

  return errors;
}

export function assertValidAnalysisInput(input: AnalysisInput): void {
  const errors = validateAnalysisInput(input);
  if (errors.length > 0) {
    throw new Error(
      `Invalid AnalysisInput (session="${input.sessionId}"): ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`
    );
  }
}
