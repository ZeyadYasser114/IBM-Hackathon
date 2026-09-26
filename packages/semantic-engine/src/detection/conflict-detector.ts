/**
 * conflict-detector.ts
 *
 * detectConflicts  — returns SemanticConflict[] (prompt 4, preserved).
 * explainConflicts — returns ConflictReport[]  (prompt 5, UI-ready).
 *
 * Algorithm:
 *  1. Group NormalizedAssumptions by canonicalSubject.
 *  2. Within each group, compare every pair.
 *  3. Classify each pair using the classifier registry.
 *  4. Build a SemanticConflict for every classified pair.
 *  5. Deduplicate by conflict id.
 *  6. Sort deterministically by (severity rank, then id) for stable output.
 *
 * This function is pure: same input always produces the same output
 * (modulo the confirmedAt timestamp, which callers may override for tests).
 */

import { SemanticConflict } from "../types/conflict";
import { Severity } from "../types/enums";
import { NormalizedAssumption } from "../normalization/evidence-anchor";
import { classify } from "./conflict-classifier";
import { buildConflict } from "./conflict-builder";
import { buildReport } from "./report-builder";
import { ConflictReport } from "./conflict-report";

// ---------------------------------------------------------------------------
// Severity ordering for deterministic sort
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Severity, number> = {
  [Severity.HIGH]: 0,
  [Severity.MEDIUM]: 1,
  [Severity.LOW]: 2,
  [Severity.INFO]: 3,
};

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupBySubject(
  assumptions: readonly NormalizedAssumption[]
): Map<string, NormalizedAssumption[]> {
  const groups = new Map<string, NormalizedAssumption[]>();
  for (const assumption of assumptions) {
    const key = assumption.canonicalSubject;
    if (!key) continue; // skip assumptions with empty canonical subject
    const group = groups.get(key);
    if (group) {
      group.push(assumption);
    } else {
      groups.set(key, [assumption]);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Pair comparison within a group
// ---------------------------------------------------------------------------

function compareGroup(group: NormalizedAssumption[]): SemanticConflict[] {
  const conflicts: SemanticConflict[] = [];

  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const left = group[i]!;
      const right = group[j]!;

      // Skip if both assumptions came from the same source unit — a component
      // cannot conflict with itself.
      if (left.raw.id === right.raw.id) continue;

      const classification = classify(left, right);
      if (classification === null) continue;

      conflicts.push(buildConflict(left, right, classification));
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicate(conflicts: SemanticConflict[]): SemanticConflict[] {
  const seen = new Set<string>();
  const unique: SemanticConflict[] = [];
  for (const conflict of conflicts) {
    if (!seen.has(conflict.id)) {
      seen.add(conflict.id);
      unique.push(conflict);
    }
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Deterministic sort
// ---------------------------------------------------------------------------

function deterministicSort(conflicts: SemanticConflict[]): SemanticConflict[] {
  return [...conflicts].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects semantic conflicts in a set of normalized assumptions.
 *
 * @param assumptions - Output of normalizeAssumptions(). May be empty.
 * @returns A deduplicated, deterministically ordered array of SemanticConflicts.
 *          Returns an empty array when no conflicts are found.
 */
export function detectConflicts(
  assumptions: readonly NormalizedAssumption[]
): SemanticConflict[] {
  if (assumptions.length < 2) return [];

  const groups = groupBySubject(assumptions);
  const allConflicts: SemanticConflict[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue; // need at least two to conflict
    allConflicts.push(...compareGroup(group));
  }

  return deterministicSort(deduplicate(allConflicts));
}

/**
 * Detects semantic conflicts and returns fully explainable ConflictReports
 * ready for direct consumption by a UI, API, or CI check.
 *
 * This is the prompt-5 entry point. It runs the same detection as
 * detectConflicts() but wraps every finding in a ConflictReport with:
 *   - concise title
 *   - both evidence sides
 *   - whyIncompatible explanation
 *   - verificationHint
 *   - deterministic severity and confidence from severity-rules.ts
 *
 * @param assumptions - Output of normalizeAssumptions(). May be empty.
 * @returns ConflictReport[], deduplicated, sorted by severity then id.
 */
export function explainConflicts(
  assumptions: readonly NormalizedAssumption[]
): ConflictReport[] {
  if (assumptions.length < 2) return [];

  const groups = groupBySubject(assumptions);
  const reports: ConflictReport[] = [];
  const seenIds = new Set<string>();

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const left = group[i]!;
        const right = group[j]!;
        if (left.raw.id === right.raw.id) continue;

        const classification = classify(left, right) ?? classify(right, left);
        if (classification === null) continue;

        const conflict = buildConflict(left, right, classification);
        if (seenIds.has(conflict.id)) continue;
        seenIds.add(conflict.id);

        // Build report — try both orientations to honour left=requirement convention
        const report = buildReport(conflict, left, right);
        reports.push(report);
      }
    }
  }

  // Sort: severity rank first, then id for stability
  const SEVERITY_RANK_R: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
  return reports.sort((a, b) => {
    const diff = (SEVERITY_RANK_R[a.severity] ?? 3) - (SEVERITY_RANK_R[b.severity] ?? 3);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}
