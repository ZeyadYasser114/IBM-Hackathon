import { EvidenceReference, validateEvidenceReference, assertValidEvidenceReference } from "../src/types/evidence";
import { SourceType } from "../src/types/enums";

function validEvidence(overrides: Partial<EvidenceReference> = {}): EvidenceReference {
  return { id: "ev-001", sourceType: SourceType.FILE_SNIPPET, filePath: "auth/roles.ts", text: 'User.role = "owner"', ...overrides };
}

describe("validateEvidenceReference", () => {
  it("returns no errors for a valid reference", () => { expect(validateEvidenceReference(validEvidence())).toHaveLength(0); });
  it("returns no errors when optional fields are absent", () => {
    expect(validateEvidenceReference({ id: "ev-min", sourceType: SourceType.REQUIREMENT, text: "Only owners can manage subscriptions." })).toHaveLength(0);
  });
  it("reports error for empty id", () => { expect(validateEvidenceReference(validEvidence({ id: "  " })).some((e) => e.field === "id")).toBe(true); });
  it("reports error for empty text", () => { expect(validateEvidenceReference(validEvidence({ text: "" })).some((e) => e.field === "text")).toBe(true); });
  it("reports error for invalid sourceType", () => {
    expect(validateEvidenceReference(validEvidence({ sourceType: "UNKNOWN" as SourceType })).some((e) => e.field === "sourceType")).toBe(true);
  });
  it("reports error when lineRange start > end", () => {
    expect(validateEvidenceReference(validEvidence({ lineRange: [10, 5] as unknown as readonly [number, number] })).some((e) => e.field === "lineRange")).toBe(true);
  });
  it("reports error when lineRange start is zero", () => {
    expect(validateEvidenceReference(validEvidence({ lineRange: [0, 5] as unknown as readonly [number, number] })).some((e) => e.field === "lineRange[0]")).toBe(true);
  });
  it("accepts a valid lineRange", () => { expect(validateEvidenceReference(validEvidence({ lineRange: [3, 3] }))).toHaveLength(0); });
});

describe("assertValidEvidenceReference", () => {
  it("does not throw for a valid reference", () => { expect(() => assertValidEvidenceReference(validEvidence())).not.toThrow(); });
  it("throws a descriptive error for an invalid reference", () => {
    expect(() => assertValidEvidenceReference(validEvidence({ id: "" }))).toThrow(/Invalid EvidenceReference/);
  });
});
