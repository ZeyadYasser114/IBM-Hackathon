/**
 * normalization-pipeline.ts
 *
 * Public entry point for prompt 3.
 *
 * normalizeAssumptions(assumptions) → NormalizedAssumption[]
 *
 * Applies entity, predicate, and value normalization to each assumption,
 * anchors the evidence, and records a full trace of every change.
 */

import { SemanticAssumption } from "../types/assumption";
import { normalizeEntity } from "./entity-normalizer";
import { normalizePredicate } from "./predicate-normalizer";
import { normalizeValueString } from "./value-normalizer";
import { NormalizedAssumption, NormalizationTrace, NormalizationStep, buildEvidenceAnchor } from "./evidence-anchor";

// ---------------------------------------------------------------------------
// Core normalization function
// ---------------------------------------------------------------------------

function normalizeOne(assumption: SemanticAssumption): NormalizedAssumption {
  const trace: NormalizationStep[] = [];

  // --- Subject normalization ---
  const entityResult = normalizeEntity(assumption.subject);
  if (entityResult.explanation) {
    trace.push({
      field: "subject",
      rawValue: assumption.subject,
      canonicalValue: entityResult.canonical,
      explanation: entityResult.explanation,
    });
  }

  // --- Predicate normalization (key + value) ---
  const predicateResult = normalizePredicate(assumption.predicate, normalizeValueString);
  if (predicateResult.explanation) {
    // Split into subject vs value steps when the explanation contains both
    const parts = predicateResult.explanation.split("; ");
    for (const part of parts) {
      if (part.toLowerCase().includes("value")) {
        trace.push({
          field: "value",
          rawValue: assumption.predicate,
          canonicalValue: predicateResult.canonical,
          explanation: part,
        });
      } else {
        trace.push({
          field: "predicate",
          rawValue: assumption.predicate,
          canonicalValue: predicateResult.canonical,
          explanation: part,
        });
      }
    }
  }

  // --- Evidence anchor ---
  const anchor = buildEvidenceAnchor(assumption);

  return {
    raw: assumption,
    canonicalSubject: entityResult.canonical,
    canonicalPredicate: predicateResult.canonical,
    anchor,
    normalizationTrace: trace as NormalizationTrace,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalizes an array of SemanticAssumptions and returns NormalizedAssumptions
 * ready for conflict comparison.
 *
 * - Each assumption is normalized independently.
 * - Original assumptions are never mutated.
 * - Empty input returns an empty array.
 * - Assumptions that normalize to an empty canonicalSubject are included but
 *   will be skipped by the detector (which guards for empty subjects).
 *   Callers can detect these via normalizationTrace or by checking
 *   normalizedAssumption.canonicalSubject === "".
 */
export function normalizeAssumptions(
  assumptions: readonly SemanticAssumption[]
): NormalizedAssumption[] {
  // Guard against null/undefined entries that a broken AI adapter might inject.
  return assumptions.filter((a): a is SemanticAssumption => a != null).map(normalizeOne);
}

/**
 * Same as normalizeAssumptions but also returns a list of assumption ids
 * that were dropped (produced an empty canonicalSubject) so callers can
 * surface warnings.
 */
export function normalizeAssumptionsWithWarnings(
  assumptions: readonly SemanticAssumption[]
): { normalized: NormalizedAssumption[]; droppedIds: string[] } {
  const normalized = assumptions.filter((a): a is SemanticAssumption => a != null).map(normalizeOne);
  const droppedIds = normalized
    .filter((n) => n.canonicalSubject === "")
    .map((n) => n.raw.id);
  return { normalized, droppedIds };
}
