/**
 * result.ts
 *
 * SemanticAnalysisResult — the complete output envelope returned by the semantic engine.
 */

import { SemanticAssumption } from "./assumption";
import { ConflictCandidate } from "./candidate";
import { SemanticConflict } from "./conflict";

export enum AnalysisStatus {
  PASS = "PASS",
  CONFLICTS_FOUND = "CONFLICTS_FOUND",
  PARTIAL = "PARTIAL",
  ERROR = "ERROR",
}

export interface SemanticAnalysisResult {
  readonly sessionId: string;
  readonly status: AnalysisStatus;
  readonly completedAt: string;
  readonly assumptions: readonly SemanticAssumption[];
  readonly candidates: readonly ConflictCandidate[];
  readonly conflicts: readonly SemanticConflict[];
  readonly summary: string;
  readonly warnings?: readonly string[];
  readonly errorMessage?: string;
}

export function hasConflicts(result: SemanticAnalysisResult): boolean {
  return result.conflicts.length > 0;
}

export function highSeverityConflicts(
  result: SemanticAnalysisResult
): readonly SemanticConflict[] {
  return result.conflicts.filter((c) => c.severity === "HIGH");
}

export function resultSummaryStats(result: SemanticAnalysisResult): {
  assumptionsExtracted: number;
  candidatesEvaluated: number;
  conflictsFound: number;
  conflictsDismissed: number;
} {
  return {
    assumptionsExtracted: result.assumptions.length,
    candidatesEvaluated: result.candidates.length,
    conflictsFound: result.conflicts.length,
    conflictsDismissed: result.candidates.filter((c) => c.status === "DISMISSED").length,
  };
}
