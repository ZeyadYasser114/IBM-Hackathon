import { DeterministicExtractor } from "../../src/extraction/deterministic-extractor";
import { AssumptionCategory } from "../../src/extraction/assumption-category";
import { ExtractionUnit } from "../../src/extraction/extractor-provider";
import { Confidence, SourceType } from "../../src/types/enums";

const extractor = new DeterministicExtractor();

function unit(text: string, options: Partial<Omit<ExtractionUnit, "text">> = {}): ExtractionUnit {
  return { unitId: "test", text, ...options };
}

describe("DeterministicExtractor — Authorization", () => {
  it("extracts role check from === expression", async () => {
    const result = await extractor.extract(unit('if (user.role === "admin") { manageSubscription(); }'));
    const a = result.assumptions.find((x) => x.subject === "user_role");
    expect(a).toBeDefined(); expect(a!.predicate).toContain("admin"); expect(a!.confidence).toBe(Confidence.HIGH);
  });
  it("extracts role from 'Only X can Y' requirement text", async () => {
    const result = await extractor.extract(unit("Only organization owners can manage subscriptions.", { categoryHint: AssumptionCategory.AUTHORIZATION }));
    expect(result.assumptions.length).toBeGreaterThanOrEqual(1);
    expect(result.assumptions[0]!.predicate).toContain("owner");
  });
  it("extracts role from assignment expression", async () => {
    const result = await extractor.extract(unit('User.role = "owner"'));
    expect(result.assumptions.find((x) => x.subject === "user_role")?.predicate).toContain("owner");
  });
  it("attaches sourceFile when provided", async () => {
    const result = await extractor.extract(unit('user.role === "owner"', { sourceFile: "auth/roles.ts", unitId: "auth" }));
    expect(result.assumptions[0]?.sourceFile).toBe("auth/roles.ts");
  });
});

describe("DeterministicExtractor — Business rules", () => {
  it("extracts 'X must be Y' rule", async () => {
    const result = await extractor.extract(unit("Subscription status must be active before billing."));
    expect(result.assumptions.some((a) => a.predicate.startsWith("must_be"))).toBe(true);
  });
  it("extracts 'X cannot Y' rule", async () => {
    const result = await extractor.extract(unit("An admin cannot manage organization subscriptions."));
    expect(result.assumptions.some((a) => a.predicate.startsWith("prohibited"))).toBe(true);
  });
});

describe("DeterministicExtractor — Contract", () => {
  it("extracts field name from 'returns userId'", async () => {
    const result = await extractor.extract(unit("The API returns userId."));
    expect(result.assumptions.find((a) => a.subject === "api_response_field")?.predicate).toContain("userId");
  });
  it("extracts 'expects user_id'", async () => {
    const result = await extractor.extract(unit("The frontend expects user_id."));
    expect(result.assumptions.some((a) => a.predicate.includes("user_id"))).toBe(true);
  });
});

describe("DeterministicExtractor — Schema", () => {
  it("extracts 'email is required'", async () => {
    const result = await extractor.extract(unit("The email field is required."));
    const a = result.assumptions.find((x) => x.subject === "email");
    expect(a?.predicate).toBe("is_required = true"); expect(a?.confidence).toBe(Confidence.HIGH);
  });
  it("extracts 'email is optional'", async () => {
    const result = await extractor.extract(unit("The email field is optional."));
    expect(result.assumptions.find((x) => x.subject === "email")?.predicate).toBe("is_required = false");
  });
});

describe("DeterministicExtractor — Dependency", () => {
  it("extracts 'assumes every user has email'", async () => {
    const result = await extractor.extract(unit("The notification service assumes every user has email."));
    expect(result.assumptions.find((a) => a.predicate.includes("always_present"))?.subject).toBe("email");
  });
  it("extracts 'depends on NotificationService'", async () => {
    const result = await extractor.extract(unit("The billing module depends on NotificationService."));
    expect(result.assumptions.some((a) => a.predicate.includes("dependency_required"))).toBe(true);
  });
});

describe("DeterministicExtractor — Multi-assumption & deduplication", () => {
  it("deduplicates identical subject+predicate pairs", async () => {
    const result = await extractor.extract(unit('user.role === "admin"\nuser.role === "admin"'));
    expect(result.assumptions.filter((a) => a.predicate.includes("admin"))).toHaveLength(1);
  });
  it("produces stable unique ids", async () => {
    const result = await extractor.extract(unit('user.role === "admin". The email field is required.'));
    const ids = result.assumptions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("DeterministicExtractor — Negative cases", () => {
  it("returns empty for empty string", async () => {
    const result = await extractor.extract(unit(""));
    expect(result.assumptions).toHaveLength(0); expect(result.diagnostics!.length).toBeGreaterThan(0);
  });
  it("returns empty for generic prose", async () => {
    const result = await extractor.extract(unit("This PR improves code readability and adds some comments."));
    expect(result.assumptions).toHaveLength(0);
  });
  it("returns diagnostic when nothing extracted", async () => {
    const result = await extractor.extract(unit("no patterns here"));
    expect(result.diagnostics!.some((d) => d.includes("no pattern matched"))).toBe(true);
  });
});

describe("DeterministicExtractor — provider contract", () => {
  it("exposes providerName", () => { expect(extractor.providerName).toBe("DeterministicExtractor"); });
  it("ids are prefixed with assm_", async () => {
    const result = await extractor.extract(unit('user.role === "admin"'));
    result.assumptions.forEach((a) => expect(a.id).toMatch(/^assm_/));
  });
  it("all returned assumptions have required fields", async () => {
    const result = await extractor.extract(unit('Only organization owners can manage subscriptions. User.role = "owner". The email field is required.'));
    result.assumptions.forEach((a) => {
      expect(a.id).toBeTruthy(); expect(a.statement).toBeTruthy(); expect(a.subject).toBeTruthy();
      expect(a.predicate).toBeTruthy(); expect(a.evidenceText).toBeTruthy();
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(a.confidence);
    });
  });
});
