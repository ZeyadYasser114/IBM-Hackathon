/**
 * conflict-detector.test.ts
 *
 * Full test suite for the semantic conflict detector (prompt 4).
 *
 * Structure:
 *  - BUSINESS_RULE positive case (canonical owner/admin demo)
 *  - CONTRACT positive case
 *  - DEPENDENCY positive case
 *  - Non-conflicting assumptions (must produce zero conflicts)
 *  - Ambiguous / weak evidence (must produce zero conflicts)
 *  - Duplicate evidence (must deduplicate)
 *  - Multiple simultaneous conflicts
 *  - Output ordering (deterministic)
 *  - Edge cases (empty input, single assumption)
 */

import { detectConflicts } from "../../src/detection/conflict-detector";
import { normalizeAssumptions } from "../../src/normalization/normalization-pipeline";
import { SemanticAssumption } from "../../src/types/assumption";
import { ConflictType, Severity, Confidence, SourceType } from "../../src/types/enums";
import { NormalizedAssumption } from "../../src/normalization/evidence-anchor";

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

/** Shorthand: create + normalize a single assumption. */
function norm(
  id: string,
  subject: string,
  predicate: string,
  overrides: Partial<SemanticAssumption> = {}
): NormalizedAssumption {
  return normalizeAssumptions([makeAssumption(id, subject, predicate, overrides)])[0]!;
}

// ---------------------------------------------------------------------------
// 1. BUSINESS_RULE — canonical owner/admin demo
// ---------------------------------------------------------------------------

describe("detectConflicts — BUSINESS_RULE (canonical demo)", () => {
  it("detects HIGH-severity conflict when auth uses 'owner' and billing uses 'admin'", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("req", "user role", "allowed_role = owner",
        { sourceType: SourceType.REQUIREMENT, evidenceText: "Only organization owners can manage subscriptions." }),
      makeAssumption("auth", "User.role", "allowed_role = owner",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "auth/roles.ts", evidenceText: 'User.role = "owner"' }),
      makeAssumption("billing", "user.role", "allowed_role = admin",
        { sourceType: SourceType.FILE_SNIPPET, sourceFile: "billing/permissions.ts", evidenceText: 'if (user.role === "admin")' }),
    ]);

    const conflicts = detectConflicts(assumptions);

    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const conflict = conflicts.find((c) => c.conflictType === ConflictType.BUSINESS_RULE);
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe(Severity.HIGH);
    expect(conflict!.confidence).toBe(Confidence.HIGH);
  });

  it("conflict explanation mentions both values (owner and admin)", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    const conflicts = detectConflicts(assumptions);
    expect(conflicts[0]!.explanation).toContain("owner");
    expect(conflicts[0]!.explanation).toContain("admin");
  });

  it("conflict carries both left and right assumptions", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    const conflict = detectConflicts(assumptions)[0]!;
    expect(conflict.leftAssumption).toBeDefined();
    expect(conflict.rightAssumption).toBeDefined();
    const values = [conflict.leftAssumption.predicate, conflict.rightAssumption.predicate];
    expect(values.some((v) => v.includes("owner"))).toBe(true);
    expect(values.some((v) => v.includes("admin"))).toBe(true);
  });

  it("affected entity is the normalized subject key", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    expect(detectConflicts(assumptions)[0]!.affectedEntity).toBe("user_role");
  });

  it("affected files are collected from both sides when sourceFile is present", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner",
        { sourceFile: "auth/roles.ts" }),
      makeAssumption("billing", "user_role", "allowed_role = admin",
        { sourceFile: "billing/permissions.ts" }),
    ]);
    const conflict = detectConflicts(assumptions)[0]!;
    expect(conflict.affectedFiles).toContain("auth/roles.ts");
    expect(conflict.affectedFiles).toContain("billing/permissions.ts");
  });

  it("evidence references include evidence from both sides", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner",
        { evidenceText: 'User.role = "owner"' }),
      makeAssumption("billing", "user_role", "allowed_role = admin",
        { evidenceText: 'if (user.role === "admin")' }),
    ]);
    const conflict = detectConflicts(assumptions)[0]!;
    expect(conflict.evidenceReferences.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 2. CONTRACT conflict
// ---------------------------------------------------------------------------

describe("detectConflicts — CONTRACT", () => {
  it("detects conflict when API emits 'accountId' but consumer expects 'account_number'", () => {
    // These two values normalize differently and remain distinct after normalization:
    // "accountId" → "account_id", "account_number" stays "account_number"
    const assumptions = normalizeAssumptions([
      makeAssumption("api", "api_response_field", "field_name = accountId"),
      makeAssumption("frontend", "api_response_field", "field_name = account_number"),
    ]);
    const conflicts = detectConflicts(assumptions);
    const contract = conflicts.find((c) => c.conflictType === ConflictType.CONTRACT);
    expect(contract).toBeDefined();
    expect(contract!.severity).toBe(Severity.HIGH);
  });

  it("explanation mentions both field names", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("api", "api_response_field", "field_name = accountId"),
      makeAssumption("frontend", "api_response_field", "field_name = account_number"),
    ]);
    const contract = detectConflicts(assumptions)[0]!;
    expect(contract.explanation).toContain("account_id");
    expect(contract.explanation).toContain("account_number");
  });

  it("does NOT flag camelCase vs snake_case when they refer to the same field (userId = user_id)", () => {
    // userId normalizes to user_id — same canonical → no conflict
    const assumptions = normalizeAssumptions([
      makeAssumption("api", "api_response_field", "field_name = userId"),
      makeAssumption("frontend", "api_response_field", "field_name = user_id"),
    ]);
    expect(detectConflicts(assumptions)).toHaveLength(0);
  });

  it("detects type mismatch contract conflict", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("schema", "api_response_field", "type = string"),
      makeAssumption("consumer", "api_response_field", "type = number"),
    ]);
    const conflicts = detectConflicts(assumptions);
    expect(conflicts.some((c) => c.conflictType === ConflictType.CONTRACT)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. DEPENDENCY conflict
// ---------------------------------------------------------------------------

describe("detectConflicts — DEPENDENCY", () => {
  it("detects conflict when email is made optional but another service assumes it is always present", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("model", "email", "is_required = false",
        { evidenceText: "The email field is optional." }),
      makeAssumption("notif", "email", "is_required = true",
        { evidenceText: "The notification service assumes every user has email." }),
    ]);
    const conflicts = detectConflicts(assumptions);
    const dep = conflicts.find((c) => c.conflictType === ConflictType.DEPENDENCY);
    expect(dep).toBeDefined();
    expect(dep!.severity).toBe(Severity.HIGH);
  });

  it("explanation mentions 'optional' or 'present'", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("model", "email", "is_required = false"),
      makeAssumption("notif", "email", "is_required = true"),
    ]);
    const dep = detectConflicts(assumptions)[0]!;
    expect(dep.explanation.toLowerCase()).toMatch(/optional|present/);
  });

  it("detects always_present conflict", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("model", "email", "always_present = false"),
      makeAssumption("notif", "email", "always_present = true"),
    ]);
    const conflicts = detectConflicts(assumptions);
    expect(conflicts.some((c) => c.conflictType === ConflictType.DEPENDENCY)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Non-conflicting assumptions — must produce zero conflicts
// ---------------------------------------------------------------------------

describe("detectConflicts — non-conflicting assumptions", () => {
  it("returns empty when assumptions agree on the same value", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = owner"),
    ]);
    expect(detectConflicts(assumptions)).toHaveLength(0);
  });

  it("returns empty when assumptions are about entirely different entities", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("schema", "email", "is_required = true"),
    ]);
    expect(detectConflicts(assumptions)).toHaveLength(0);
  });

  it("returns empty when assumptions have different predicate keys (unrelated)", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
      makeAssumption("b", "user_role", "type = string"),
    ]);
    // Different keys on the same subject — not a conflict
    expect(detectConflicts(assumptions)).toHaveLength(0);
  });

  it("returns empty for a single assumption", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
    ]);
    expect(detectConflicts(assumptions)).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(detectConflicts([])).toHaveLength(0);
  });

  it("does not flag style differences or unrelated edits", () => {
    // Two assumptions about completely unrelated code changes
    const assumptions = normalizeAssumptions([
      makeAssumption("a", "logging_format", "must_be = json"),
      makeAssumption("b", "logging_format", "must_be = json"),
    ]);
    expect(detectConflicts(assumptions)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Ambiguous evidence — must produce zero conflicts
// ---------------------------------------------------------------------------

describe("detectConflicts — ambiguous evidence (no conflict)", () => {
  it("does not flag assumptions where values differ but predicate key is not classifiable", () => {
    // "description = short" vs "description = long" — not a semantic conflict
    const assumptions = normalizeAssumptions([
      makeAssumption("a", "commit_message", "description = short"),
      makeAssumption("b", "commit_message", "description = long"),
    ]);
    expect(detectConflicts(assumptions)).toHaveLength(0);
  });

  it("does not flag assumptions with no value part", () => {
    // predicates without a value side cannot be compared meaningfully
    const left = norm("a", "user_role", "required_role");
    const right = norm("b", "user_role", "required_role");
    expect(detectConflicts([left, right])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Duplicate evidence — must deduplicate
// ---------------------------------------------------------------------------

describe("detectConflicts — deduplication", () => {
  it("returns one conflict when the same pair is presented multiple times", () => {
    const a = norm("auth", "user_role", "allowed_role = owner");
    const b = norm("billing", "user_role", "allowed_role = admin");
    // Run detection on a list that contains the pair twice (simulate duplicate extraction)
    const conflicts = detectConflicts([a, b, a, b]);
    expect(conflicts).toHaveLength(1);
  });

  it("evidence references within one conflict are deduplicated by id", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner",
        { evidenceText: 'User.role = "owner"' }),
      makeAssumption("billing", "user_role", "allowed_role = admin",
        { evidenceText: 'user.role === "admin"' }),
    ]);
    const conflict = detectConflicts(assumptions)[0]!;
    const ids = conflict.evidenceReferences.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// 7. Multiple simultaneous conflicts
// ---------------------------------------------------------------------------

describe("detectConflicts — multiple simultaneous conflicts", () => {
  it("returns separate conflicts for role and email in the same run", () => {
    const assumptions = normalizeAssumptions([
      // Role conflict
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
      // Email dependency conflict
      makeAssumption("model", "email", "is_required = false"),
      makeAssumption("notif", "email", "is_required = true"),
    ]);
    const conflicts = detectConflicts(assumptions);
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
    expect(conflicts.some((c) => c.conflictType === ConflictType.BUSINESS_RULE)).toBe(true);
    expect(conflicts.some((c) => c.conflictType === ConflictType.DEPENDENCY)).toBe(true);
  });

  it("returns three conflicts when all three types are present", () => {
    const assumptions = normalizeAssumptions([
      // Business rule
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
      // Contract (values stay distinct after normalization)
      makeAssumption("api", "api_response_field", "field_name = accountId"),
      makeAssumption("client", "api_response_field", "field_name = account_number"),
      // Dependency
      makeAssumption("db", "email", "is_required = false"),
      makeAssumption("mailer", "email", "is_required = true"),
    ]);
    const conflicts = detectConflicts(assumptions);
    expect(conflicts.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 8. Deterministic output ordering
// ---------------------------------------------------------------------------

describe("detectConflicts — deterministic ordering", () => {
  it("HIGH severity conflicts appear before MEDIUM and LOW", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("a1", "user_role", "allowed_role = owner"),
      makeAssumption("a2", "user_role", "allowed_role = admin"),
      makeAssumption("b1", "email", "is_required = false"),
      makeAssumption("b2", "email", "is_required = true"),
    ]);
    const conflicts = detectConflicts(assumptions);
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
    const firstSeverity = conflicts[0]!.severity;
    const lastSeverity = conflicts[conflicts.length - 1]!.severity;
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
    expect(rank[firstSeverity]).toBeLessThanOrEqual(rank[lastSeverity]);
  });

  it("produces identical output on repeated calls with same input", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    const run1 = detectConflicts(assumptions).map((c) => c.id);
    const run2 = detectConflicts(assumptions).map((c) => c.id);
    expect(run1).toEqual(run2);
  });

  it("conflict id is deterministic regardless of assumption order", () => {
    const a = norm("auth", "user_role", "allowed_role = owner");
    const b = norm("billing", "user_role", "allowed_role = admin");
    const id1 = detectConflicts([a, b])[0]!.id;
    const id2 = detectConflicts([b, a])[0]!.id;
    expect(id1).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// 9. SemanticConflict shape
// ---------------------------------------------------------------------------

describe("detectConflicts — output shape", () => {
  it("every conflict has a non-empty id", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    detectConflicts(assumptions).forEach((c) => expect(c.id).toBeTruthy());
  });

  it("every conflict has a valid confirmedAt ISO timestamp", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    detectConflicts(assumptions).forEach((c) => {
      expect(isNaN(Date.parse(c.confirmedAt))).toBe(false);
    });
  });

  it("every conflict has at least one evidence reference", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    detectConflicts(assumptions).forEach((c) => {
      expect(c.evidenceReferences.length).toBeGreaterThan(0);
    });
  });

  it("every conflict has a non-empty explanation", () => {
    const assumptions = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner"),
      makeAssumption("billing", "user_role", "allowed_role = admin"),
    ]);
    detectConflicts(assumptions).forEach((c) => expect(c.explanation).toBeTruthy());
  });
});
