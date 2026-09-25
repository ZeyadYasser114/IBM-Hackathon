/**
 * @mergemind/verification
 *
 * Takes a list of Assumption records (from the analysis pipeline) and a
 * FeatureRequest, and returns a VerificationResult containing any
 * ConflictFindings found.
 *
 * EXTENSION POINT
 * ---------------
 * Implement the `ConflictDetector` interface to add detection strategies:
 *
 *   class SemanticConflictDetector implements ConflictDetector {
 *     detect(assumptions: Assumption[], request: FeatureRequest): ConflictFinding[] { ... }
 *   }
 *
 * Register detectors in `runVerification()` or replace the function entirely.
 * The stub detector included here returns an empty conflict list — it is the
 * correct baseline behaviour before the AI orchestration branch lands.
 *
 * CURRENT STATE
 * -------------
 * `runVerification` assembles a schema-valid VerificationResult with all
 * summary fields populated but zero conflicts. The conflict detection branch
 * should implement a real ConflictDetector and inject it.
 */

import { randomUUID } from 'node:crypto';

import type {
  Assumption,
  ConflictFinding,
  FeatureRequest,
  RepositorySource,
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
  detect(assumptions: Assumption[], request: FeatureRequest): ConflictFinding[];
}

// ---------------------------------------------------------------------------
// Stub detector
// ---------------------------------------------------------------------------

/**
 * Placeholder that finds no conflicts.
 * Replace with a real implementation in the conflict-detection branch.
 */
export class StubConflictDetector implements ConflictDetector {
  detect(_assumptions: Assumption[], _request: FeatureRequest): ConflictFinding[] {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main verification function
// ---------------------------------------------------------------------------

export type VerificationInput = {
  featureRequest: FeatureRequest;
  repositorySource: RepositorySource;
  /** Total distinct files changed across all feature branches in this run */
  filesChanged: number;
  assumptions: Assumption[];
  /** Override the conflict detector. Default: StubConflictDetector */
  detector?: ConflictDetector;
};

export function runVerification(input: VerificationInput): VerificationResult {
  const detector = input.detector ?? new StubConflictDetector();
  const conflicts = detector.detect(input.assumptions, input.featureRequest);

  const resolved = conflicts.filter((c) => c.proposedResolution !== null).length;
  const now = new Date().toISOString();

  const summary: VerificationSummary = {
    assumptionsFound: input.assumptions.length,
    conflictsFound: conflicts.length,
    conflictsResolved: resolved,
    filesChanged: input.filesChanged,
    requirementCoverage: computeCoverage(input.assumptions, input.featureRequest),
    conflictsBySeverity: countBySeverity(conflicts),
  };

  const status = conflicts.length === 0 ? 'PASS' : resolved < conflicts.length ? 'FAIL' : 'PASS';

  return {
    id: randomUUID(),
    schemaVersion: '1.0.0',
    featureRequest: input.featureRequest,
    repositorySource: input.repositorySource,
    status,
    startedAt: now,
    completedAt: now,
    assumptions: input.assumptions,
    conflicts,
    summary,
    errorMessage: null,
  };
}

// ---------------------------------------------------------------------------
// Coverage heuristic
// ---------------------------------------------------------------------------

/**
 * Naive coverage heuristic: percentage of the request's acceptance criteria
 * backed by at least one supporting assumption.
 * Null when the request has no acceptance criteria.
 *
 * EXTENSION POINT — replace with a real coverage model.
 */
function computeCoverage(assumptions: Assumption[], request: FeatureRequest): number | null {
  if (request.acceptanceCriteria.length === 0) return null;
  const covered = request.acceptanceCriteria.filter((criterion) =>
    assumptions.some((a) =>
      a.statement.toLowerCase().includes(criterion.description.toLowerCase().slice(0, 20)),
    ),
  ).length;
  return Math.round((covered / request.acceptanceCriteria.length) * 100);
}

/**
 * Count conflicts per severity level. All four keys are always present
 * so the summary shape is deterministic.
 */
function countBySeverity(conflicts: ConflictFinding[]): VerificationSummary['conflictsBySeverity'] {
  const counts: VerificationSummary['conflictsBySeverity'] = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  for (const conflict of conflicts) {
    counts[conflict.severity] += 1;
  }
  return counts;
}
