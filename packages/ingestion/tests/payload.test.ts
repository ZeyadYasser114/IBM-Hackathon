/**
 * payload.test.ts
 *
 * Tests for buildSemanticAnalysisInput (payload/builder.ts).
 *
 * Scenarios:
 *   - normal small change (single ChangeSet, full evidence)
 *   - large diff with snippet truncation
 *   - file-summary truncation
 *   - requirement truncation
 *   - strip diff bodies option
 *   - binary files
 *   - empty requirement
 *   - empty diff (no changed files)
 *   - renamed file
 *   - multiple ChangeSets (multi-branch)
 *   - sourceLabels assignment and sorting
 *   - ingestion-warning deduplication
 *   - determinism (same input → same output structure)
 *   - JSON round-trip (full serialization)
 *   - schema version field
 *   - payloadId + assembledAt are present and well-formed
 */

import { describe, it, expect } from "vitest";
import { buildSemanticAnalysisInput } from "../src/payload/builder.js";
import type {
  ChangeSet,
  ChangedFile,
  DiffHunk,
  DiffLine,
  EvidenceSnippet,
  SemanticAnalysisInput,
} from "../src/models/index.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function dl(kind: DiffLine["kind"], content: string, newLine?: number, oldLine?: number): DiffLine {
  return { kind, content, newLine, oldLine };
}

function hunk(lines: DiffLine[], overrides: Partial<DiffHunk> = {}): DiffHunk {
  return {
    header: "@@ -1,3 +1,4 @@",
    oldStart: 1, oldLines: 3,
    newStart: 1, newLines: 4,
    body: "full hunk body text",
    lines,
    ...overrides,
  };
}

function changedFile(
  path: string,
  hunks: DiffHunk[],
  overrides: Partial<ChangedFile> = {},
): ChangedFile {
  return {
    path,
    status: "modified",
    isBinary: false,
    additions: hunks.flatMap((h) => h.lines).filter((l) => l.kind === "added").length,
    deletions: hunks.flatMap((h) => h.lines).filter((l) => l.kind === "removed").length,
    hunks,
    ...overrides,
  };
}

function makeChangeSet(
  id: string,
  files: ChangedFile[],
  warnings: ChangeSet["warnings"] = [],
): ChangeSet {
  return {
    id,
    source: { kind: "local-git", repositoryPath: "/repo", baseRef: "main", headRef: `feature/${id}` },
    repository: { name: "test-repo" },
    changedFiles: files,
    totalAdditions: files.reduce((s, f) => s + (f.additions ?? 0), 0),
    totalDeletions: files.reduce((s, f) => s + (f.deletions ?? 0), 0),
    evidenceSnippets: [],
    warnings,
    capturedAt: "2024-01-15T10:00:00.000Z",
  };
}

function makeSnippet(
  id: string,
  changeSetId: string,
  filePath: string,
  sourceType: EvidenceSnippet["sourceType"] = "function",
  startLine = 1,
): EvidenceSnippet {
  return {
    id,
    changeSetId,
    filePath,
    sourceType,
    diffRelation: "added",
    startLine,
    endLine: startLine + 4,
    content: `// ${id} content`,
    label: `function ${id}`,
  };
}

// ---------------------------------------------------------------------------
// Helpers for assertions
// ---------------------------------------------------------------------------

function uuidPattern(): RegExp {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
}

// ---------------------------------------------------------------------------
// Normal small change
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — normal small change", () => {
  const h = hunk([
    dl("removed", 'const ROLE = "admin";', undefined, 1),
    dl("added",   'const ROLE = "owner";', 1),
  ]);
  const cs = makeChangeSet("auth-001", [changedFile("src/auth/roles.ts", [h])]);
  const snips = [makeSnippet("snip-1", "auth-001", "src/auth/roles.ts", "constant", 1)];

  const payload = buildSemanticAnalysisInput(
    "Only organization owners may manage subscriptions.",
    [cs],
    snips,
    {
      requirementTitle: "Organization Billing",
      sourceLabels: [{ id: "auth-agent", description: "Auth task", ref: "feature/auth-001" }],
    },
  );

  it("sets schemaVersion to 1.0", () => {
    expect(payload.schemaVersion).toBe("1.0");
  });

  it("payloadId is a valid UUID v4", () => {
    expect(payload.payloadId).toMatch(uuidPattern());
  });

  it("assembledAt is an ISO timestamp", () => {
    expect(payload.assembledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("requirement is preserved verbatim", () => {
    expect(payload.requirement).toBe("Only organization owners may manage subscriptions.");
  });

  it("requirementTitle is preserved", () => {
    expect(payload.requirementTitle).toBe("Organization Billing");
  });

  it("includes the ChangeSet", () => {
    expect(payload.changeSets).toHaveLength(1);
    expect(payload.changeSets[0].id).toBe("auth-001");
  });

  it("includes the evidence snippet", () => {
    expect(payload.evidenceSnippets).toHaveLength(1);
    expect(payload.evidenceSnippets[0].id).toBe("snip-1");
  });

  it("includes a repositorySummary with correct changeSetId", () => {
    expect(payload.repositorySummary.changeSetId).toBeDefined();
    expect(payload.repositorySummary.totalFiles).toBe(1);
  });

  it("includes sourceLabels sorted by id", () => {
    expect(payload.sourceLabels).toHaveLength(1);
    expect(payload.sourceLabels[0].id).toBe("auth-agent");
  });

  it("has no truncation warnings for a small payload", () => {
    expect(payload.truncationWarnings).toHaveLength(0);
  });

  it("has no ingestion warnings when ChangeSet is clean", () => {
    expect(payload.ingestionWarnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Snippet budget truncation
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — snippet budget exceeded", () => {
  it("drops lowest-priority snippets first and emits SNIPPET_BUDGET_EXCEEDED warning", () => {
    const cs = makeChangeSet("cs-1", [changedFile("src/x.ts", [])]);
    // Create 10 snippets: 3 type-decl (high priority), 7 diff-context (low priority)
    const typeSnippets = [1, 2, 3].map((i) =>
      makeSnippet(`snip-type-${i}`, "cs-1", "src/x.ts", "type-decl", i),
    );
    const contextSnippets = [4, 5, 6, 7, 8, 9, 10].map((i) =>
      makeSnippet(`snip-ctx-${i}`, "cs-1", "src/x.ts", "diff-context", i),
    );
    const allSnips = [...typeSnippets, ...contextSnippets];

    const payload = buildSemanticAnalysisInput("req", [cs], allSnips, { maxSnippets: 5 });

    // All 3 type-decl snippets should be kept
    const keptIds = payload.evidenceSnippets.map((s) => s.id);
    expect(keptIds.filter((id) => id.startsWith("snip-type-"))).toHaveLength(3);

    // Should have kept exactly 5 total
    expect(payload.evidenceSnippets).toHaveLength(5);

    // Should have a truncation warning
    const warn = payload.truncationWarnings.find((w) => w.code === "SNIPPET_BUDGET_EXCEEDED");
    expect(warn).toBeDefined();
    expect(warn!.droppedCount).toBe(5);
  });

  it("does not emit warning when snippets are within budget", () => {
    const cs = makeChangeSet("cs-1", []);
    const snips = [makeSnippet("s1", "cs-1", "src/x.ts")];
    const payload = buildSemanticAnalysisInput("req", [cs], snips, { maxSnippets: 10 });
    expect(payload.truncationWarnings.filter((w) => w.code === "SNIPPET_BUDGET_EXCEEDED")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// File summary truncation
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — file summary truncation", () => {
  it("omits lowest-priority file summaries and emits FILE_SUMMARY_OMITTED warning", () => {
    // Create 5 files: 2 with type declarations (high priority), 3 test-only (low priority)
    const typeDeclHunk = hunk([dl("added", "export interface UserRole {", 1)]);
    const testHunk = hunk([dl("added", "expect(true).toBe(true);", 1)]);
    const files = [
      changedFile("src/auth/types.ts",     [typeDeclHunk]),
      changedFile("src/billing/types.ts",  [typeDeclHunk]),
      changedFile("tests/a.test.ts",       [testHunk]),
      changedFile("tests/b.test.ts",       [testHunk]),
      changedFile("tests/c.test.ts",       [testHunk]),
    ];
    const cs = makeChangeSet("cs-1", files);
    const payload = buildSemanticAnalysisInput("req", [cs], [], { maxFileSummaries: 3 });

    expect(payload.repositorySummary.files).toHaveLength(3);
    const warn = payload.truncationWarnings.find((w) => w.code === "FILE_SUMMARY_OMITTED");
    expect(warn).toBeDefined();
    expect(warn!.droppedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Requirement truncation
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — requirement truncation", () => {
  it("truncates requirement and emits REQUIREMENT_TRUNCATED warning", () => {
    const longReq = "x".repeat(200);
    const cs = makeChangeSet("cs-1", []);
    const payload = buildSemanticAnalysisInput(longReq, [cs], [], { maxRequirementChars: 100 });

    expect(payload.requirement).toHaveLength(100);
    const warn = payload.truncationWarnings.find((w) => w.code === "REQUIREMENT_TRUNCATED");
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("200");
  });

  it("preserves requirement when it is within limit", () => {
    const req = "Short requirement.";
    const cs = makeChangeSet("cs-1", []);
    const payload = buildSemanticAnalysisInput(req, [cs], [], { maxRequirementChars: 100 });
    expect(payload.requirement).toBe(req);
    expect(payload.truncationWarnings.filter((w) => w.code === "REQUIREMENT_TRUNCATED")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// stripDiffBodies option
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — stripDiffBodies", () => {
  it("removes hunk body and lines when stripDiffBodies is true", () => {
    const h = hunk([dl("added", 'const x = "owner";', 1)]);
    const cs = makeChangeSet("cs-1", [changedFile("src/x.ts", [h])]);
    const payload = buildSemanticAnalysisInput("req", [cs], [], { stripDiffBodies: true });

    const file = payload.changeSets[0].changedFiles[0];
    expect(file.hunks[0].body).toBe("");
    expect(file.hunks[0].lines).toHaveLength(0);
    // Header is always preserved
    expect(file.hunks[0].header).toBe("@@ -1,3 +1,4 @@");
  });

  it("emits DIFF_BODY_STRIPPED warning when bodies are removed", () => {
    const h = hunk([dl("added", "line", 1)]);
    const cs = makeChangeSet("cs-1", [changedFile("src/x.ts", [h])]);
    const payload = buildSemanticAnalysisInput("req", [cs], [], { stripDiffBodies: true });
    expect(payload.truncationWarnings.some((w) => w.code === "DIFF_BODY_STRIPPED")).toBe(true);
  });

  it("does not emit DIFF_BODY_STRIPPED when stripDiffBodies is false (default)", () => {
    const h = hunk([dl("added", "line", 1)]);
    const cs = makeChangeSet("cs-1", [changedFile("src/x.ts", [h])]);
    const payload = buildSemanticAnalysisInput("req", [cs], []);
    expect(payload.truncationWarnings.some((w) => w.code === "DIFF_BODY_STRIPPED")).toBe(false);
    // Body is preserved
    expect(payload.changeSets[0].changedFiles[0].hunks[0].body).toBe("full hunk body text");
  });
});

// ---------------------------------------------------------------------------
// Binary files
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — binary files", () => {
  it("includes binary files in the ChangeSet unchanged", () => {
    const binaryFile = changedFile("assets/logo.png", [], {
      isBinary: true,
      status: "added",
      additions: undefined,
      deletions: undefined,
    });
    const cs = makeChangeSet("cs-1", [binaryFile]);
    const payload = buildSemanticAnalysisInput("req", [cs], []);

    const f = payload.changeSets[0].changedFiles[0];
    expect(f.isBinary).toBe(true);
    expect(f.path).toBe("assets/logo.png");
  });

  it("passes through BINARY_FILE_SKIPPED ingestion warnings", () => {
    const cs = makeChangeSet("cs-1", [], [
      { code: "BINARY_FILE_SKIPPED", message: 'Binary file "assets/logo.png"', filePath: "assets/logo.png" },
    ]);
    const payload = buildSemanticAnalysisInput("req", [cs], []);
    expect(payload.ingestionWarnings).toHaveLength(1);
    expect(payload.ingestionWarnings[0].code).toBe("BINARY_FILE_SKIPPED");
  });
});

// ---------------------------------------------------------------------------
// Empty requirement
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — empty requirement", () => {
  it("accepts empty string without warning", () => {
    const cs = makeChangeSet("cs-1", []);
    const payload = buildSemanticAnalysisInput("", [cs], []);
    expect(payload.requirement).toBe("");
    expect(payload.truncationWarnings.filter((w) => w.code === "REQUIREMENT_TRUNCATED")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Empty diff
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — empty diff", () => {
  it("builds a valid payload when ChangeSet has no changed files", () => {
    const cs = makeChangeSet("cs-1", []);
    const payload = buildSemanticAnalysisInput("Some requirement", [cs], []);
    expect(payload.changeSets[0].changedFiles).toHaveLength(0);
    expect(payload.repositorySummary.totalFiles).toBe(0);
    expect(payload.evidenceSnippets).toHaveLength(0);
    expect(payload.truncationWarnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Renamed file
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — renamed file", () => {
  it("preserves renamed-file metadata (previousPath, status)", () => {
    const rf = changedFile("src/auth/authorize.ts", [], {
      status: "renamed",
      previousPath: "src/auth/roles.ts",
      additions: 0,
      deletions: 0,
    });
    const cs = makeChangeSet("cs-1", [rf]);
    const payload = buildSemanticAnalysisInput("req", [cs], []);

    const f = payload.changeSets[0].changedFiles[0];
    expect(f.status).toBe("renamed");
    expect(f.previousPath).toBe("src/auth/roles.ts");
    expect(f.path).toBe("src/auth/authorize.ts");
  });
});

// ---------------------------------------------------------------------------
// Multiple ChangeSets (multi-branch)
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — multiple ChangeSets", () => {
  const authHunk = hunk([dl("added", 'const ROLE = "owner";', 1)]);
  const billingHunk = hunk([dl("added", 'if (user.role === "admin") {', 1)]);

  const authCs = makeChangeSet("auth-cs", [changedFile("src/auth/roles.ts", [authHunk])]);
  const billingCs = makeChangeSet("billing-cs", [changedFile("src/billing/permissions.ts", [billingHunk])]);

  const authSnips = [makeSnippet("snip-auth",    "auth-cs",    "src/auth/roles.ts",           "constant", 1)];
  const billSnips = [makeSnippet("snip-billing",  "billing-cs", "src/billing/permissions.ts",  "function", 1)];

  const payload = buildSemanticAnalysisInput(
    "Only owners may manage subscriptions.",
    [authCs, billingCs],
    [...authSnips, ...billSnips],
    {
      sourceLabels: [
        { id: "billing-agent", description: "Billing task", ref: "feature/billing-cs" },
        { id: "auth-agent",    description: "Auth task",    ref: "feature/auth-cs" },
      ],
    },
  );

  it("includes both ChangeSets sorted by id", () => {
    expect(payload.changeSets).toHaveLength(2);
    expect(payload.changeSets[0].id).toBe("auth-cs");
    expect(payload.changeSets[1].id).toBe("billing-cs");
  });

  it("includes snippets from both ChangeSets", () => {
    const csIds = new Set(payload.evidenceSnippets.map((s) => s.changeSetId));
    expect(csIds.has("auth-cs")).toBe(true);
    expect(csIds.has("billing-cs")).toBe(true);
  });

  it("sourceLabels are sorted by id", () => {
    const ids = payload.sourceLabels.map((l) => l.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("repositorySummary covers files from both ChangeSets", () => {
    const paths = payload.repositorySummary.files.map((f) => f.filePath);
    expect(paths).toContain("src/auth/roles.ts");
    expect(paths).toContain("src/billing/permissions.ts");
  });

  it("repositorySummary.totalFiles equals 2", () => {
    expect(payload.repositorySummary.totalFiles).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Ingestion warning deduplication
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — ingestion warning deduplication", () => {
  it("deduplicates identical warnings across ChangeSets", () => {
    const warn = { code: "BINARY_FILE_SKIPPED" as const, message: "Binary file skipped." };
    const cs1 = makeChangeSet("cs-1", [], [warn]);
    const cs2 = makeChangeSet("cs-2", [], [warn]); // same warning
    const payload = buildSemanticAnalysisInput("req", [cs1, cs2], []);
    expect(payload.ingestionWarnings).toHaveLength(1);
  });

  it("keeps distinct warnings from different files", () => {
    const cs = makeChangeSet("cs-1", [], [
      { code: "BINARY_FILE_SKIPPED", message: "Binary: a.png", filePath: "a.png" },
      { code: "BINARY_FILE_SKIPPED", message: "Binary: b.png", filePath: "b.png" },
    ]);
    const payload = buildSemanticAnalysisInput("req", [cs], []);
    expect(payload.ingestionWarnings).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — determinism", () => {
  it("produces identical structure (minus payloadId and assembledAt) across two calls", () => {
    const h = hunk([dl("added", 'export const ROLE = "owner";', 1)]);
    const cs = makeChangeSet("cs-det", [changedFile("src/auth/roles.ts", [h])]);
    const snips = [makeSnippet("snip-d", "cs-det", "src/auth/roles.ts", "constant")];

    const p1 = buildSemanticAnalysisInput("req", [cs], snips);
    const p2 = buildSemanticAnalysisInput("req", [cs], snips);

    // Structural fields must be identical
    expect(p1.schemaVersion).toBe(p2.schemaVersion);
    expect(p1.requirement).toBe(p2.requirement);
    expect(JSON.stringify(p1.changeSets)).toBe(JSON.stringify(p2.changeSets));
    expect(JSON.stringify(p1.evidenceSnippets)).toBe(JSON.stringify(p2.evidenceSnippets));
    expect(JSON.stringify(p1.repositorySummary)).toBe(JSON.stringify(p2.repositorySummary));
    expect(JSON.stringify(p1.truncationWarnings)).toBe(JSON.stringify(p2.truncationWarnings));

    // Only payloadId and assembledAt are expected to differ
    expect(p1.payloadId).not.toBe(p2.payloadId);
  });
});

// ---------------------------------------------------------------------------
// JSON round-trip
// ---------------------------------------------------------------------------

describe("buildSemanticAnalysisInput — JSON round-trip", () => {
  it("serializes and deserializes without data loss", () => {
    const authHunk = hunk([
      dl("removed", 'const ROLE = "admin";', undefined, 1),
      dl("added",   'const ROLE = "owner";', 1),
    ]);
    const cs = makeChangeSet("cs-json", [
      changedFile("src/auth/roles.ts",          [authHunk]),
      changedFile("tests/auth.test.ts",          [hunk([dl("added", "it('test', () => {});", 1)])]),
      changedFile("assets/logo.png", [],         { isBinary: true, additions: undefined, deletions: undefined }),
    ]);
    const snips = [
      makeSnippet("s1", "cs-json", "src/auth/roles.ts", "constant", 1),
      makeSnippet("s2", "cs-json", "src/auth/roles.ts", "type-decl", 5),
    ];

    const payload = buildSemanticAnalysisInput(
      "Only owners may manage subscriptions.",
      [cs],
      snips,
      { sourceLabels: [{ id: "auth-agent", description: "Auth" }] },
    );

    const restored: SemanticAnalysisInput = JSON.parse(JSON.stringify(payload));

    expect(restored.payloadId).toBe(payload.payloadId);
    expect(restored.schemaVersion).toBe(payload.schemaVersion);
    expect(restored.requirement).toBe(payload.requirement);
    expect(restored.changeSets).toHaveLength(1);
    expect(restored.evidenceSnippets).toHaveLength(2);
    expect(restored.repositorySummary.totalFiles).toBe(3);
    expect(restored.sourceLabels[0].id).toBe("auth-agent");
    expect(Array.isArray(restored.truncationWarnings)).toBe(true);
    expect(Array.isArray(restored.ingestionWarnings)).toBe(true);

    // Binary file round-trips correctly
    const binaryFile = restored.changeSets[0].changedFiles.find((f) => f.path === "assets/logo.png");
    expect(binaryFile?.isBinary).toBe(true);

    // Diff lines round-trip correctly (not stripped by default)
    const rolesFile = restored.changeSets[0].changedFiles.find((f) => f.path === "src/auth/roles.ts");
    expect(rolesFile?.hunks[0].lines.length).toBeGreaterThan(0);
  });
});
