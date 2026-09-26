/**
 * evidence-anchor.ts
 *
 * NormalizedAssumption — the output type of the normalization pipeline.
 *
 * Wraps a SemanticAssumption with canonical comparison keys, a structured
 * EvidenceAnchor pinning back to the original source, and a normalization
 * trace explaining every change made.
 */

import { SemanticAssumption } from "../types/assumption";
import { EvidenceReference } from "../types/evidence";
import { SourceType } from "../types/enums";

// ---------------------------------------------------------------------------
// EvidenceAnchor
// ---------------------------------------------------------------------------

export interface EvidenceAnchor {
  /** Verbatim text from SemanticAssumption.evidenceText — never modified. */
  readonly originalText: string;
  readonly sourceType: SourceType;
  /** Repository-relative file path, when known. */
  readonly filePath?: string;
  /** All structured evidence references (primary + supporting). */
  readonly references: readonly EvidenceReference[];
}

// ---------------------------------------------------------------------------
// NormalizationTrace
// ---------------------------------------------------------------------------

export interface NormalizationStep {
  readonly field: "subject" | "predicate" | "value";
  readonly rawValue: string;
  readonly canonicalValue: string;
  readonly explanation: string;
}

export type NormalizationTrace = readonly NormalizationStep[];

// ---------------------------------------------------------------------------
// NormalizedAssumption
// ---------------------------------------------------------------------------

export interface NormalizedAssumption {
  /** Original assumption — never mutated. */
  readonly raw: SemanticAssumption;
  /** Stable canonical subject key for conflict comparison. */
  readonly canonicalSubject: string;
  /** Stable canonical predicate string for conflict comparison. */
  readonly canonicalPredicate: string;
  /** Evidence anchor: original text + source type + file path + all refs. */
  readonly anchor: EvidenceAnchor;
  /** Every normalization step applied, with before/after/explanation. */
  readonly normalizationTrace: NormalizationTrace;
}

// ---------------------------------------------------------------------------
// EvidenceAnchor builder
// ---------------------------------------------------------------------------

export function buildEvidenceAnchor(assumption: SemanticAssumption): EvidenceAnchor {
  const primaryRef: EvidenceReference = {
    id: `${assumption.id}__primary`,
    sourceType: assumption.sourceType,
    text: assumption.evidenceText,
    ...(assumption.sourceFile !== undefined ? { filePath: assumption.sourceFile } : {}),
  };

  const allRefs: EvidenceReference[] = [primaryRef];
  if (assumption.supportingEvidence) {
    allRefs.push(...assumption.supportingEvidence);
  }

  return {
    originalText: assumption.evidenceText,
    sourceType: assumption.sourceType,
    references: allRefs,
    ...(assumption.sourceFile !== undefined ? { filePath: assumption.sourceFile } : {}),
  };
}
