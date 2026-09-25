import { SemanticAssumption, validateSemanticAssumption, normalizeAssumption, assertValidSemanticAssumption } from "../src/types/assumption";
import { Confidence, SourceType } from "../src/types/enums";

function validAssumption(overrides: Partial<SemanticAssumption> = {}): SemanticAssumption {
  return {
    id: "a-001", statement: "The privileged organization role is 'owner'.",
    subject: "user.role", predicate: "equals 'owner'", sourceType: SourceType.CODE_DIFF,
    sourceFile: "auth/roles.ts", evidenceText: 'User.role = "owner"', confidence: Confidence.HIGH, ...overrides,
  };
}

describe("validateSemanticAssumption", () => {
  it("returns no errors for a fully valid assumption", () => { expect(validateSemanticAssumption(validAssumption())).toHaveLength(0); });
  it("returns no errors when optional sourceFile is absent", () => {
    const { sourceFile, ...rest } = { ...validAssumption(), sourceFile: undefined as unknown as string };
    expect(validateSemanticAssumption(rest as SemanticAssumption)).toHaveLength(0);
  });
  it("reports error for empty id", () => { expect(validateSemanticAssumption(validAssumption({ id: "" })).some((e) => e.field === "id")).toBe(true); });
  it("reports error for empty statement", () => { expect(validateSemanticAssumption(validAssumption({ statement: "   " })).some((e) => e.field === "statement")).toBe(true); });
  it("reports error for empty subject", () => { expect(validateSemanticAssumption(validAssumption({ subject: "" })).some((e) => e.field === "subject")).toBe(true); });
  it("reports error for empty predicate", () => { expect(validateSemanticAssumption(validAssumption({ predicate: "" })).some((e) => e.field === "predicate")).toBe(true); });
  it("reports error for invalid sourceType", () => { expect(validateSemanticAssumption(validAssumption({ sourceType: "BAD" as SourceType })).some((e) => e.field === "sourceType")).toBe(true); });
  it("reports error for empty evidenceText", () => { expect(validateSemanticAssumption(validAssumption({ evidenceText: "" })).some((e) => e.field === "evidenceText")).toBe(true); });
  it("reports error for invalid confidence", () => { expect(validateSemanticAssumption(validAssumption({ confidence: "VERY_HIGH" as Confidence })).some((e) => e.field === "confidence")).toBe(true); });
});

describe("normalizeAssumption", () => {
  it("lower-cases and trims the subject", () => { expect(normalizeAssumption(validAssumption({ subject: "  User.Role  " })).subject).toBe("user.role"); });
  it("trims statement and predicate", () => {
    const r = normalizeAssumption(validAssumption({ statement: "  hello  ", predicate: "  world  " }));
    expect(r.statement).toBe("hello"); expect(r.predicate).toBe("world");
  });
  it("does not mutate the original", () => {
    const original = validAssumption({ subject: "  User.Role  " });
    normalizeAssumption(original);
    expect(original.subject).toBe("  User.Role  ");
  });
});

describe("assertValidSemanticAssumption", () => {
  it("does not throw for a valid assumption", () => { expect(() => assertValidSemanticAssumption(validAssumption())).not.toThrow(); });
  it("throws for an invalid assumption", () => { expect(() => assertValidSemanticAssumption(validAssumption({ statement: "" }))).toThrow(/Invalid SemanticAssumption/); });
  it("includes the assumption id in error", () => { expect(() => assertValidSemanticAssumption(validAssumption({ id: "a-bad", subject: "" }))).toThrow(/a-bad/); });
});
