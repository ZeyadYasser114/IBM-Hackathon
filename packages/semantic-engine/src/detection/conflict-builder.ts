/**
 * conflict-builder.ts
 *
 * Assembles a valid SemanticConflict from two NormalizedAssumptions and a
 * ClassificationResult.
 *
 * Responsibilities:
 *  - generate a deterministic, stable conflict id
 *  - collect all evidence references from both sides
 *  - deduplicate evidence references by id
 *  - collect affected file paths
 *  - stamp confirmedAt
 */

import { SemanticConflict } from "../types/conflict";
import { EvidenceReference } from "../types/evidence";
import { NormalizedAssumption } from "../normalization/evidence-anchor";
import { ClassificationResult } from "./conflict-classifier";

// ---------------------------------------------------------------------------
// Deterministic id
// ---------------------------------------------------------------------------

/**
 * Builds a stable conflict id from the two assumption ids and the conflict type.
 * Sorts the ids so left/right ordering does not affect the result.
 */
function buildConflictId(
  leftId: string,
  rightId: string,
  conflictType: string
): string {
  const [a, b] = [leftId, rightId].sort();
  const slug = `${conflictType}__${a}__${b}`
    .replace(/[^a-z0-9_]+/gi, "_")
    .toLowerCase();
  return `conflict_${slug}`;
}

// ---------------------------------------------------------------------------
// Evidence collection
// ---------------------------------------------------------------------------

function collectEvidence(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): EvidenceReference[] {
  const seen = new Set<string>();
  const refs: EvidenceReference[] = [];

  const addAll = (sources: readonly EvidenceReference[]) => {
    for (const ref of sources) {
      if (!seen.has(ref.id)) {
        seen.add(ref.id);
        refs.push(ref);
      }
    }
  };

  addAll(left.anchor.references);
  addAll(right.anchor.references);

  return refs;
}

// ---------------------------------------------------------------------------
// Affected files collection
// ---------------------------------------------------------------------------

function collectAffectedFiles(
  left: NormalizedAssumption,
  right: NormalizedAssumption
): string[] | undefined {
  const files: string[] = [];
  if (left.anchor.filePath) files.push(left.anchor.filePath);
  if (right.anchor.filePath && right.anchor.filePath !== left.anchor.filePath) {
    files.push(right.anchor.filePath);
  }
  return files.length > 0 ? files : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildConflict(
  left: NormalizedAssumption,
  right: NormalizedAssumption,
  classification: ClassificationResult
): SemanticConflict {
  const id = buildConflictId(
    left.raw.id,
    right.raw.id,
    classification.conflictType
  );

  const evidenceReferences = collectEvidence(left, right);
  const affectedFiles = collectAffectedFiles(left, right);

  return {
    id,
    conflictType: classification.conflictType,
    leftAssumption: left.raw,
    rightAssumption: right.raw,
    explanation: classification.explanation,
    affectedEntity: left.canonicalSubject,
    severity: classification.severity,
    confidence: classification.confidence,
    evidenceReferences,
    confirmedAt: new Date().toISOString(),
    ...(affectedFiles !== undefined ? { affectedFiles } : {}),
  };
}
