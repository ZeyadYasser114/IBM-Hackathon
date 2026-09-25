import { AnalysisInput, ChangeDescription, validateAnalysisInput, assertValidAnalysisInput } from "../src/types/input";
import { SourceType } from "../src/types/enums";

function validChange(overrides: Partial<ChangeDescription> = {}): ChangeDescription {
  return { id: "auth-agent", label: "Authentication role update", content: '-User.role = "admin"\n+User.role = "owner"', ...overrides };
}

function validInput(overrides: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    sessionId: "session-abc-123",
    requirementText: "Add organization billing. Only organization owners can manage subscriptions.",
    changes: [
      validChange({ id: "auth-agent", label: "Authentication role update" }),
      validChange({ id: "billing-agent", label: "Billing permission check", content: 'if (user.role === "admin") { manageSubscription(); }' }),
    ],
    ...overrides,
  };
}

describe("validateAnalysisInput", () => {
  it("returns no errors for a valid input", () => { expect(validateAnalysisInput(validInput())).toHaveLength(0); });
  it("returns no errors for a single change", () => { expect(validateAnalysisInput(validInput({ changes: [validChange()] }))).toHaveLength(0); });
  it("reports error for empty sessionId", () => { expect(validateAnalysisInput(validInput({ sessionId: "" })).some((e) => e.field === "sessionId")).toBe(true); });
  it("reports error for whitespace-only sessionId", () => { expect(validateAnalysisInput(validInput({ sessionId: "   " })).some((e) => e.field === "sessionId")).toBe(true); });
  it("reports error for empty requirementText", () => { expect(validateAnalysisInput(validInput({ requirementText: "" })).some((e) => e.field === "requirementText")).toBe(true); });
  it("reports error for empty changes array", () => { expect(validateAnalysisInput(validInput({ changes: [] })).some((e) => e.field === "changes")).toBe(true); });
  it("reports error for a change with an empty id", () => { expect(validateAnalysisInput(validInput({ changes: [validChange({ id: "" })] })).some((e) => e.field === "changes[0].id")).toBe(true); });
  it("reports error for duplicate change ids", () => {
    expect(validateAnalysisInput(validInput({ changes: [validChange({ id: "same-id" }), validChange({ id: "same-id" })] })).some((e) => e.message.includes("duplicate"))).toBe(true);
  });
  it("reports error for a file snippet with empty filePath", () => {
    expect(validateAnalysisInput(validInput({ changes: [validChange({ fileSnippets: [{ filePath: "", sourceType: SourceType.FILE_SNIPPET, content: "x" }] })] }))
      .some((e) => e.field.includes("fileSnippets") && e.field.includes("filePath"))).toBe(true);
  });
  it("accepts a valid file snippet with lineRange", () => {
    expect(validateAnalysisInput(validInput({ changes: [validChange({ fileSnippets: [{ filePath: "auth/roles.ts", sourceType: SourceType.FILE_SNIPPET, content: 'User.role = "owner"', lineRange: [12, 12] }] })] }))).toHaveLength(0);
  });
});

describe("assertValidAnalysisInput", () => {
  it("does not throw for a valid input", () => { expect(() => assertValidAnalysisInput(validInput())).not.toThrow(); });
  it("throws and includes sessionId", () => { expect(() => assertValidAnalysisInput(validInput({ sessionId: "s-fail", requirementText: "" }))).toThrow(/s-fail/); });
});
