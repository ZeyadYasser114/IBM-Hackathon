/**
 * normalization-pipeline.test.ts
 *
 * Tests for the full normalization pipeline (prompt 3).
 * Covers: entity normalization, predicate normalization, value normalization,
 * evidence anchoring, normalization trace, and the public normalizeAssumptions function.
 */

import { normalizeAssumptions } from "../../src/normalization/normalization-pipeline";
import { normalizeEntity } from "../../src/normalization/entity-normalizer";
import { normalizePredicate } from "../../src/normalization/predicate-normalizer";
import { normalizeValue, normalizeValueString } from "../../src/normalization/value-normalizer";
import { buildEvidenceAnchor } from "../../src/normalization/evidence-anchor";
import { SemanticAssumption } from "../../src/types/assumption";
import { Confidence, SourceType } from "../../src/types/enums";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssumption(overrides: Partial<SemanticAssumption> = {}): SemanticAssumption {
  return {
    id: "a-001",
    statement: "The privileged role is 'owner'.",
    subject: "user_role",
    predicate: "allowed_role = owner",
    sourceType: SourceType.CODE_DIFF,
    evidenceText: 'user.role === "owner"',
    confidence: Confidence.HIGH,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Entity normalizer
// ---------------------------------------------------------------------------

describe("normalizeEntity — equivalent wording normalizes together", () => {
  it("'user role' → 'user_role'", () => {
    expect(normalizeEntity("user role").canonical).toBe("user_role");
  });
  it("'User.role' → 'user_role' (camelCase dot notation)", () => {
    expect(normalizeEntity("User.role").canonical).toBe("user_role");
  });
  it("'owner role' → 'user_role' (synonym cluster)", () => {
    expect(normalizeEntity("owner role").canonical).toBe("user_role");
  });
  it("'admin role' → 'user_role' (synonym cluster)", () => {
    expect(normalizeEntity("admin role").canonical).toBe("user_role");
  });
  it("'role' → 'user_role' (synonym cluster)", () => {
    expect(normalizeEntity("role").canonical).toBe("user_role");
  });
  it("'email address' → 'email'", () => {
    expect(normalizeEntity("email address").canonical).toBe("email");
  });
  it("'userId' (camelCase) → 'user_id'", () => {
    expect(normalizeEntity("userId").canonical).toBe("user_id");
  });
  it("'organization subscription management' → 'subscription_management'", () => {
    expect(normalizeEntity("organization subscription management").canonical).toBe("subscription_management");
  });
});

describe("normalizeEntity — similar wording stays separate (conservative)", () => {
  it("'billing service' does not collapse to 'subscription_management'", () => {
    expect(normalizeEntity("billing service").canonical).not.toBe("subscription_management");
  });
  it("'payment method' stays distinct from 'email'", () => {
    expect(normalizeEntity("payment method").canonical).not.toBe("email");
  });
  it("'admin' alone does not collapse to 'user_role'", () => {
    // "admin" alone is NOT in the synonym list — it is a value, not an entity
    expect(normalizeEntity("admin").canonical).not.toBe("user_role");
  });
  it("'organization' alone is preserved", () => {
    const result = normalizeEntity("organization");
    expect(result.canonical).toBe("organization");
  });
});

describe("normalizeEntity — explanation", () => {
  it("provides explanation when synonym cluster fires", () => {
    const result = normalizeEntity("owner role");
    expect(result.explanation).toBeDefined();
    expect(result.explanation).toContain("user_role");
  });
  it("preserves raw value unchanged", () => {
    const result = normalizeEntity("owner role");
    expect(result.raw).toBe("owner role");
  });
  it("no explanation when nothing changed", () => {
    const result = normalizeEntity("user_role");
    expect(result.explanation).toBeUndefined();
  });
});

describe("normalizeEntity — edge cases", () => {
  it("handles empty string", () => {
    expect(normalizeEntity("").canonical).toBe("");
  });
  it("handles whitespace-only", () => {
    expect(normalizeEntity("   ").canonical).toBe("");
  });
  it("strips filler word 'field'", () => {
    const result = normalizeEntity("email field");
    expect(result.canonical).toBe("email");
  });
});

// ---------------------------------------------------------------------------
// Value normalizer
// ---------------------------------------------------------------------------

describe("normalizeValue — role values", () => {
  it("'OWNER' → 'owner'", () => { expect(normalizeValue("OWNER").canonical).toBe("owner"); });
  it("'Owner' → 'owner'", () => { expect(normalizeValue("Owner").canonical).toBe("owner"); });
  it("'owner' stays 'owner'", () => { expect(normalizeValue("owner").canonical).toBe("owner"); });
  it("'ADMIN' → 'admin'", () => { expect(normalizeValue("ADMIN").canonical).toBe("admin"); });
  it("owner and admin remain SEPARATE after normalization", () => {
    expect(normalizeValue("owner").canonical).not.toBe(normalizeValue("admin").canonical);
  });
});

describe("normalizeValue — booleans", () => {
  it("'TRUE' → 'true'", () => { expect(normalizeValue("TRUE").canonical).toBe("true"); });
  it("'yes' → 'true'", () => { expect(normalizeValue("yes").canonical).toBe("true"); });
  it("'1' → 'true'", () => { expect(normalizeValue("1").canonical).toBe("true"); });
  it("'false' stays 'false'", () => { expect(normalizeValue("false").canonical).toBe("false"); });
  it("'no' → 'false'", () => { expect(normalizeValue("no").canonical).toBe("false"); });
  it("'optional' → 'false'", () => { expect(normalizeValue("optional").canonical).toBe("false"); });
  it("'required' → 'true'", () => { expect(normalizeValue("required").canonical).toBe("true"); });
});

describe("normalizeValue — snake_case vs camelCase contract names", () => {
  it("'userId' → 'user_id'", () => { expect(normalizeValue("userId").canonical).toBe("user_id"); });
  it("'user_id' stays 'user_id'", () => { expect(normalizeValue("user_id").canonical).toBe("user_id"); });
  it("'organizationId' → 'organization_id'", () => { expect(normalizeValue("organizationId").canonical).toBe("organization_id"); });
  it("'createdAt' → 'created_at'", () => { expect(normalizeValue("createdAt").canonical).toBe("created_at"); });
  it("provides explanation for camelCase conversion", () => {
    expect(normalizeValue("userId").explanation).toContain("snake_case");
  });
});

describe("normalizeValue — enum-like values", () => {
  it("'ACTIVE' → 'active'", () => { expect(normalizeValue("ACTIVE").canonical).toBe("active"); });
  it("'PENDING' → 'pending'", () => { expect(normalizeValue("PENDING").canonical).toBe("pending"); });
  it("'active' and 'inactive' remain separate", () => {
    expect(normalizeValue("active").canonical).not.toBe(normalizeValue("inactive").canonical);
  });
});

// ---------------------------------------------------------------------------
// Predicate normalizer
// ---------------------------------------------------------------------------

describe("normalizePredicate — key normalization", () => {
  it("'allowed_role = owner' key → 'required_role'", () => {
    const r = normalizePredicate("allowed_role = owner", normalizeValueString);
    expect(r.canonicalKey).toBe("required_role");
  });
  it("'assigned_role = owner' key → 'required_role'", () => {
    const r = normalizePredicate("assigned_role = owner", normalizeValueString);
    expect(r.canonicalKey).toBe("required_role");
  });
  it("'allowed_role = owner' and 'assigned_role = owner' produce same canonical", () => {
    const a = normalizePredicate("allowed_role = owner", normalizeValueString);
    const b = normalizePredicate("assigned_role = owner", normalizeValueString);
    expect(a.canonical).toBe(b.canonical);
  });
  it("preserves the raw string unchanged", () => {
    const r = normalizePredicate("allowed_role = OWNER", normalizeValueString);
    expect(r.raw).toBe("allowed_role = OWNER");
  });
  it("value 'OWNER' is normalized to 'owner' in the canonical", () => {
    const r = normalizePredicate("allowed_role = OWNER", normalizeValueString);
    expect(r.canonicalValue).toBe("owner");
    expect(r.canonical).toBe("required_role = owner");
  });
  it("'is_required = true' key stays 'is_required'", () => {
    const r = normalizePredicate("is_required = true", normalizeValueString);
    expect(r.canonicalKey).toBe("is_required");
  });
  it("'is_required = true' and 'is_required = false' remain separate", () => {
    const a = normalizePredicate("is_required = true", normalizeValueString);
    const b = normalizePredicate("is_required = false", normalizeValueString);
    expect(a.canonical).not.toBe(b.canonical);
  });
});

// ---------------------------------------------------------------------------
// Evidence anchor
// ---------------------------------------------------------------------------

describe("buildEvidenceAnchor", () => {
  it("preserves original text exactly", () => {
    const a = makeAssumption({ evidenceText: 'user.role === "owner"' });
    expect(buildEvidenceAnchor(a).originalText).toBe('user.role === "owner"');
  });
  it("includes filePath when sourceFile is set", () => {
    const a = makeAssumption({ sourceFile: "auth/roles.ts" });
    const anchor = buildEvidenceAnchor(a);
    expect(anchor.filePath).toBe("auth/roles.ts");
    expect(anchor.references[0]!.filePath).toBe("auth/roles.ts");
  });
  it("filePath is absent when no sourceFile (missing file path case)", () => {
    const { sourceFile, ...rest } = { ...makeAssumption(), sourceFile: undefined as unknown as string };
    const a = rest as SemanticAssumption;
    const anchor = buildEvidenceAnchor(a);
    expect(anchor.filePath).toBeUndefined();
  });
  it("includes both primary and supporting evidence references", () => {
    const a = makeAssumption({
      supportingEvidence: [
        { id: "ev-sup-1", sourceType: SourceType.FILE_SNIPPET, text: "additional evidence", filePath: "billing/permissions.ts" },
      ],
    });
    const anchor = buildEvidenceAnchor(a);
    expect(anchor.references).toHaveLength(2);
    expect(anchor.references[1]!.filePath).toBe("billing/permissions.ts");
  });
  it("has only primary reference when no supportingEvidence", () => {
    const a = makeAssumption();
    expect(buildEvidenceAnchor(a).references).toHaveLength(1);
  });
  it("primary reference id is based on assumption id", () => {
    const a = makeAssumption({ id: "my-assm" });
    expect(buildEvidenceAnchor(a).references[0]!.id).toContain("my-assm");
  });
});

// ---------------------------------------------------------------------------
// normalizeAssumptions (public entry point)
// ---------------------------------------------------------------------------

describe("normalizeAssumptions — public entry point", () => {
  it("returns empty array for empty input", () => {
    expect(normalizeAssumptions([])).toHaveLength(0);
  });

  it("preserves the raw assumption unchanged", () => {
    const a = makeAssumption();
    const result = normalizeAssumptions([a]);
    expect(result[0]!.raw).toBe(a);
  });

  it("canonicalSubject is normalized", () => {
    const a = makeAssumption({ subject: "owner role" });
    const result = normalizeAssumptions([a]);
    expect(result[0]!.canonicalSubject).toBe("user_role");
  });

  it("canonicalPredicate normalizes key", () => {
    const a = makeAssumption({ predicate: "allowed_role = owner" });
    const result = normalizeAssumptions([a]);
    expect(result[0]!.canonicalPredicate).toBe("required_role = owner");
  });

  it("two differently-worded assumptions about the same concept get the same canonical keys", () => {
    const authAssumption = makeAssumption({ id: "a-1", subject: "User.role", predicate: "allowed_role = owner" });
    const billingAssumption = makeAssumption({ id: "a-2", subject: "user role", predicate: "assigned_role = owner" });
    const [normAuth, normBilling] = normalizeAssumptions([authAssumption, billingAssumption]);
    expect(normAuth!.canonicalSubject).toBe(normBilling!.canonicalSubject);
    expect(normAuth!.canonicalPredicate).toBe(normBilling!.canonicalPredicate);
  });

  it("two assumptions with different values keep different canonical predicates", () => {
    const ownerAssumption = makeAssumption({ id: "a-1", predicate: "allowed_role = owner" });
    const adminAssumption = makeAssumption({ id: "a-2", predicate: "allowed_role = admin" });
    const [normOwner, normAdmin] = normalizeAssumptions([ownerAssumption, adminAssumption]);
    expect(normOwner!.canonicalPredicate).not.toBe(normAdmin!.canonicalPredicate);
  });

  it("records a normalization trace when something changed", () => {
    const a = makeAssumption({ subject: "owner role", predicate: "allowed_role = OWNER" });
    const result = normalizeAssumptions([a]);
    expect(result[0]!.normalizationTrace.length).toBeGreaterThan(0);
  });

  it("trace is empty when assumption is already canonical", () => {
    const a = makeAssumption({ subject: "user_role", predicate: "required_role = owner" });
    const result = normalizeAssumptions([a]);
    expect(result[0]!.normalizationTrace).toHaveLength(0);
  });

  it("trace explains what changed", () => {
    const a = makeAssumption({ subject: "owner role" });
    const result = normalizeAssumptions([a]);
    const trace = result[0]!.normalizationTrace;
    expect(trace[0]!.rawValue).toBe("owner role");
    expect(trace[0]!.canonicalValue).toBe("user_role");
    expect(trace[0]!.explanation).toBeTruthy();
  });

  it("anchor originalText is preserved verbatim", () => {
    const evidenceText = 'if (user.role === "admin") { manageSubscription(); }';
    const a = makeAssumption({ evidenceText });
    const result = normalizeAssumptions([a]);
    expect(result[0]!.anchor.originalText).toBe(evidenceText);
  });

  it("processes multiple assumptions independently", () => {
    const assumptions = [
      makeAssumption({ id: "a-1", subject: "user role" }),
      makeAssumption({ id: "a-2", subject: "email address" }),
      makeAssumption({ id: "a-3", subject: "userId" }),
    ];
    const results = normalizeAssumptions(assumptions);
    expect(results).toHaveLength(3);
    expect(results[0]!.canonicalSubject).toBe("user_role");
    expect(results[1]!.canonicalSubject).toBe("email");
    expect(results[2]!.canonicalSubject).toBe("user_id");
  });
});
