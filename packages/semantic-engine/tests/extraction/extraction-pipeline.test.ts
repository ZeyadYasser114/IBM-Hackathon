import { ExtractionPipeline } from "../../src/extraction/extraction-pipeline";
import { DeterministicExtractor } from "../../src/extraction/deterministic-extractor";
import { AssumptionExtractorProvider, ExtractionUnit, ExtractionResult } from "../../src/extraction/extractor-provider";
import { AnalysisInput } from "../../src/types/input";
import { SemanticAssumption } from "../../src/types/assumption";
import { SourceType } from "../../src/types/enums";

const OWNER_ADMIN_INPUT: AnalysisInput = {
  sessionId: "session-test-001",
  requirementText: "Add organization billing. Only organization owners can manage subscriptions.",
  changes: [
    { id: "auth-agent", label: "Authentication role update", content: 'User.role = "owner"',
      fileSnippets: [{ filePath: "auth/roles.ts", sourceType: SourceType.FILE_SNIPPET, content: 'User.role = "owner"', lineRange: [12, 12] }] },
    { id: "billing-agent", label: "Billing permission check", content: 'if (user.role === "admin") { manageSubscription(); }',
      fileSnippets: [{ filePath: "billing/permissions.ts", sourceType: SourceType.FILE_SNIPPET, content: 'if (user.role === "admin") { manageSubscription(); }', lineRange: [8, 10] }] },
  ],
};

describe("ExtractionPipeline — with DeterministicExtractor", () => {
  const pipeline = new ExtractionPipeline(new DeterministicExtractor());

  it("returns a PipelineExtractionResult", async () => {
    const result = await pipeline.run(OWNER_ADMIN_INPUT);
    expect(Array.isArray(result.assumptions)).toBe(true); expect(Array.isArray(result.diagnostics)).toBe(true);
  });
  it("extracts both owner and admin role assumptions", async () => {
    const result = await pipeline.run(OWNER_ADMIN_INPUT);
    const predicates = result.assumptions.map((a) => a.predicate);
    expect(predicates.some((p) => p.includes("owner"))).toBe(true);
    expect(predicates.some((p) => p.includes("admin"))).toBe(true);
  });
  it("attaches correct sourceFile from file snippets", async () => {
    const result = await pipeline.run(OWNER_ADMIN_INPUT);
    expect(result.assumptions.some((a) => a.sourceFile === "auth/roles.ts")).toBe(true);
    expect(result.assumptions.some((a) => a.sourceFile === "billing/permissions.ts")).toBe(true);
  });
  it("all extracted assumptions have required fields", async () => {
    const result = await pipeline.run(OWNER_ADMIN_INPUT);
    result.assumptions.forEach((a: SemanticAssumption) => {
      expect(a.id).toBeTruthy(); expect(a.statement).toBeTruthy(); expect(a.subject).toBeTruthy();
      expect(a.predicate).toBeTruthy(); expect(a.evidenceText).toBeTruthy();
    });
  });
});

describe("ExtractionPipeline — provider abstraction", () => {
  class StubProvider implements AssumptionExtractorProvider {
    readonly providerName = "StubProvider";
    readonly callLog: string[] = [];
    async extract(unit: ExtractionUnit): Promise<ExtractionResult> {
      this.callLog.push(unit.unitId);
      const stubAssumption: SemanticAssumption = {
        id: `stub_${unit.unitId}`, statement: `Stub assumption for ${unit.unitId}`,
        subject: "stub_subject", predicate: "stub_predicate",
        sourceType: SourceType.CODE_DIFF, evidenceText: unit.text.slice(0, 50), confidence: "HIGH" as const,
      };
      return { unitId: unit.unitId, assumptions: [stubAssumption] };
    }
  }

  it("calls the provider once per unit (1 requirement + 2 changes + 2 snippets = 5)", async () => {
    const stub = new StubProvider();
    await new ExtractionPipeline(stub).run(OWNER_ADMIN_INPUT);
    expect(stub.callLog).toHaveLength(5);
  });
  it("collects one assumption per unit from stub", async () => {
    const stub = new StubProvider();
    const result = await new ExtractionPipeline(stub).run(OWNER_ADMIN_INPUT);
    expect(result.assumptions).toHaveLength(5);
  });
  it("works when a provider returns zero assumptions", async () => {
    const empty: AssumptionExtractorProvider = {
      providerName: "EmptyProvider",
      async extract(unit: ExtractionUnit): Promise<ExtractionResult> { return { unitId: unit.unitId, assumptions: [] }; },
    };
    const result = await new ExtractionPipeline(empty).run(OWNER_ADMIN_INPUT);
    expect(result.assumptions).toHaveLength(0);
  });
  it("collects diagnostics from provider", async () => {
    const diag: AssumptionExtractorProvider = {
      providerName: "DiagnosticProvider",
      async extract(unit: ExtractionUnit): Promise<ExtractionResult> {
        return { unitId: unit.unitId, assumptions: [], diagnostics: [`diagnostic from ${unit.unitId}`] };
      },
    };
    const result = await new ExtractionPipeline(diag).run(OWNER_ADMIN_INPUT);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
