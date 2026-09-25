/**
 * @mergemind/verification
 *
 * Takes a list of Assumption records (from the analysis pipeline) and a
 * FeatureRequirement, and returns a VerificationResult containing any
 * SemanticConflicts found.
 *
 * EXTENSION POINT
 * ---------------
 * Implement the `ConflictDetector` interface to add detection strategies:
 *
 *   class SemanticConflictDetector implements ConflictDetector {
 *     detect(assumptions: Assumption[]): SemanticConflict[] { ... }
 *   }
 *
 * Register detectors in `runVerification()` or replace the function entirely.
 * The stub detector included here returns an empty conflict list — it is the
 * correct baseline behaviour before the AI orchestration branch lands.
 *
 * CURRENT STATE
 * -------------
 * `runVerification` assembles a valid VerificationResult with all summary
 * fields populated but zero conflicts. The conflict detection branch should
 * implement a real ConflictDetector and inject it.
 */

import type {
  Assumption,
  FeatureRequirement,
  SemanticConflict,
  VerificationResult,
  VerificationSummary,
} from '@mergemind/domain';

// ---------------------------------------------------------------------------
// Conflict detector contract
// ---------------------------------------------------------------------------

export interface ConflictDetector {
  /**
   * Inspect the assumption list and return any semantic conflicts found.
   * Must be pure — no side effects, no async.
   */
  detect(assumptions: Assumption[], requirement: FeatureRequirement): SemanticConflict[];
}

// ---------------------------------------------------------------------------
// Stub detector
// ---------------------------------------------------------------------------

/**
 * Placeholder that finds no conflicts.
 * Replace with a real implementation in the conflict-detection branch.
 */
export class StubConflictDetector implements ConflictDetector {
  detect(_assumptions: Assumption[], _requirement: FeatureRequirement): SemanticConflict[] {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main verification function
// ---------------------------------------------------------------------------

export type VerificationInput = {
  requirementId: string;
  requirement: FeatureRequirement;
  repositoryName: string;
  filesChanged: number;
  assumptions: Assumption[];
  /** Override the conflict detector. Default: StubConflictDetector */
  detector?: ConflictDetector;
};

export function runVerification(input: VerificationInput): VerificationResult {
  const detector = input.detector ?? new StubConflictDetector();
  const conflicts = detector.detect(input.assumptions, input.requirement);

  const resolved = conflicts.filter((c) => c.proposedResolution !== null).length;

  const summary: VerificationSummary = {
    assumptionsFound: input.assumptions.length,
    conflictsFound: conflicts.length,
    conflictsResolved: resolved,
    filesChanged: input.filesChanged,
    requirementCoverage: computeCoverage(input.assumptions, input.requirement),
  };

  const status = conflicts.length === 0 ? 'PASS' : resolved < conflicts.length ? 'FAIL' : 'PASS';

  return {
    id: `vr-${Date.now()}`,
    requirementId: input.requirementId,
    repositoryName: input.repositoryName,
    status,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    assumptions: input.assumptions,
    conflicts,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Coverage heuristic
// ---------------------------------------------------------------------------

/**
 * Naive coverage heuristic: percentage of requirement rules that have at
 * least one supporting assumption.
 *
 * EXTENSION POINT — replace with a real coverage model.
 */
function computeCoverage(assumptions: Assumption[], requirement: FeatureRequirement): number {
  if (requirement.rules.length === 0) return assumptions.length > 0 ? 100 : 0;
  const covered = requirement.rules.filter((rule) =>
    assumptions.some((a) => a.statement.toLowerCase().includes(rule.toLowerCase().slice(0, 20))),
  ).length;
  return Math.round((covered / requirement.rules.length) * 100);
}
