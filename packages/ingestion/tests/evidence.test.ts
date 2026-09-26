/**
 * evidence.test.ts
 *
 * Tests for:
 *   - patterns.ts: classifyLine, findBlockEnd, isTsJsFile, isSchemaFile
 *   - extractor.ts: extractEvidence — TS/JS structural extraction, diff-context
 *     fallback, deduplication, ordering, warnings, binary skip, empty diff
 *
 * All tests use in-memory fixtures — no real Git or file-system access.
 */

import { describe, it, expect } from "vitest";
import { classifyLine, findBlockEnd, isTsJsFile, isSchemaFile } from "../src/evidence/patterns.js";
import { extractEvidence } from "../src/evidence/extractor.js";
import type {
  ChangeSet,
  ChangedFile,
  DiffHunk,
  DiffLine,
  EvidenceSnippet,
} from "../src/models/index.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeDiffLine(
  kind: DiffLine["kind"],
  content: string,
  newLine?: number,
  oldLine?: number,
): DiffLine {
  return { kind, content, newLine, oldLine };
}

function makeHunk(
  overrides: Partial<DiffHunk> & { lines: DiffHunk["lines"] },
): DiffHunk {
  return {
    header: "@@ -1,3 +1,4 @@",
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 4,
    body: "",
    ...overrides,
  };
}

function makeFile(
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

function makeChangeSet(files: ChangedFile[]): ChangeSet {
  return {
    id: "cs-test-001",
    source: { kind: "local-git", repositoryPath: "/repo", baseRef: "main", headRef: "feature" },
    repository: { name: "test-repo" },
    changedFiles: files,
    totalAdditions: 0,
    totalDeletions: 0,
    evidenceSnippets: [],
    warnings: [],
    capturedAt: "2024-01-15T10:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// classifyLine — functions
// ---------------------------------------------------------------------------

describe("classifyLine — functions", () => {
  it("classifies a regular function declaration", () => {
    const r = classifyLine("function authorise(user: User): boolean {");
    expect(r?.sourceType).toBe("function");
    expect(r?.label).toBe("function authorise");
    expect(r?.opensBlock).toBe(true);
  });

  it("classifies an export async function", () => {
    const r = classifyLine("export async function handleRequest(req: Request) {");
    expect(r?.sourceType).toBe("function");
    expect(r?.label).toContain("handleRequest");
  });

  it("classifies an arrow function assigned to const", () => {
    const r = classifyLine("const checkPermission = (user: User) => {");
    expect(r?.sourceType).toBe("function");
    expect(r?.label).toContain("checkPermission");
  });

  it("classifies an async arrow function", () => {
    const r = classifyLine("export const fetchUser = async (id: string): Promise<User> => {");
    expect(r?.sourceType).toBe("function");
    expect(r?.label).toContain("fetchUser");
  });

  it("classifies a class method with access modifier", () => {
    const r = classifyLine("  public async canManageSubscription(user: User): boolean {");
    expect(r?.sourceType).toBe("function");
    expect(r?.label).toContain("canManageSubscription");
  });

  it("classifies a static method", () => {
    const r = classifyLine("  static verify(token: string) {");
    expect(r?.sourceType).toBe("function");
    expect(r?.label).toContain("verify");
  });
});

// ---------------------------------------------------------------------------
// classifyLine — type declarations
// ---------------------------------------------------------------------------

describe("classifyLine — type declarations", () => {
  it("classifies an interface", () => {
    const r = classifyLine("export interface UserRole {");
    expect(r?.sourceType).toBe("type-decl");
    expect(r?.label).toBe("interface UserRole");
    expect(r?.opensBlock).toBe(true);
  });

  it("classifies a type alias", () => {
    const r = classifyLine('export type Role = "owner" | "admin" | "member";');
    expect(r?.sourceType).toBe("type-decl");
    expect(r?.label).toBe("type Role");
  });

  it("classifies a generic interface", () => {
    const r = classifyLine("interface Repository<T extends Entity> {");
    expect(r?.sourceType).toBe("type-decl");
    expect(r?.label).toBe("interface Repository");
  });

  it("classifies a class", () => {
    const r = classifyLine("export class AuthService {");
    expect(r?.sourceType).toBe("type-decl");
    expect(r?.label).toBe("class AuthService");
  });

  it("classifies an abstract class", () => {
    const r = classifyLine("export abstract class BaseService {");
    expect(r?.sourceType).toBe("type-decl");
    expect(r?.label).toBe("class BaseService");
  });

  it("classifies an enum", () => {
    const r = classifyLine("export enum UserRole {");
    expect(r?.sourceType).toBe("type-decl");
    expect(r?.label).toBe("enum UserRole");
    expect(r?.opensBlock).toBe(true);
  });

  it("classifies a const enum", () => {
    const r = classifyLine("const enum Permission {");
    expect(r?.sourceType).toBe("type-decl");
    expect(r?.label).toBe("enum Permission");
  });
});

// ---------------------------------------------------------------------------
// classifyLine — constants
// ---------------------------------------------------------------------------

describe("classifyLine — constants", () => {
  it("classifies a simple const", () => {
    const r = classifyLine('export const ROLE = "owner";');
    expect(r?.sourceType).toBe("constant");
    expect(r?.label).toBe("const ROLE");
  });

  it("classifies a typed const", () => {
    const r = classifyLine("export const DEFAULT_ROLE: Role = ROLES.OWNER;");
    expect(r?.sourceType).toBe("constant");
    expect(r?.label).toBe("const DEFAULT_ROLE");
  });

  it("classifies an Object.freeze constant", () => {
    const r = classifyLine("export const ROLES = Object.freeze({");
    expect(r?.sourceType).toBe("constant");
    expect(r?.label).toBe("const ROLES");
  });
});

// ---------------------------------------------------------------------------
// classifyLine — API routes
// ---------------------------------------------------------------------------

describe("classifyLine — routes", () => {
  it("classifies an Express GET route", () => {
    const r = classifyLine('  app.get("/api/billing/subscriptions", async (req, res) => {');
    expect(r?.sourceType).toBe("route");
    expect(r?.label).toContain("/api/billing/subscriptions");
  });

  it("classifies a POST route", () => {
    const r = classifyLine('router.post("/subscriptions", handleCreate);');
    expect(r?.sourceType).toBe("route");
    expect(r?.label).toContain("/subscriptions");
  });

  it("classifies a Next.js default export handler", () => {
    const r = classifyLine("export default async function handler(req, res) {");
    expect(r?.sourceType).toBe("route");
    expect(r?.label).toContain("handler");
  });
});

// ---------------------------------------------------------------------------
// classifyLine — no match
// ---------------------------------------------------------------------------

describe("classifyLine — returns null for non-construct lines", () => {
  it.each([
    "// comment",
    "  return result;",
    "import { foo } from './bar';",
    "  }",
    "",
    "if (condition) {",
    "for (const item of items) {",
  ])("returns null for: %s", (line) => {
    expect(classifyLine(line)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findBlockEnd
// ---------------------------------------------------------------------------

describe("findBlockEnd", () => {
  it("finds the matching closing brace", () => {
    const lines = [
      "function foo() {",   // 0
      "  const x = 1;",     // 1
      "  return x;",        // 2
      "}",                  // 3
    ];
    expect(findBlockEnd(lines, 0)).toBe(3);
  });

  it("handles nested braces", () => {
    const lines = [
      "function outer() {",    // 0
      "  if (true) {",         // 1
      "    inner();",           // 2
      "  }",                   // 3
      "}",                     // 4
    ];
    expect(findBlockEnd(lines, 0)).toBe(4);
  });

  it("returns null when no matching close found within maxLines", () => {
    const lines = Array.from({ length: 5 }, () => "  line");
    lines[0] = "function foo() {";
    expect(findBlockEnd(lines, 0, 3)).toBeNull();
  });

  it("returns the opener line itself when block closes on the same line", () => {
    const lines = ["const x = { a: 1 };"];
    expect(findBlockEnd(lines, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isTsJsFile / isSchemaFile
// ---------------------------------------------------------------------------

describe("isTsJsFile", () => {
  it.each(["foo.ts", "bar.tsx", "baz.js", "qux.jsx", "mod.mjs", "mod.cjs", "mod.mts"])
    ("returns true for %s", (f) => expect(isTsJsFile(f)).toBe(true));

  it.each(["foo.py", "bar.go", "baz.rs", "qux.json", "schema.prisma"])
    ("returns false for %s", (f) => expect(isTsJsFile(f)).toBe(false));
});

describe("isSchemaFile", () => {
  it.each(["schema.graphql", "types.gql", "schema.prisma", "config.json", "values.yaml", "values.yml"])
    ("returns true for %s", (f) => expect(isSchemaFile(f)).toBe(true));

  it.each(["auth.ts", "billing.js"])
    ("returns false for %s", (f) => expect(isSchemaFile(f)).toBe(false));
});

// ---------------------------------------------------------------------------
// extractEvidence — diff-context fallback (no file content)
// ---------------------------------------------------------------------------

describe("extractEvidence — diff-context fallback", () => {
  it("emits added snippet for added lines when no file content provided", () => {
    const hunk = makeHunk({
      lines: [
        makeDiffLine("added", 'if (user.role === "owner") {', 10),
        makeDiffLine("added", "  manageSubscription();", 11),
        makeDiffLine("added", "}", 12),
      ],
    });
    const file = makeFile("src/billing/permissions.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets, warnings } = extractEvidence(cs);

    expect(warnings).toHaveLength(0);
    const added = snippets.filter((s) => s.diffRelation === "added");
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].filePath).toBe("src/billing/permissions.ts");
    expect(added[0].sourceType).toBe("diff-context");
    expect(added[0].content).toContain("owner");
  });

  it("emits removed snippet for removed lines", () => {
    const hunk = makeHunk({
      lines: [
        makeDiffLine("removed", 'if (user.role === "admin") {', undefined, 10),
      ],
    });
    const file = makeFile("src/billing/permissions.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs);
    const removed = snippets.filter((s) => s.diffRelation === "removed");
    expect(removed.length).toBeGreaterThan(0);
    expect(removed[0].content).toContain("admin");
  });

  it("uses line 0 sentinel when no line numbers available", () => {
    const hunk = makeHunk({
      lines: [makeDiffLine("added", 'const x = "foo";')], // no newLine
    });
    const file = makeFile("src/x.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs);
    expect(snippets.some((s) => s.startLine === 0)).toBe(true);
  });

  it("skips binary files entirely", () => {
    const file = makeFile("assets/logo.png", [], { isBinary: true, hunks: [] });
    const cs = makeChangeSet([file]);

    const { snippets, warnings } = extractEvidence(cs);
    expect(snippets).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("returns empty result for a ChangeSet with no changed files", () => {
    const { snippets, warnings } = extractEvidence(makeChangeSet([]));
    expect(snippets).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("handles files with no hunks (e.g. rename-only)", () => {
    const file = makeFile("src/renamed.ts", [], { status: "renamed", hunks: [] });
    const { snippets } = extractEvidence(makeChangeSet([file]));
    expect(snippets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractEvidence — structural extraction (TS/JS with file content)
// ---------------------------------------------------------------------------

describe("extractEvidence — structural extraction (TS/JS)", () => {
  it("extracts the containing function when a changed line is inside one", () => {
    const fileContent = [
      "export function authorise(user: User): boolean {",   // line 1
      '  if (user.role === "owner") {',                     // line 2
      "    return true;",                                    // line 3
      "  }",                                                // line 4
      "  return false;",                                    // line 5
      "}",                                                  // line 6
    ].join("\n");

    const hunk = makeHunk({
      lines: [
        makeDiffLine("removed", '  if (user.role === "admin") {', undefined, 2),
        makeDiffLine("added",   '  if (user.role === "owner") {', 2),
      ],
    });
    const file = makeFile("src/auth/roles.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs, new Map([["src/auth/roles.ts", fileContent]]));

    const fnSnippet = snippets.find((s) => s.sourceType === "function");
    expect(fnSnippet).toBeDefined();
    expect(fnSnippet!.label).toContain("authorise");
    expect(fnSnippet!.content).toContain("authorise");
    expect(fnSnippet!.changeSetId).toBe("cs-test-001");
    expect(fnSnippet!.filePath).toBe("src/auth/roles.ts");
    expect(fnSnippet!.startLine).toBeGreaterThan(0);
    expect(fnSnippet!.endLine).toBeGreaterThanOrEqual(fnSnippet!.startLine);
  });

  it("extracts an interface when a line inside it is changed", () => {
    const fileContent = [
      "export interface UserRole {",      // line 1
      '  role: "owner" | "admin";',       // line 2
      "  orgId: string;",                 // line 3
      "}",                               // line 4
    ].join("\n");

    const hunk = makeHunk({
      lines: [
        makeDiffLine("removed", '  role: "admin";', undefined, 2),
        makeDiffLine("added",   '  role: "owner" | "admin";', 2),
      ],
    });
    const file = makeFile("src/auth/types.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs, new Map([["src/auth/types.ts", fileContent]]));

    const typeSnippet = snippets.find((s) => s.sourceType === "type-decl");
    expect(typeSnippet).toBeDefined();
    expect(typeSnippet!.label).toContain("UserRole");
    expect(typeSnippet!.content).toContain("UserRole");
  });

  it("extracts a const/enum touched by the diff", () => {
    const fileContent = [
      "export const ROLES = Object.freeze({",   // line 1
      '  OWNER: "owner",',                       // line 2
      '  ADMIN: "admin",',                       // line 3
      "} as const);",                            // line 4
    ].join("\n");

    const hunk = makeHunk({
      lines: [makeDiffLine("added", '  MEMBER: "member",', 3)],
    });
    const file = makeFile("src/auth/roles.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs, new Map([["src/auth/roles.ts", fileContent]]));

    const constSnippet = snippets.find((s) => s.sourceType === "constant");
    expect(constSnippet).toBeDefined();
    expect(constSnippet!.label).toContain("ROLES");
  });

  it("extracts an API route when a route line is changed", () => {
    const fileContent = [
      "import { Router } from 'express';",                   // line 1
      "const router = Router();",                             // line 2
      'router.post("/subscriptions", async (req, res) => {', // line 3
      "  const { userId } = req.body;",                      // line 4
      "  res.json({ ok: true });",                           // line 5
      "});",                                                 // line 6
    ].join("\n");

    const hunk = makeHunk({
      lines: [
        makeDiffLine("removed", "  const { userId } = req.body;", undefined, 4),
        makeDiffLine("added",   "  const { userId, orgId } = req.body;", 4),
      ],
    });
    const file = makeFile("src/routes/billing.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs, new Map([["src/routes/billing.ts", fileContent]]));

    const routeSnippet = snippets.find((s) => s.sourceType === "route");
    expect(routeSnippet).toBeDefined();
    expect(routeSnippet!.label).toContain("/subscriptions");
  });

  it("falls back to diff-context when no pattern matches", () => {
    const fileContent = [
      "// just a plain comment file",
      "x = 1 + 2;",
      "y = x * 3;",
    ].join("\n");

    const hunk = makeHunk({
      lines: [makeDiffLine("added", "y = x * 4;", 3)],
    });
    const file = makeFile("src/misc.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs, new Map([["src/misc.ts", fileContent]]));

    // Should have at least one snippet, and it should be diff-context
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets.every((s) => s.sourceType === "diff-context")).toBe(true);
  });

  it("respects maxSnippetLines option", () => {
    // Build a function with 100 lines
    const funcLines = ["export function bigFunc() {"];
    for (let i = 0; i < 98; i++) funcLines.push(`  const x${i} = ${i};`);
    funcLines.push("}");
    const fileContent = funcLines.join("\n");

    const hunk = makeHunk({
      lines: [makeDiffLine("added", "  const x0 = 0;", 2)],
    });
    const file = makeFile("src/big.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(
      cs,
      new Map([["src/big.ts", fileContent]]),
      { maxSnippetLines: 10 },
    );

    expect(snippets.every((s) => {
      const lineCount = s.content.split("\n").length;
      return lineCount <= 10;
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractEvidence — snippet properties
// ---------------------------------------------------------------------------

describe("extractEvidence — snippet properties", () => {
  it("every snippet has a non-empty id", () => {
    const hunk = makeHunk({
      lines: [makeDiffLine("added", 'const x = "owner";', 1)],
    });
    const { snippets } = extractEvidence(makeChangeSet([makeFile("src/x.ts", [hunk])]));
    expect(snippets.every((s) => typeof s.id === "string" && s.id.length > 0)).toBe(true);
  });

  it("snippet id is stable across repeated calls with identical input", () => {
    const hunk = makeHunk({
      lines: [makeDiffLine("added", 'const ROLE = "owner";', 5)],
    });
    const cs = makeChangeSet([makeFile("src/auth.ts", [hunk])]);

    const r1 = extractEvidence(cs);
    const r2 = extractEvidence(cs);
    expect(r1.snippets.map((s) => s.id)).toEqual(r2.snippets.map((s) => s.id));
  });

  it("every snippet has the correct changeSetId", () => {
    const hunk = makeHunk({
      lines: [makeDiffLine("added", "line", 1)],
    });
    const cs = makeChangeSet([makeFile("src/x.ts", [hunk])]);
    const { snippets } = extractEvidence(cs);
    expect(snippets.every((s) => s.changeSetId === "cs-test-001")).toBe(true);
  });

  it("snippets are stably ordered by filePath then startLine", () => {
    const hunkA = makeHunk({ lines: [makeDiffLine("added", "a", 5)] });
    const hunkB = makeHunk({ lines: [makeDiffLine("added", "b", 2)] });
    const cs = makeChangeSet([
      makeFile("src/z.ts", [hunkA]),
      makeFile("src/a.ts", [hunkB]),
    ]);

    const { snippets } = extractEvidence(cs);
    const paths = snippets.map((s) => s.filePath);
    // src/a.ts should come before src/z.ts
    if (paths.includes("src/a.ts") && paths.includes("src/z.ts")) {
      expect(paths.indexOf("src/a.ts")).toBeLessThan(paths.indexOf("src/z.ts"));
    }
  });
});

// ---------------------------------------------------------------------------
// extractEvidence — deduplication
// ---------------------------------------------------------------------------

describe("extractEvidence — deduplication", () => {
  it("does not emit duplicate snippets for the same line range", () => {
    // Two hunks that both touch lines 1-3 → should collapse
    const hunkA = makeHunk({
      header: "@@ -1,2 +1,2 @@",
      lines: [
        makeDiffLine("added", "line1", 1),
        makeDiffLine("added", "line2", 2),
      ],
    });
    const hunkB = makeHunk({
      header: "@@ -1,2 +1,3 @@",
      lines: [
        makeDiffLine("added", "line1", 1),
        makeDiffLine("added", "line3", 3),
      ],
    });
    const file = makeFile("src/x.ts", [hunkA, hunkB]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs);

    // Check no two snippets from the same file have exactly the same id
    const ids = snippets.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prefers a structural snippet over a diff-context snippet for the same range", () => {
    const fileContent = [
      'export const ROLE = "owner";', // line 1
    ].join("\n");

    const hunk = makeHunk({
      lines: [makeDiffLine("added", 'export const ROLE = "owner";', 1)],
    });
    const file = makeFile("src/auth.ts", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs, new Map([["src/auth.ts", fileContent]]));

    // With structural extraction available, should not have diff-context for same range
    const contextSnippets = snippets.filter(
      (s) => s.sourceType === "diff-context" && s.startLine === 1,
    );
    const structuralSnippets = snippets.filter(
      (s) => s.sourceType !== "diff-context" && s.startLine === 1,
    );
    // If structural was found, diff-context for same position should be deduped out
    if (structuralSnippets.length > 0) {
      expect(contextSnippets).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// extractEvidence — non-TS/JS files (generic fallback)
// ---------------------------------------------------------------------------

describe("extractEvidence — generic fallback for non-TS/JS files", () => {
  it("uses diff-context for .py files even when content is provided", () => {
    const fileContent = "def check_role(user):\n    return user.role == 'owner'\n";
    const hunk = makeHunk({
      lines: [makeDiffLine("added", "    return user.role == 'owner'", 2)],
    });
    const file = makeFile("src/auth.py", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs, new Map([["src/auth.py", fileContent]]));

    // Python is not TS/JS — should use diff-context
    expect(snippets.every((s) => s.sourceType === "diff-context")).toBe(true);
  });

  it("uses diff-context for .go files", () => {
    const hunk = makeHunk({
      lines: [makeDiffLine("added", 'role = "owner"', 5)],
    });
    const file = makeFile("pkg/auth/roles.go", [hunk]);
    const { snippets } = extractEvidence(makeChangeSet([file]));
    expect(snippets.every((s) => s.sourceType === "diff-context")).toBe(true);
  });

  it("uses diff-context for JSON files", () => {
    const fileContent = '{\n  "role": "owner"\n}\n';
    const hunk = makeHunk({
      lines: [makeDiffLine("added", '  "role": "owner"', 2)],
    });
    const file = makeFile("config/permissions.json", [hunk]);
    const cs = makeChangeSet([file]);

    const { snippets } = extractEvidence(cs, new Map([["config/permissions.json", fileContent]]));

    expect(snippets.every((s) => s.sourceType === "diff-context")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractEvidence — multi-file ChangeSet
// ---------------------------------------------------------------------------

describe("extractEvidence — multi-file ChangeSet", () => {
  it("processes all files and returns snippets for each", () => {
    const hunkA = makeHunk({ lines: [makeDiffLine("added", "lineA", 1)] });
    const hunkB = makeHunk({ lines: [makeDiffLine("removed", "lineB", undefined, 1)] });

    const cs = makeChangeSet([
      makeFile("src/auth/roles.ts", [hunkA]),
      makeFile("src/billing/permissions.ts", [hunkB]),
    ]);

    const { snippets } = extractEvidence(cs);
    const paths = new Set(snippets.map((s) => s.filePath));
    expect(paths.has("src/auth/roles.ts")).toBe(true);
    expect(paths.has("src/billing/permissions.ts")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractEvidence — JSON serialization
// ---------------------------------------------------------------------------

describe("extractEvidence — JSON round-trip", () => {
  it("all snippets survive JSON.stringify / JSON.parse", () => {
    const fileContent = [
      "export function authorise(user: User) {",
      '  return user.role === "owner";',
      "}",
    ].join("\n");
    const hunk = makeHunk({
      lines: [makeDiffLine("added", '  return user.role === "owner";', 2)],
    });
    const cs = makeChangeSet([makeFile("src/auth.ts", [hunk])]);
    const { snippets } = extractEvidence(cs, new Map([["src/auth.ts", fileContent]]));

    const restored: EvidenceSnippet[] = JSON.parse(JSON.stringify(snippets));
    expect(restored).toHaveLength(snippets.length);
    for (const s of restored) {
      expect(typeof s.id).toBe("string");
      expect(typeof s.changeSetId).toBe("string");
      expect(typeof s.filePath).toBe("string");
      expect(typeof s.startLine).toBe("number");
      expect(typeof s.content).toBe("string");
    }
  });
});
