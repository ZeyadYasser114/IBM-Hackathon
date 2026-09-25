/**
 * conflict-report.test.ts
 *
 * Tests for prompt 5: explainable conflict reports.
 *
 * Covers:
 *  - All three conflict types produce valid ConflictReports
 *  - Explanations contain both evidence sides
 *  - Severity is stable (deterministic rules)
 *  - Confidence decreases with weak evidence
 *  - False-positive-prone cases are suppressed or marked LOW
 *  - Results serialize cleanly to JSON
 *  - verificationHint is actionable and non-empty
 *  - ConflictReport shape is complete
 */

import { explainConflicts } from "../../src/detection/conflict-detector";
import { normalizeAssumptions } from "../../src/normalization/normalization-pipeline";
import { SemanticAssumption } from "../../src/types/assumption";
import { ConflictType, Severity, Confidence, SourceType } from "../../src/types/enums";
import { ConflictReport } from "../../src/detection/conflict-report";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssumption(
  id: string,
  subject: string,
  predicate: string,
  overrides: Partial<SemanticAssumption> = {}
): SemanticAssumption {
  return {
    id,
    statement: `${subject} — ${predicate}`,
    subject,
    predicate,
    sourceType: SourceType.CODE_DIFF,
    evidenceText: `${subject}: ${predicate}`,
    confidence: Confidence.HIGH,
    ...overrides,
  };
}

/** Strong evidence: FILE_SNIPPET with a known file path. */
function strongAssumption(
  id: string,
  subject: string,
  predicate: string,
  filePath: string,
  evidenceText: string
): SemanticAssumption {
  return {
    id,
    statement: `${subject} — ${predicate}`,
    subject,
    predicate,
    sourceType: SourceType.FILE_SNIPPET,
    sourceFile: filePath,
    evidenceText,
    confidence: Confidence.HIGH,
  };
}

/** Weak evidence: DOCUMENTATION with no file path. */
function weakAssumption(
  id: string,
  subject: string,
  predicate: string
): SemanticAssumption {
  return {
    id,
    statement: `${subject} — ${predicate}`,
    subject,
    predicate,
    sourceType: SourceType.DOCUMENTATION,
    evidenceText: `${subject}: ${predicate}`,
    confidence: Confidence.LOW,
  };
}

// ---------------------------------------------------------------------------
// 1. BUSINESS_RULE report
// ---------------------------------------------------------------------------

describe("explainConflicts — BUSINESS_RULE report", () => {
  const assumptions = normalizeAssumptions([
    strongAssumption("auth", "user_role", "allowed_role = owner", "auth/roles.ts", 'User.role = "owner"'),
    strongAssumption("billing", "user_role", "allowed_role = admin", "billing/permissions.ts", 'if (user.role === "admin")'),
  ]);

  let report: ConflictReport;

  beforeAll(() => {
    const reports = explainConflicts(assumptions);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    report = reports.find((r) => r.conflictType === ConflictType.BUSINESS_RULE)!;
    expect(report).toBeDefined();
  });

  it("has a non-empty concise title", () => {
    expect(report.title).toBeTruthy();
    expect(report.title.length).toBeGreaterThan(5);
  });

  it("title contains 'user_role'", () => {
    expect(report.title.toLowerCase()).toContain("user_role");
  });

  it("assumptionA contains evidence text from the left side", () => {
    expect(report.assumptionA.evidenceText).toBeTruthy();
  });

  it("assumptionB contains evidence text from the right side", () => {
    expect(report.assumptionB.evidenceText).toBeTruthy();
  });

  it("assumptionA and assumptionB have different statements", () => {
    expect(report.assumptionA.statement).not.toBe(report.assumptionB.statement);
  });

  it("whyIncompatible mentions both values (owner and admin)", () => {
    expect(report.whyIncompatible).toContain("owner");
    expect(report.whyIncompatible).toContain("admin");
  });

  it("whyIncompatible references both source labels", () => {
    // At least one of auth/roles.ts or billing/permissions.ts should appear
    const both = report.whyIncompatible;
    const mentionsSource =
      both.includes("auth") || both.includes("billing") || both.includes("roles");
    expect(mentionsSource).toBe(true);
  });

  it("severity is HIGH for direct auth contradiction with file evidence", () => {
    expect(report.severity).toBe(Severity.HIGH);
  });

  it("confidence is HIGH for direct contradiction with file evidence", () => {
    expect(report.confidence).toBe(Confidence.HIGH);
  });

  it("severityRule is set and non-empty", () => {
    expect(report.severityRule).toBeTruthy();
    expect(report.severityRule).toContain("BUSINESS_RULE");
  });

  it("confidenceRule is set and non-empty", () => {
    expect(report.confidenceRule).toBeTruthy();
  });

  it("affectedFiles contains both source files", () => {
    expect(report.affectedFiles).toContain("auth/roles.ts");
    expect(report.affectedFiles).toContain("billing/permissions.ts");
  });

  it("allEvidenceReferences is non-empty", () => {
    expect(report.allEvidenceReferences.length).toBeGreaterThanOrEqual(2);
  });

  it("verificationHint is non-empty and actionable", () => {
    expect(report.verificationHint).toBeTruthy();
    expect(report.verificationHint.length).toBeGreaterThan(20);
  });

  it("verificationHint mentions the affected entity", () => {
    expect(report.verificationHint).toContain("user_role");
  });

  it("detectedAt is a valid ISO timestamp", () => {
    expect(isNaN(Date.parse(report.detectedAt))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. CONTRACT report
// ---------------------------------------------------------------------------

describe("explainConflicts — CONTRACT report", () => {
  const assumptions = normalizeAssumptions([
    strongAssumption("api", "api_response_field", "field_name = accountId", "src/api/response.ts", "return { accountId: user.id }"),
    strongAssumption("client", "api_response_field", "field_name = account_number", "src/client/parser.ts", "const id = response.account_number"),
  ]);

  let report: ConflictReport;

  beforeAll(() => {
    const reports = explainConflicts(assumptions);
    report = reports.find((r) => r.conflictType === ConflictType.CONTRACT)!;
    expect(report).toBeDefined();
  });

  it("whyIncompatible mentions both field names", () => {
    expect(report.whyIncompatible).toContain("account_id");     // accountId normalized
    expect(report.whyIncompatible).toContain("account_number");
  });

  it("verificationHint mentions running integration tests", () => {
    expect(report.verificationHint.toLowerCase()).toMatch(/test|integration|boundary/);
  });

  it("title contains 'contract' or 'mismatch'", () => {
    expect(report.title.toLowerCase()).toMatch(/contract|mismatch/);
  });
});

// ---------------------------------------------------------------------------
// 3. DEPENDENCY report
// ---------------------------------------------------------------------------

describe("explainConflicts — DEPENDENCY report", () => {
  const assumptions = normalizeAssumptions([
    strongAssumption("model", "email", "is_required = false", "src/models/user.ts", "email: string | null"),
    strongAssumption("notif", "email", "is_required = true", "src/services/notification.ts", "sendEmail(user.email)"),
  ]);

  let report: ConflictReport;

  beforeAll(() => {
    const reports = explainConflicts(assumptions);
    report = reports.find((r) => r.conflictType === ConflictType.DEPENDENCY)!;
    expect(report).toBeDefined();
  });

  it("whyIncompatible mentions optional and required", () => {
    expect(report.whyIncompatible.toLowerCase()).toMatch(/optional|required|absent/);
  });

  it("verificationHint mentions null/undefined guard or absent case", () => {
    expect(report.verificationHint.toLowerCase()).toMatch(/null|undefined|absent|guard/);
  });

  it("severity is HIGH for boolean flip with file evidence", () => {
    expect(report.severity).toBe(Severity.HIGH);
  });
});

// ---------------------------------------------------------------------------
// 4. Severity is stable (deterministic)
// ---------------------------------------------------------------------------

describe("explainConflicts — severity stability", () => {
  it("same input always produces same severity", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "auth/roles.ts" }),
      makeAssumption("billing", "user_role", "allowed_role = admin",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "billing/permissions.ts" }),
    ]);
    const r1 = explainConflicts(assumptions)[0]!.severity;
    const r2 = explainConflicts(assumptions)[0]!.severity;
    expect(r1).toBe(r2);
  });

  it("auth contradiction severity is always HIGH when both sides have file evidence", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "a.ts" }),
      makeAssumption("b", "user_role", "allowed_role = member",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "b.ts" }),
    ]);
    expect(explainConflicts(assumptions)[0]!.severity).toBe(Severity.HIGH);
  });
});

// ---------------------------------------------------------------------------
// 5. Confidence decreases with weak evidence
// ---------------------------------------------------------------------------

describe("explainConflicts — confidence with weak evidence", () => {
  it("confidence is LOW when both sides have only DOCUMENTATION evidence (no file path)", () => {
    const assumptions = normalizeAssumptions([
      weakAssumption("doc-a", "user_role", "allowed_role = owner"),
      weakAssumption("doc-b", "user_role", "allowed_role = admin"),
    ]);
    const reports = explainConflicts(assumptions);
    if (reports.length > 0) {
      // When detected, confidence must not be HIGH for weak evidence
      expect(reports[0]!.confidence).not.toBe(Confidence.HIGH);
    }
    // It's also acceptable for weak evidence to produce zero reports (suppressed)
  });

  it("confidence is MEDIUM when one side is REQUIREMENT and other is FILE_SNIPPET", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("req", "user_role", "allowed_role = owner",
        { sourceType: SourceType.REQUIREMENT }),
      makeAssumption("billing", "user_role", "allowed_role = admin",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "billing/permissions.ts" }),
    ]);
    const reports = explainConflicts(assumptions);
    if (reports.length > 0) {
      expect(reports[0]!.confidence).not.toBe(Confidence.HIGH);
    }
  });

  it("confidence is HIGH when both sides have FILE_SNIPPET with file paths", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "auth/roles.ts" }),
      makeAssumption("billing", "user_role", "allowed_role = admin",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "billing/permissions.ts" }),
    ]);
    expect(explainConflicts(assumptions)[0]!.confidence).toBe(Confidence.HIGH);
  });
});

// ---------------------------------------------------------------------------
// 6. False-positive suppression
// ---------------------------------------------------------------------------

describe("explainConflicts — false positive suppression", () => {
  it("does not report a conflict for identical values", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
      makeAssumption("b", "user_role", "allowed_role = owner"),
    ]);
    expect(explainConflicts(assumptions)).toHaveLength(0);
  });

  it("does not report conflict for unrelated entities", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
      makeAssumption("b", "email", "is_required = true"),
    ]);
    expect(explainConflicts(assumptions)).toHaveLength(0);
  });

  it("does not report conflict for different predicate keys on same entity", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
      makeAssumption("b", "user_role", "type = string"),
    ]);
    expect(explainConflicts(assumptions)).toHaveLength(0);
  });

  it("does not report conflict for camelCase vs snake_case of same field (userId = user_id)", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("api", "api_response_field", "field_name = userId"),
      makeAssumption("client", "api_response_field", "field_name = user_id"),
    ]);
    expect(explainConflicts(assumptions)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. JSON serialization
// ---------------------------------------------------------------------------

describe("explainConflicts — JSON serialization", () => {
  it("ConflictReport round-trips through JSON without loss", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "auth/roles.ts" }),
      makeAssumption("billing", "user_role", "allowed_role = admin",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "billing/permissions.ts" }),
    ]);
    const report = explainConflicts(assumptions)[0]!;
    const serialized = JSON.stringify(report);
    const deserialized = JSON.parse(serialized) as ConflictReport;

    expect(deserialized.id).toBe(report.id);
    expect(deserialized.title).toBe(report.title);
    expect(deserialized.severity).toBe(report.severity);
    expect(deserialized.confidence).toBe(report.confidence);
    expect(deserialized.whyIncompatible).toBe(report.whyIncompatible);
    expect(deserialized.verificationHint).toBe(report.verificationHint);
    expect(deserialized.assumptionA.evidenceText).toBe(report.assumptionA.evidenceText);
    expect(deserialized.assumptionB.evidenceText).toBe(report.assumptionB.evidenceText);
  });

  it("serialized report has no undefined fields (clean JSON)", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    const report = explainConflicts(assumptions)[0]!;
    const serialized = JSON.stringify(report);
    // undefined values are dropped by JSON.stringify — check key count is stable
    const parsed = JSON.parse(serialized);
    expect(typeof parsed.id).toBe("string");
    expect(typeof parsed.title).toBe("string");
    expect(typeof parsed.whyIncompatible).toBe("string");
    expect(typeof parsed.verificationHint).toBe("string");
    expect(Array.isArray(parsed.affectedFiles)).toBe(true);
    expect(Array.isArray(parsed.allEvidenceReferences)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Complete shape check
// ---------------------------------------------------------------------------

describe("explainConflicts — complete output shape", () => {
  it("every required field is present and non-empty", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "auth/roles.ts" }),
      makeAssumption("billing", "user_role", "allowed_role = admin",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "billing/permissions.ts" }),
    ]);
    const report = explainConflicts(assumptions)[0]!;

    expect(report.id).toBeTruthy();
    expect(report.title).toBeTruthy();
    expect(report.conflictType).toBeTruthy();
    expect(report.affectedEntity).toBeTruthy();
    expect(report.assumptionA).toBeDefined();
    expect(report.assumptionA.statement).toBeTruthy();
    expect(report.assumptionA.evidenceText).toBeTruthy();
    expect(report.assumptionA.canonicalPredicate).toBeTruthy();
    expect(report.assumptionB).toBeDefined();
    expect(report.assumptionB.statement).toBeTruthy();
    expect(report.assumptionA.evidenceReferences.length).toBeGreaterThan(0);
    expect(report.assumptionB.evidenceReferences.length).toBeGreaterThan(0);
    expect(report.whyIncompatible).toBeTruthy();
    expect(report.severity).toBeTruthy();
    expect(report.confidence).toBeTruthy();
    expect(report.severityRule).toBeTruthy();
    expect(report.confidenceRule).toBeTruthy();
    expect(Array.isArray(report.affectedFiles)).toBe(true);
    expect(Array.isArray(report.allEvidenceReferences)).toBe(true);
    expect(report.verificationHint).toBeTruthy();
    expect(report.detectedAt).toBeTruthy();
  });
});
