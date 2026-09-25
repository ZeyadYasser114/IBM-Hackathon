import { ConflictCandidate, CandidateStatus, validateConflictCandidate, assertValidConflictCandidate } from "../src/types/candidate";
import { Confidence, ConflictType, Severity, SourceType } from "../src/types/enums";
import { SemanticAssumption } from "../src/types/assumption";

function makeAssumption(id: string, subject: string, predicate: string): SemanticAssumption {
  return { id, statement: `${subject} ${predicate}`, subject, predicate, sourceType: SourceType.CODE_DIFF, evidenceText: `${subject}: ${predicate}`, confidence: Confidence.HIGH };
}

function validCandidate(overrides: Partial<ConflictCandidate> = {}): ConflictCandidate {
  return {
    id: "cand-001", conflictType: ConflictType.BUSINESS_RULE,
    leftAssumption: makeAssumption("a-left", "user.role", "equals 'owner'"),
    rightAssumption: makeAssumption("a-right", "user.role", "equals 'admin'"),
    affectedEntity: "user.role", estimatedSeverity: Severity.HIGH, confidence: Confidence.HIGH,
    status: CandidateStatus.PENDING, pairingRationale: "Both assumptions reference user.role but assign different values.", ...overrides,
  };
}

describe("validateConflictCandidate", () => {
  it("returns no errors for a valid candidate", () => { expect(validateConflictCandidate(validCandidate())).toHaveLength(0); });
  it("reports error for empty id", () => { expect(validateConflictCandidate(validCandidate({ id: "" })).some((e) => e.field === "id")).toBe(true); });
  it("reports error for invalid conflictType", () => { expect(validateConflictCandidate(validCandidate({ conflictType: "UNKNOWN" as ConflictType })).some((e) => e.field === "conflictType")).toBe(true); });
  it("reports error when left and right assumptions have different subjects", () => {
    const errors = validateConflictCandidate(validCandidate({
      leftAssumption: makeAssumption("a-left", "user.role", "equals 'owner'"),
      rightAssumption: makeAssumption("a-right", "subscription.plan", "is basic"),
    }));
    expect(errors.some((e) => e.field === "affectedEntity")).toBe(true);
  });
  it("subject comparison is case-insensitive", () => {
    const errors = validateConflictCandidate(validCandidate({
      leftAssumption: makeAssumption("a-left", "User.Role", "equals 'owner'"),
      rightAssumption: makeAssumption("a-right", "user.role", "equals 'admin'"),
    }));
    expect(errors.some((e) => e.field === "affectedEntity")).toBe(false);
  });
});

describe("CandidateStatus", () => {
  it("has PENDING, CONFIRMED, DISMISSED", () => {
    expect(CandidateStatus.PENDING).toBe("PENDING");
    expect(CandidateStatus.CONFIRMED).toBe("CONFIRMED");
    expect(CandidateStatus.DISMISSED).toBe("DISMISSED");
  });
});

describe("assertValidConflictCandidate", () => {
  it("does not throw for a valid candidate", () => { expect(() => assertValidConflictCandidate(validCandidate())).not.toThrow(); });
  it("throws for invalid candidate", () => { expect(() => assertValidConflictCandidate(validCandidate({ id: "" }))).toThrow(/Invalid ConflictCandidate/); });
});
