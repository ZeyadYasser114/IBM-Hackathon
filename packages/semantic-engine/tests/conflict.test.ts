import { SemanticConflict, validateSemanticConflict, assertValidSemanticConflict } from "../src/types/conflict";
import { Confidence, ConflictType, Severity, SourceType } from "../src/types/enums";
import { SemanticAssumption } from "../src/types/assumption";
import { EvidenceReference } from "../src/types/evidence";

function makeAssumption(id: string, subject: string, predicate: string): SemanticAssumption {
  return { id, statement: `${subject} ${predicate}`, subject, predicate, sourceType: SourceType.CODE_DIFF, evidenceText: `${subject}: ${predicate}`, confidence: Confidence.HIGH };
}

function makeEvidence(id: string): EvidenceReference {
  return { id, sourceType: SourceType.FILE_SNIPPET, filePath: "auth/roles.ts", text: 'User.role = "owner"' };
}

function validConflict(overrides: Partial<SemanticConflict> = {}): SemanticConflict {
  return {
    id: "conflict-001", conflictType: ConflictType.BUSINESS_RULE,
    leftAssumption: makeAssumption("a-left", "user.role", "equals 'owner'"),
    rightAssumption: makeAssumption("a-right", "user.role", "equals 'admin'"),
    explanation: "Authentication defines the privileged role as 'owner', but billing checks for 'admin'.",
    affectedEntity: "user.role", severity: Severity.HIGH, confidence: Confidence.HIGH,
    evidenceReferences: [makeEvidence("ev-001")], confirmedAt: new Date().toISOString(), ...overrides,
  };
}

describe("validateSemanticConflict", () => {
  it("returns no errors for a valid conflict", () => { expect(validateSemanticConflict(validConflict())).toHaveLength(0); });
  it("reports error for empty id", () => { expect(validateSemanticConflict(validConflict({ id: "" })).some((e) => e.field === "id")).toBe(true); });
  it("reports error for empty explanation", () => { expect(validateSemanticConflict(validConflict({ explanation: "  " })).some((e) => e.field === "explanation")).toBe(true); });
  it("reports error when evidenceReferences is empty", () => { expect(validateSemanticConflict(validConflict({ evidenceReferences: [] })).some((e) => e.field === "evidenceReferences")).toBe(true); });
  it("reports error for empty confirmedAt", () => { expect(validateSemanticConflict(validConflict({ confirmedAt: "" })).some((e) => e.field === "confirmedAt")).toBe(true); });
  it("reports error for non-ISO confirmedAt", () => { expect(validateSemanticConflict(validConflict({ confirmedAt: "not-a-date" })).some((e) => e.field === "confirmedAt")).toBe(true); });
  it("accepts a valid ISO-8601 confirmedAt", () => { expect(validateSemanticConflict(validConflict({ confirmedAt: "2024-07-01T12:00:00.000Z" }))).toHaveLength(0); });
});

describe("assertValidSemanticConflict", () => {
  it("does not throw for a valid conflict", () => { expect(() => assertValidSemanticConflict(validConflict())).not.toThrow(); });
  it("throws and includes conflict id", () => { expect(() => assertValidSemanticConflict(validConflict({ id: "c-fail", explanation: "" }))).toThrow(/c-fail/); });
});
