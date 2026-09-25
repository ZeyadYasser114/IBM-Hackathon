import { SemanticAnalysisResult, AnalysisStatus, hasConflicts, highSeverityConflicts, resultSummaryStats } from "../src/types/result";
import { CandidateStatus, ConflictCandidate } from "../src/types/candidate";
import { Confidence, ConflictType, Severity, SourceType } from "../src/types/enums";
import { SemanticConflict } from "../src/types/conflict";
import { SemanticAssumption } from "../src/types/assumption";

function makeAssumption(id: string): SemanticAssumption {
  return { id, statement: "user.role equals 'owner'", subject: "user.role", predicate: "equals 'owner'", sourceType: SourceType.CODE_DIFF, evidenceText: 'User.role = "owner"', confidence: Confidence.HIGH };
}

function makeConflict(id: string, severity: Severity): SemanticConflict {
  return {
    id, conflictType: ConflictType.BUSINESS_RULE,
    leftAssumption: makeAssumption(`${id}-left`), rightAssumption: makeAssumption(`${id}-right`),
    explanation: "Role mismatch.", affectedEntity: "user.role", severity, confidence: Confidence.HIGH,
    evidenceReferences: [{ id: "ev-1", sourceType: SourceType.FILE_SNIPPET, text: "some code", filePath: "auth/roles.ts" }],
    confirmedAt: "2024-07-01T00:00:00.000Z",
  };
}

function makeCandidate(id: string, status: CandidateStatus): ConflictCandidate {
  return {
    id, conflictType: ConflictType.BUSINESS_RULE,
    leftAssumption: makeAssumption(`${id}-left`), rightAssumption: makeAssumption(`${id}-right`),
    affectedEntity: "user.role", estimatedSeverity: Severity.HIGH, confidence: Confidence.MEDIUM,
    status, pairingRationale: "Same subject, different predicates.",
  };
}

function makeResult(overrides: Partial<SemanticAnalysisResult> = {}): SemanticAnalysisResult {
  return {
    sessionId: "session-001", status: AnalysisStatus.CONFLICTS_FOUND, completedAt: "2024-07-01T00:05:00.000Z",
    assumptions: [makeAssumption("a-1"), makeAssumption("a-2")],
    candidates: [makeCandidate("cand-1", CandidateStatus.CONFIRMED), makeCandidate("cand-2", CandidateStatus.DISMISSED)],
    conflicts: [makeConflict("c-1", Severity.HIGH)], summary: "1 semantic conflict found.", ...overrides,
  };
}

describe("AnalysisStatus", () => {
  it("has exactly four members", () => { expect(Object.values(AnalysisStatus)).toHaveLength(4); });
  it("contains PASS, CONFLICTS_FOUND, PARTIAL, ERROR", () => {
    expect(AnalysisStatus.PASS).toBe("PASS"); expect(AnalysisStatus.CONFLICTS_FOUND).toBe("CONFLICTS_FOUND");
    expect(AnalysisStatus.PARTIAL).toBe("PARTIAL"); expect(AnalysisStatus.ERROR).toBe("ERROR");
  });
});

describe("hasConflicts", () => {
  it("returns true when conflicts array is non-empty", () => { expect(hasConflicts(makeResult())).toBe(true); });
  it("returns false when conflicts array is empty", () => { expect(hasConflicts(makeResult({ conflicts: [], status: AnalysisStatus.PASS }))).toBe(false); });
});

describe("highSeverityConflicts", () => {
  it("returns only HIGH severity conflicts", () => {
    const result = makeResult({ conflicts: [makeConflict("c-high", Severity.HIGH), makeConflict("c-medium", Severity.MEDIUM)] });
    expect(highSeverityConflicts(result)).toHaveLength(1);
    expect(highSeverityConflicts(result)[0]!.id).toBe("c-high");
  });
});

describe("resultSummaryStats", () => {
  it("counts correctly", () => {
    const stats = resultSummaryStats(makeResult());
    expect(stats.assumptionsExtracted).toBe(2); expect(stats.candidatesEvaluated).toBe(2);
    expect(stats.conflictsFound).toBe(1); expect(stats.conflictsDismissed).toBe(1);
  });
});
