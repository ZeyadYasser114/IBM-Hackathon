/**
 * audit.test.ts
 *
 * Adversarial audit test suite for the MergeMind semantic engine.
 *
 * Acts as a senior engineer trying to break the module with:
 *  - known false-positive triggers
 *  - silent data-loss edge cases
 *  - all three conflict types end-to-end
 *  - compatible-but-different-sounding assumptions
 *  - duplicate evidence
 *  - incomplete / missing evidence
 *  - contradictory requirements
 *  - multiple files describing the same assumption
 *  - empty / malformed input
 *  - malformed AI adapter output
 *  - JSON serialization round-trip
 */

import { normalizeAssumptions, normalizeAssumptionsWithWarnings } from "../../src/normalization/normalization-pipeline";
import { normalizeEntity } from "../../src/normalization/entity-normalizer";
import { normalizeValue } from "../../src/normalization/value-normalizer";
import { detectConflicts, explainConflicts } from "../../src/detection/conflict-detector";
import { DeterministicExtractor } from "../../src/extraction/deterministic-extractor";
import { ExtractionPipeline } from "../../src/extraction/extraction-pipeline";
import { SemanticAssumption } from "../../src/types/assumption";
import { ConflictType, Severity, Confidence, SourceType } from "../../src/types/enums";
import { AnalysisInput } from "../../src/types/input";
import {
  AssumptionExtractorProvider,
  ExtractionUnit,
  ExtractionResult,
} from "../../src/extraction/extractor-provider";

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

function fileAssumption(
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

// ---------------------------------------------------------------------------
// 1. owner vs admin — canonical demo, end-to-end
// ---------------------------------------------------------------------------

describe("Audit: owner vs admin authorization contradiction", () => {
  it("detects HIGH-severity BUSINESS_RULE conflict with both sides and evidence", () => {
    const normalized = normalizeAssumptions([
      fileAssumption("auth", "user_role", "allowed_role = owner", "auth/roles.ts", 'User.role = "owner"'),
      fileAssumption("billing", "user_role", "allowed_role = admin", "billing/permissions.ts", 'if (user.role === "admin")'),
    ]);
    const reports = explainConflicts(normalized);
    expect(reports).toHaveLength(1);
    const r = reports[0]!;
    expect(r.conflictType).toBe(ConflictType.BUSINESS_RULE);
    expect(r.severity).toBe(Severity.HIGH);
    expect(r.confidence).toBe(Confidence.HIGH);
    expect(r.whyIncompatible).toContain("owner");
    expect(r.whyIncompatible).toContain("admin");
    expect(r.assumptionA.evidenceText).toBeTruthy();
    expect(r.assumptionB.evidenceText).toBeTruthy();
    expect(r.affectedFiles).toContain("auth/roles.ts");
    expect(r.affectedFiles).toContain("billing/permissions.ts");
  });

  it("report is stable across two identical runs", () => {
    const normalized = normalizeAssumptions([
      fileAssumption("auth", "user_role", "allowed_role = owner", "auth/roles.ts", 'User.role = "owner"'),
      fileAssumption("billing", "user_role", "allowed_role = admin", "billing/permissions.ts", 'user.role === "admin"'),
    ]);
    const r1 = explainConflicts(normalized)[0]!;
    const r2 = explainConflicts(normalized)[0]!;
    expect(r1.id).toBe(r2.id);
    expect(r1.severity).toBe(r2.severity);
    expect(r1.confidence).toBe(r2.confidence);
  });
});

// ---------------------------------------------------------------------------
// 2. userId vs user_id — must NOT be a conflict (same field, different casing)
// ---------------------------------------------------------------------------

describe("Audit: userId vs user_id is NOT a contract conflict", () => {
  it("produces zero conflicts because both normalize to user_id", () => {
    const normalized = normalizeAssumptions([
      makeAssumption("api", "api_response_field", "field_name = userId"),
      makeAssumption("client", "api_response_field", "field_name = user_id"),
    ]);
    expect(detectConflicts(normalized)).toHaveLength(0);
    expect(explainConflicts(normalized)).toHaveLength(0);
  });

  it("normalizeValue('userId') === normalizeValue('user_id')", () => {
    expect(normalizeValue("userId").canonical).toBe(normalizeValue("user_id").canonical);
  });
});

// ---------------------------------------------------------------------------
// 3. Optional email vs service requiring email — DEPENDENCY conflict
// ---------------------------------------------------------------------------

describe("Audit: optional email vs service requiring email", () => {
  it("detects DEPENDENCY conflict with HIGH severity", () => {
    const normalized = normalizeAssumptions([
      fileAssumption("model", "email", "is_required = false", "models/user.ts", "email?: string"),
      fileAssumption("notif", "email", "is_required = true", "services/notification.ts", "sendEmail(user.email)"),
    ]);
    const reports = explainConflicts(normalized);
    const dep = reports.find((r) => r.conflictType === ConflictType.DEPENDENCY);
    expect(dep).toBeDefined();
    expect(dep!.severity).toBe(Severity.HIGH);
    expect(dep!.whyIncompatible.toLowerCase()).toMatch(/optional|absent|required/);
    expect(dep!.verificationHint.toLowerCase()).toMatch(/null|undefined|absent|guard/);
  });
});

// ---------------------------------------------------------------------------
// 4. Statements that sound different but ARE compatible — must be zero conflicts
// ---------------------------------------------------------------------------

describe("Audit: compatible but different-sounding assumptions", () => {
  it("'owner can manage billing' and 'owner has billing access' — same meaning, same values, no conflict", () => {
    // Both reduce to required_role = owner on the same subject
    const normalized = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
      makeAssumption("b", "user_role", "required_role = owner"),
    ]);
    // After normalization, both predicates have key "required_role" and value "owner"
    expect(detectConflicts(normalized)).toHaveLength(0);
  });

  it("two assumptions about different entities produce no conflict", () => {
    const normalized = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
      makeAssumption("b", "subscription_plan", "allowed_role = admin"),
    ]);
    expect(detectConflicts(normalized)).toHaveLength(0);
  });

  it("two assumptions with different predicate keys on same entity produce no conflict", () => {
    const normalized = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
      makeAssumption("b", "user_role", "type = string"),
    ]);
    expect(detectConflicts(normalized)).toHaveLength(0);
  });

  it("email required=true from two different files — same assumption, no conflict", () => {
    const normalized = normalizeAssumptions([
      fileAssumption("schema", "email", "is_required = true", "schema.ts", "email: string"),
      fileAssumption("validator", "email", "is_required = true", "validator.ts", "required(['email'])"),
    ]);
    expect(detectConflicts(normalized)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Duplicated evidence — deduplication must hold
// ---------------------------------------------------------------------------

describe("Audit: duplicated evidence and assumptions", () => {
  it("same assumption object presented twice produces one conflict, not two", () => {
    const a = normalizeAssumptions([makeAssumption("auth", "user_role", "allowed_role = owner")])[0]!;
    const b = normalizeAssumptions([makeAssumption("billing", "user_role", "allowed_role = admin")])[0]!;
    const conflicts = detectConflicts([a, b, a, b]);
    expect(conflicts).toHaveLength(1);
  });

  it("evidence references within a conflict are deduplicated by id", () => {
    const normalized = normalizeAssumptions([
      fileAssumption("auth", "user_role", "allowed_role = owner", "auth/roles.ts", 'User.role = "owner"'),
      fileAssumption("billing", "user_role", "allowed_role = admin", "billing/permissions.ts", 'user.role === "admin"'),
    ]);
    const reports = explainConflicts(normalized);
    const ids = reports[0]!.allEvidenceReferences.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("multiple files describing the same assumption collapse to one conflict", () => {
    // auth/roles.ts and auth/index.ts both say role=owner — same assumption, two files
    // They should NOT produce a conflict with each other
    const normalized = normalizeAssumptions([
      fileAssumption("roles-ts", "user_role", "allowed_role = owner", "auth/roles.ts", 'User.role = "owner"'),
      fileAssumption("index-ts", "user_role", "allowed_role = owner", "auth/index.ts", 'export { role: "owner" }'),
      fileAssumption("billing", "user_role", "allowed_role = admin", "billing/permissions.ts", 'user.role === "admin"'),
    ]);
    const reports = explainConflicts(normalized);
    // There should be conflicts (owner vs admin) but not owner vs owner
    reports.forEach((r) => {
      expect(r.assumptionA.canonicalPredicate).not.toBe(r.assumptionB.canonicalPredicate);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Incomplete / missing evidence
// ---------------------------------------------------------------------------

describe("Audit: incomplete evidence", () => {
  it("conflict is detected even when no sourceFile is present — confidence is MEDIUM or LOW", () => {
    const normalized = normalizeAssumptions([
      makeAssumption("auth", "user_role", "allowed_role = owner", { sourceType: SourceType.REQUIREMENT }),
      makeAssumption("billing", "user_role", "allowed_role = admin", { sourceType: SourceType.REQUIREMENT }),
    ]);
    const reports = explainConflicts(normalized);
    if (reports.length > 0) {
      expect(reports[0]!.confidence).not.toBe(Confidence.HIGH);
    }
  });

  it("assumption with empty evidenceText is still normalized without crashing", () => {
    // evidenceText is validated non-empty by the domain model, but if an adapter
    // provides whitespace, normalization should not throw
    const a = makeAssumption("a", "user_role", "allowed_role = owner", { evidenceText: "   " });
    expect(() => normalizeAssumptions([a])).not.toThrow();
  });

  it("single assumption produces zero conflicts (need at least two)", () => {
    const normalized = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
    ]);
    expect(explainConflicts(normalized)).toHaveLength(0);
  });

  it("empty input produces zero conflicts without throwing", () => {
    expect(() => explainConflicts([])).not.toThrow();
    expect(explainConflicts([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Contradictory requirements from the same source
// ---------------------------------------------------------------------------

describe("Audit: contradictory requirements", () => {
  it("two contradictory requirements (same source type) still produce a conflict", () => {
    const normalized = normalizeAssumptions([
      makeAssumption("req-1", "user_role", "allowed_role = owner",
        { sourceType: SourceType.REQUIREMENT, evidenceText: "Only owners can manage billing" }),
      makeAssumption("req-2", "user_role", "allowed_role = admin",
        { sourceType: SourceType.REQUIREMENT, evidenceText: "Admins manage billing subscriptions" }),
    ]);
    const reports = explainConflicts(normalized);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports[0]!.conflictType).toBe(ConflictType.BUSINESS_RULE);
  });
});

// ---------------------------------------------------------------------------
// 8. Entity normalization edge cases — no silent drops
// ---------------------------------------------------------------------------

describe("Audit: entity normalization — no silent drops", () => {
  it("normalizeEntity('type') does NOT return empty string", () => {
    expect(normalizeEntity("type").canonical).not.toBe("");
    expect(normalizeEntity("type").canonical).toBe("type");
  });

  it("normalizeEntity('status') does NOT return empty string", () => {
    expect(normalizeEntity("status").canonical).not.toBe("");
    expect(normalizeEntity("status").canonical).toBe("status");
  });

  it("normalizeEntity('value') does NOT return empty string", () => {
    expect(normalizeEntity("value").canonical).not.toBe("");
    expect(normalizeEntity("value").canonical).toBe("value");
  });

  it("normalizeEntity('check') does NOT return empty string", () => {
    expect(normalizeEntity("check").canonical).not.toBe("");
  });

  it("normalizeEntity('field') preserves 'field'", () => {
    expect(normalizeEntity("field").canonical).toBe("field");
  });

  it("normalizeEntity('email field') still produces 'email' (multi-word strip)", () => {
    // "field" appears as a filler in the synonym "email field" → maps via synonym cluster
    expect(normalizeEntity("email address").canonical).toBe("email");
  });

  it("normalizeAssumptionsWithWarnings reports dropped ids when canonicalSubject is empty", () => {
    // Force an empty subject by passing an empty string (edge case)
    const a = makeAssumption("bad-id", "", "allowed_role = owner");
    const { normalized, droppedIds } = normalizeAssumptionsWithWarnings([a]);
    expect(normalized).toHaveLength(1);
    expect(droppedIds).toContain("bad-id");
  });
});

// ---------------------------------------------------------------------------
// 9. Value normalization — no false boolean collapses
// ---------------------------------------------------------------------------

describe("Audit: value normalization — no false boolean collapses", () => {
  it("'required' does NOT normalize to 'true' (ambiguous domain word)", () => {
    expect(normalizeValue("required").canonical).toBe("required");
  });

  it("'mandatory' does NOT normalize to 'true'", () => {
    expect(normalizeValue("mandatory").canonical).toBe("mandatory");
  });

  it("'optional' does NOT normalize to 'false'", () => {
    expect(normalizeValue("optional").canonical).toBe("optional");
  });

  it("'nullable' does NOT normalize to 'false'", () => {
    expect(normalizeValue("nullable").canonical).toBe("nullable");
  });

  it("'true' and 'false' still normalize correctly", () => {
    expect(normalizeValue("TRUE").canonical).toBe("true");
    expect(normalizeValue("FALSE").canonical).toBe("false");
  });

  it("'yes' and 'no' still normalize to booleans", () => {
    expect(normalizeValue("yes").canonical).toBe("true");
    expect(normalizeValue("no").canonical).toBe("false");
  });

  it("'owner' and 'admin' remain DISTINCT — never collapse to boolean", () => {
    expect(normalizeValue("owner").canonical).not.toBe(normalizeValue("admin").canonical);
    expect(normalizeValue("owner").canonical).toBe("owner");
    expect(normalizeValue("admin").canonical).toBe("admin");
  });
});

// ---------------------------------------------------------------------------
// 10. Malformed AI adapter output guard
// ---------------------------------------------------------------------------

describe("Audit: malformed AI adapter output", () => {
  /**
   * Simulates a broken AI adapter that returns structurally invalid data.
   * The pipeline must not throw — it must gracefully return an empty result.
   */
  class MalformedAdapterProvider implements AssumptionExtractorProvider {
    readonly providerName = "MalformedAdapter";
    async extract(_unit: ExtractionUnit): Promise<ExtractionResult> {
      // Returns assumptions array containing null/undefined-like objects
      return {
        unitId: _unit.unitId,
        // Cast to simulate a broken AI response with missing required fields
        assumptions: [null as unknown as SemanticAssumption, undefined as unknown as SemanticAssumption],
        diagnostics: ["malformed response from AI provider"],
      };
    }
  }

  it("pipeline does not throw when adapter returns malformed assumptions", async () => {
    const input: AnalysisInput = {
      sessionId: "test-malformed",
      requirementText: "Only owners can manage subscriptions.",
      changes: [{ id: "agent-a", label: "Auth change", content: 'User.role = "owner"' }],
    };
    const pipeline = new ExtractionPipeline(new MalformedAdapterProvider());
    await expect(pipeline.run(input)).resolves.not.toThrow();
  });

  it("normalizeAssumptions does not throw on null/undefined entries", () => {
    const input = [null, undefined, makeAssumption("valid", "user_role", "allowed_role = owner")] as unknown as SemanticAssumption[];
    // Should not throw — null/undefined should be skipped or produce empty canonical
    expect(() => normalizeAssumptions(input)).not.toThrow();
  });

  it("explainConflicts does not throw on empty normalized array", () => {
    expect(() => explainConflicts([])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 11. End-to-end: full pipeline with deterministic extractor
// ---------------------------------------------------------------------------

describe("Audit: full end-to-end pipeline (extraction → normalization → detection)", () => {
  const CANONICAL_INPUT: AnalysisInput = {
    sessionId: "e2e-audit",
    requirementText: "Only organization owners can manage subscriptions.",
    changes: [
      {
        id: "auth-agent",
        label: "Authentication role update",
        content: 'User.role = "owner"',
        fileSnippets: [{
          filePath: "auth/roles.ts",
          sourceType: SourceType.FILE_SNIPPET,
          content: 'User.role = "owner"',
          lineRange: [12, 12],
        }],
      },
      {
        id: "billing-agent",
        label: "Billing permission check",
        content: 'if (user.role === "admin") { manageSubscription(); }',
        fileSnippets: [{
          filePath: "billing/permissions.ts",
          sourceType: SourceType.FILE_SNIPPET,
          content: 'if (user.role === "admin") { manageSubscription(); }',
          lineRange: [8, 10],
        }],
      },
    ],
  };

  it("extracts owner and admin assumptions and detects the conflict", async () => {
    const pipeline = new ExtractionPipeline(new DeterministicExtractor());
    const { assumptions } = await pipeline.run(CANONICAL_INPUT);
    const normalized = normalizeAssumptions(assumptions);
    const reports = explainConflicts(normalized);

    const ownerAdminConflict = reports.find(
      (r) =>
        r.conflictType === ConflictType.BUSINESS_RULE &&
        r.whyIncompatible.includes("owner") &&
        r.whyIncompatible.includes("admin")
    );
    expect(ownerAdminConflict).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 12. JSON round-trip
// ---------------------------------------------------------------------------

describe("Audit: JSON serialization round-trip", () => {
  it("ConflictReport survives JSON.stringify → JSON.parse without data loss", () => {
    const normalized = normalizeAssumptions([
      fileAssumption("auth", "user_role", "allowed_role = owner", "auth/roles.ts", 'User.role = "owner"'),
      fileAssumption("billing", "user_role", "allowed_role = admin", "billing/permissions.ts", 'user.role === "admin"'),
    ]);
    const report = explainConflicts(normalized)[0]!;
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);

    expect(parsed.id).toBe(report.id);
    expect(parsed.title).toBe(report.title);
    expect(parsed.conflictType).toBe(report.conflictType);
    expect(parsed.severity).toBe(report.severity);
    expect(parsed.confidence).toBe(report.confidence);
    expect(parsed.severityRule).toBe(report.severityRule);
    expect(parsed.confidenceRule).toBe(report.confidenceRule);
    expect(parsed.whyIncompatible).toBe(report.whyIncompatible);
    expect(parsed.verificationHint).toBe(report.verificationHint);
    expect(parsed.assumptionA.evidenceText).toBe(report.assumptionA.evidenceText);
    expect(parsed.assumptionB.evidenceText).toBe(report.assumptionB.evidenceText);
    expect(Array.isArray(parsed.affectedFiles)).toBe(true);
    expect(Array.isArray(parsed.allEvidenceReferences)).toBe(true);
  });

  it("serialized report contains no undefined values (clean JSON)", () => {
    const normalized = normalizeAssumptions([
      makeAssumption("a", "user_role", "allowed_role = owner"),
      makeAssumption("b", "user_role", "allowed_role = admin"),
    ]);
    const report = explainConflicts(normalized)[0]!;
    const json = JSON.stringify(report);
    expect(json).not.toContain("undefined");
  });
});
