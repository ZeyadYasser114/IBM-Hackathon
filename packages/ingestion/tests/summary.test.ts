/**
 * summary.test.ts
 *
 * Tests for:
 *   - classifier.ts: detectLanguage, isTestFile, isConfigFile,
 *                    isAuthOrSecurityPath, topDirectory, collectDirectories,
 *                    computePriority, sortedUnique
 *   - file-summarizer.ts: summarizeFile — symbols, imports, exports, schemas,
 *                         test/config flags, binary files, no-hunk files
 *   - repo-summarizer.ts: summarizeRepository — aggregation, deduplication,
 *                         directory collection, priority, JSON round-trip
 */

import { describe, it, expect } from "vitest";
import {
  detectLanguage,
  isTestFile,
  isConfigFile,
  isAuthOrSecurityPath,
  topDirectory,
  collectDirectories,
  computePriority,
  sortedUnique,
} from "../src/summary/classifier.js";
import { summarizeFile } from "../src/summary/file-summarizer.js";
import { summarizeRepository } from "../src/summary/repo-summarizer.js";
import type {
  ChangeSet,
  ChangedFile,
  DiffHunk,
  DiffLine,
  EvidenceSnippet,
  FileSummary,
  RepositorySummary,
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
    body: "",
    lines,
    ...overrides,
  };
}

function file(path: string, hunks: DiffHunk[], overrides: Partial<ChangedFile> = {}): ChangedFile {
  const adds = hunks.flatMap((h) => h.lines).filter((l) => l.kind === "added").length;
  const dels = hunks.flatMap((h) => h.lines).filter((l) => l.kind === "removed").length;
  return {
    path,
    status: "modified",
    isBinary: false,
    additions: adds,
    deletions: dels,
    hunks,
    ...overrides,
  };
}

function changeSet(files: ChangedFile[], id = "cs-001"): ChangeSet {
  return {
    id,
    source: { kind: "local-git", repositoryPath: "/repo", baseRef: "main", headRef: "feature" },
    repository: { name: "test-repo" },
    changedFiles: files,
    totalAdditions: files.reduce((s, f) => s + (f.additions ?? 0), 0),
    totalDeletions: files.reduce((s, f) => s + (f.deletions ?? 0), 0),
    evidenceSnippets: [],
    warnings: [],
    capturedAt: "2024-01-15T10:00:00.000Z",
  };
}

function snippet(filePath: string, label: string, sourceType: EvidenceSnippet["sourceType"] = "function"): EvidenceSnippet {
  return {
    id: `snip-${filePath}-${label}`,
    changeSetId: "cs-001",
    filePath,
    sourceType,
    diffRelation: "added",
    startLine: 1,
    endLine: 5,
    content: "// snippet",
    label,
  };
}

// ---------------------------------------------------------------------------
// detectLanguage
// ---------------------------------------------------------------------------

describe("detectLanguage", () => {
  it.each([
    ["src/auth/roles.ts",       "typescript"],
    ["src/billing/permissions.tsx", "typescript"],
    ["src/app.js",              "javascript"],
    ["lib/utils.mjs",           "javascript"],
    ["auth/service.py",         "python"],
    ["cmd/main.go",             "go"],
    ["src/lib.rs",              "rust"],
    ["Auth.java",               "java"],
    ["Service.cs",              "csharp"],
    ["app.rb",                  "ruby"],
    ["Controller.php",          "php"],
    ["schema.graphql",          "graphql"],
    ["schema.prisma",           "prisma"],
    ["migrations/001.sql",      "sql"],
    ["package.json",            "json"],
    ["docker-compose.yml",      "yaml"],
    ["Cargo.toml",              "toml"],
    ["README.md",               "markdown"],
    ["deploy.sh",               "shell"],
    ["Dockerfile",              "dockerfile"],
    ["src/unknown.xyz",         "unknown"],
  ])("%s → %s", (path, expected) => {
    expect(detectLanguage(path)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// isTestFile
// ---------------------------------------------------------------------------

describe("isTestFile", () => {
  it.each([
    "src/auth/roles.test.ts",
    "src/billing/permissions.spec.js",
    "tests/auth.test.ts",
    "src/__tests__/auth.ts",
    "test/integration.ts",
  ])("returns true for %s", (path) => expect(isTestFile(path)).toBe(true));

  it.each([
    "src/auth/roles.ts",
    "src/billing/service.ts",
    "package.json",
  ])("returns false for %s", (path) => expect(isTestFile(path)).toBe(false));
});

// ---------------------------------------------------------------------------
// isConfigFile
// ---------------------------------------------------------------------------

describe("isConfigFile", () => {
  it.each([
    "tsconfig.json",
    "package.json",
    ".eslintrc.js",
    "jest.config.ts",
    "vitest.config.ts",
    ".env",
    ".env.production",
    "vite.config.ts",
    "docker-compose.yml",
    ".github/workflows/ci.yml",
  ])("returns true for %s", (path) => expect(isConfigFile(path)).toBe(true));

  it.each([
    "src/auth/roles.ts",
    "src/billing/service.ts",
    "README.md",
  ])("returns false for %s", (path) => expect(isConfigFile(path)).toBe(false));
});

// ---------------------------------------------------------------------------
// isAuthOrSecurityPath
// ---------------------------------------------------------------------------

describe("isAuthOrSecurityPath", () => {
  it.each([
    "src/auth/roles.ts",
    "src/security/middleware.ts",
    "src/permissions/check.ts",
    "middleware/authorize.ts",
    "src/auth.ts",
    "guards/jwt.guard.ts",
  ])("returns true for %s", (path) => expect(isAuthOrSecurityPath(path)).toBe(true));

  it.each([
    "src/billing/service.ts",
    "src/app.ts",
    "README.md",
  ])("returns false for %s", (path) => expect(isAuthOrSecurityPath(path)).toBe(false));
});

// ---------------------------------------------------------------------------
// topDirectory + collectDirectories
// ---------------------------------------------------------------------------

describe("topDirectory", () => {
  it.each([
    ["src/auth/roles.ts",     "src/auth"],
    ["tests/auth.test.ts",    "tests"],
    ["package.json",          "."],
    ["src/app.ts",            "src"],
    ["a/b/c/d.ts",            "a/b"],
  ])("%s → %s", (path, expected) => {
    expect(topDirectory(path)).toBe(expected);
  });
});

describe("collectDirectories", () => {
  it("returns sorted unique top directories", () => {
    const paths = [
      "src/auth/roles.ts",
      "src/billing/service.ts",
      "tests/auth.test.ts",
      "src/auth/middleware.ts", // same dir as first
    ];
    expect(collectDirectories(paths)).toEqual(["src/auth", "src/billing", "tests"]);
  });

  it("returns ['.'] for root-level files", () => {
    expect(collectDirectories(["package.json", "README.md"])).toEqual(["."]);
  });
});

// ---------------------------------------------------------------------------
// sortedUnique
// ---------------------------------------------------------------------------

describe("sortedUnique", () => {
  it("deduplicates and sorts", () => {
    expect(sortedUnique(["z", "a", "m", "a", "z"])).toEqual(["a", "m", "z"]);
  });

  it("returns empty array for empty input", () => {
    expect(sortedUnique([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computePriority
// ---------------------------------------------------------------------------

describe("computePriority", () => {
  const baseFileSummary = (overrides: Partial<FileSummary> = {}): FileSummary => ({
    filePath: "src/app.ts",
    fileStatus: "modified",
    language: "typescript",
    isTestFile: false,
    isConfigFile: false,
    touchedSymbols: [],
    changedImports: [],
    changedExports: [],
    touchedSchemaNames: [],
    additions: 10,
    deletions: 5,
    ...overrides,
  });

  it("returns HIGH when type declarations are touched", () => {
    const f = baseFileSummary({ touchedSchemaNames: ["UserRole"] });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 10, totalDeletions: 5, evidenceSnippetCount: 1 });
    expect(priority).toBe("high");
    expect(reasons).toContain("type-declarations-changed");
  });

  it("returns HIGH when API routes are changed", () => {
    const f = baseFileSummary({ touchedSymbols: ["route /api/billing"] });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 5, totalDeletions: 2, evidenceSnippetCount: 1 });
    expect(priority).toBe("high");
    expect(reasons).toContain("api-routes-changed");
  });

  it("returns HIGH when auth/security path is changed", () => {
    const f = baseFileSummary({ filePath: "src/auth/roles.ts" });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 3, totalDeletions: 1, evidenceSnippetCount: 0 });
    expect(priority).toBe("high");
    expect(reasons).toContain("auth-or-security-path");
  });

  it("returns HIGH when a schema file is changed", () => {
    const f = baseFileSummary({ language: "graphql", filePath: "schema.graphql" });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 2, totalDeletions: 0, evidenceSnippetCount: 0 });
    expect(priority).toBe("high");
    expect(reasons).toContain("schema-file-changed");
  });

  it("returns MEDIUM when exports changed", () => {
    const f = baseFileSummary({ changedExports: ["UserService"] });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 5, totalDeletions: 2, evidenceSnippetCount: 0 });
    expect(priority).toBe("medium");
    expect(reasons).toContain("exports-changed");
  });

  it("returns MEDIUM when diff volume is high", () => {
    const f = baseFileSummary({ additions: 150, deletions: 60 });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 150, totalDeletions: 60, evidenceSnippetCount: 0 });
    expect(priority).toBe("medium");
    expect(reasons).toContain("high-diff-volume");
  });

  it("returns LOW when all files are tests", () => {
    const f = baseFileSummary({ filePath: "tests/auth.test.ts", isTestFile: true });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 5, totalDeletions: 2, evidenceSnippetCount: 0 });
    expect(priority).toBe("low");
    expect(reasons).toContain("test-only-changes");
  });

  it("returns LOW when all files are config", () => {
    const f = baseFileSummary({ filePath: "tsconfig.json", isConfigFile: true, language: "json" });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 1, totalDeletions: 0, evidenceSnippetCount: 0 });
    expect(priority).toBe("low");
    expect(reasons).toContain("config-only-changes");
  });

  it("returns LOW for documentation-only changes", () => {
    const f = baseFileSummary({ filePath: "README.md", language: "markdown" });
    const { priority, reasons } = computePriority({ files: [f], totalAdditions: 5, totalDeletions: 0, evidenceSnippetCount: 0 });
    expect(priority).toBe("low");
    expect(reasons).toContain("documentation-only");
  });
});

// ---------------------------------------------------------------------------
// summarizeFile
// ---------------------------------------------------------------------------

describe("summarizeFile", () => {
  it("detects language and test/config flags", () => {
    const f = file("src/auth/roles.test.ts", []);
    const summary = summarizeFile(f, []);
    expect(summary.language).toBe("typescript");
    expect(summary.isTestFile).toBe(true);
    expect(summary.isConfigFile).toBe(false);
    expect(summary.filePath).toBe("src/auth/roles.test.ts");
    expect(summary.fileStatus).toBe("modified");
  });

  it("extracts touched symbols from changed lines — function declaration", () => {
    const h = hunk([
      dl("added", "export function authorise(user: User): boolean {", 1),
      dl("added", '  return user.role === "owner";', 2),
      dl("added", "}", 3),
    ]);
    const f = file("src/auth/roles.ts", [h]);
    const { touchedSymbols } = summarizeFile(f, []);
    expect(touchedSymbols.some((s) => s.includes("authorise"))).toBe(true);
  });

  it("extracts touched symbols from changed lines — interface declaration", () => {
    const h = hunk([
      dl("added", "export interface UserRole {", 1),
      dl("added", '  role: "owner" | "admin";', 2),
      dl("added", "}", 3),
    ]);
    const f = file("src/auth/types.ts", [h]);
    const { touchedSymbols, touchedSchemaNames } = summarizeFile(f, []);
    expect(touchedSymbols.some((s) => s.includes("UserRole"))).toBe(true);
    expect(touchedSchemaNames.some((s) => s.includes("UserRole"))).toBe(true);
  });

  it("extracts touched symbols from changed lines — enum", () => {
    const h = hunk([
      dl("removed", "export enum Permission {", undefined, 1),
      dl("added",   "export enum UserPermission {", 1),
    ]);
    const f = file("src/auth/permissions.ts", [h]);
    const { touchedSchemaNames } = summarizeFile(f, []);
    expect(touchedSchemaNames.some((s) => s.includes("Permission"))).toBe(true);
  });

  it("extracts changed imports", () => {
    const h = hunk([
      dl("removed", "import { admin } from '../roles';", undefined, 5),
      dl("added",   "import { owner } from '../roles';", 5),
    ]);
    const f = file("src/billing/permissions.ts", [h]);
    const { changedImports } = summarizeFile(f, []);
    expect(changedImports).toContain("../roles");
  });

  it("extracts changed exports", () => {
    const h = hunk([
      dl("added", "export const ROLE = 'owner';", 1),
    ]);
    const f = file("src/auth/roles.ts", [h]);
    const { changedExports } = summarizeFile(f, []);
    expect(changedExports).toContain("ROLE");
  });

  it("merges symbols from evidence snippets", () => {
    const f = file("src/auth/roles.ts", [hunk([dl("added", "// code", 1)])]);
    const snips = [
      snippet("src/auth/roles.ts", "function checkOwner"),
      snippet("src/billing/service.ts", "function other"), // different file — ignored
    ];
    const { touchedSymbols } = summarizeFile(f, snips);
    expect(touchedSymbols).toContain("function checkOwner");
    expect(touchedSymbols).not.toContain("function other");
  });

  it("returns empty lists for binary files", () => {
    const f = file("assets/logo.png", [], { isBinary: true, additions: undefined, deletions: undefined });
    const summary = summarizeFile(f, []);
    expect(summary.touchedSymbols).toHaveLength(0);
    expect(summary.changedImports).toHaveLength(0);
    expect(summary.changedExports).toHaveLength(0);
    expect(summary.touchedSchemaNames).toHaveLength(0);
    expect(summary.additions).toBeUndefined();
  });

  it("returns empty lists for files with no hunks", () => {
    const f = file("src/renamed.ts", [], { status: "renamed" });
    const summary = summarizeFile(f, []);
    expect(summary.touchedSymbols).toHaveLength(0);
  });

  it("does not count context lines as changed symbols", () => {
    const h = hunk([
      dl("context", "export function authorise(user: User) {", undefined, 1),
      dl("added",   '  return user.role === "owner";', 2),
      dl("context", "}", undefined, 3),
    ]);
    const f = file("src/auth/roles.ts", [h]);
    const { touchedSymbols } = summarizeFile(f, []);
    // "authorise" appears only in context — should NOT be extracted
    expect(touchedSymbols.filter((s) => s.includes("authorise"))).toHaveLength(0);
  });

  it("deduplicates symbols that appear in multiple hunks", () => {
    const h1 = hunk([dl("added", "export function authorise(user: User) {", 1)]);
    const h2 = hunk([dl("added", "export function authorise(user: User) {", 10)]);
    const f = file("src/auth/roles.ts", [h1, h2]);
    const { touchedSymbols } = summarizeFile(f, []);
    const authCount = touchedSymbols.filter((s) => s === "function authorise").length;
    expect(authCount).toBe(1);
  });

  it("round-trips through JSON", () => {
    const h = hunk([dl("added", "export interface Billing {", 1)]);
    const f = file("src/billing/types.ts", [h]);
    const summary = summarizeFile(f, []);
    const restored: FileSummary = JSON.parse(JSON.stringify(summary));
    expect(restored.filePath).toBe(summary.filePath);
    expect(restored.language).toBe(summary.language);
    expect(Array.isArray(restored.touchedSymbols)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summarizeRepository
// ---------------------------------------------------------------------------

describe("summarizeRepository", () => {
  it("aggregates totals correctly", () => {
    const cs = changeSet([
      file("src/auth/roles.ts", [
        hunk([dl("added", 'const ROLE = "owner";', 1), dl("removed", 'const ROLE = "admin";', undefined, 1)]),
      ]),
      file("src/billing/service.ts", [
        hunk([dl("added", "export function charge() {", 2)]),
      ]),
    ]);
    const summary = summarizeRepository(cs, []);

    expect(summary.changeSetId).toBe("cs-001");
    expect(summary.totalFiles).toBe(2);
    expect(summary.totalAdditions).toBeGreaterThan(0);
    expect(summary.files).toHaveLength(2);
  });

  it("collects touched directories", () => {
    const cs = changeSet([
      file("src/auth/roles.ts", [hunk([dl("added", "x", 1)])]),
      file("src/billing/service.ts", [hunk([dl("added", "y", 1)])]),
      file("tests/auth.test.ts", [hunk([dl("added", "z", 1)])]),
    ]);
    const { touchedDirectories } = summarizeRepository(cs, []);
    expect(touchedDirectories).toContain("src/auth");
    expect(touchedDirectories).toContain("src/billing");
    expect(touchedDirectories).toContain("tests");
  });

  it("collects unique languages", () => {
    const cs = changeSet([
      file("src/auth/roles.ts", [hunk([dl("added", "x", 1)])]),
      file("schema.graphql", [hunk([dl("added", "y", 1)])]),
    ]);
    const { languages } = summarizeRepository(cs, []);
    expect(languages).toContain("typescript");
    expect(languages).toContain("graphql");
  });

  it("deduplicates allTouchedSymbols across files", () => {
    const sharedHunk = hunk([dl("added", "export function authorise(user: User) {", 1)]);
    const cs = changeSet([
      file("src/auth/roles.ts",    [sharedHunk]),
      file("src/auth/service.ts",  [sharedHunk]),
    ]);
    const { allTouchedSymbols } = summarizeRepository(cs, []);
    const count = allTouchedSymbols.filter((s) => s === "function authorise").length;
    expect(count).toBe(1);
  });

  it("counts test and config files", () => {
    const cs = changeSet([
      file("src/auth/roles.ts",       [hunk([dl("added", "x", 1)])]),
      file("tests/auth.test.ts",      [hunk([dl("added", "y", 1)])]),
      file("tsconfig.json",           [hunk([dl("added", "z", 1)])], { status: "modified" }),
    ]);
    const { testFileCount, configFileCount } = summarizeRepository(cs, []);
    expect(testFileCount).toBe(1);
    expect(configFileCount).toBe(1);
  });

  it("reflects evidenceSnippetCount from passed snippets", () => {
    const cs = changeSet([file("src/x.ts", [hunk([dl("added", "x", 1)])])]);
    const snips = [
      snippet("src/x.ts", "function foo"),
      snippet("src/x.ts", "interface Bar", "type-decl"),
    ];
    const { evidenceSnippetCount } = summarizeRepository(cs, snips);
    expect(evidenceSnippetCount).toBe(2);
  });

  it("reflects warningCount from ChangeSet", () => {
    const cs: ChangeSet = {
      ...changeSet([file("src/x.ts", [hunk([dl("added", "x", 1)])])]),
      warnings: [
        { code: "BINARY_FILE_SKIPPED", message: "binary" },
        { code: "TRUNCATED_DIFF",      message: "truncated" },
      ],
    };
    const { warningCount } = summarizeRepository(cs, []);
    expect(warningCount).toBe(2);
  });

  it("files list is sorted by filePath", () => {
    const cs = changeSet([
      file("src/z.ts", [hunk([dl("added", "z", 1)])]),
      file("src/a.ts", [hunk([dl("added", "a", 1)])]),
      file("src/m.ts", [hunk([dl("added", "m", 1)])]),
    ]);
    const { files } = summarizeRepository(cs, []);
    const paths = files.map((f) => f.filePath);
    expect(paths).toEqual([...paths].sort());
  });

  it("assigns HIGH priority when type declarations are touched", () => {
    const cs = changeSet([
      file("src/auth/types.ts", [
        hunk([dl("added", "export interface UserRole {", 1)]),
      ]),
    ]);
    const { analysisPriority, priorityReasons } = summarizeRepository(cs, []);
    expect(analysisPriority).toBe("high");
    expect(priorityReasons).toContain("type-declarations-changed");
  });

  it("assigns HIGH priority for auth path regardless of diff content", () => {
    const cs = changeSet([
      file("src/auth/roles.ts", [hunk([dl("added", 'const x = "value";', 1)])]),
    ]);
    const { analysisPriority, priorityReasons } = summarizeRepository(cs, []);
    expect(analysisPriority).toBe("high");
    expect(priorityReasons).toContain("auth-or-security-path");
  });

  it("assigns LOW priority for test-only changes", () => {
    const cs = changeSet([
      file("tests/auth.test.ts", [hunk([dl("added", "expect(true).toBe(true);", 1)])]),
    ]);
    const { analysisPriority, priorityReasons } = summarizeRepository(cs, []);
    expect(analysisPriority).toBe("low");
    expect(priorityReasons).toContain("test-only-changes");
  });

  it("is deterministic — same input always produces same output", () => {
    const cs = changeSet([
      file("src/billing/service.ts", [
        hunk([dl("added", "export function charge() {", 1)]),
      ]),
      file("src/auth/roles.ts", [
        hunk([dl("removed", 'const ROLE = "admin";', undefined, 1)]),
        hunk([dl("added",   'const ROLE = "owner";', 1)]),
      ]),
    ]);
    const r1 = summarizeRepository(cs, []);
    const r2 = summarizeRepository(cs, []);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("round-trips through JSON preserving all fields", () => {
    const cs = changeSet([
      file("src/auth/roles.ts", [
        hunk([
          dl("removed", 'export const ROLE = "admin";', undefined, 1),
          dl("added",   'export const ROLE = "owner";', 1),
        ]),
      ]),
      file("tests/auth.test.ts", [hunk([dl("added", "it('works', () => {});", 1)])]),
    ]);
    const summary = summarizeRepository(cs, []);
    const restored: RepositorySummary = JSON.parse(JSON.stringify(summary));

    expect(restored.changeSetId).toBe(summary.changeSetId);
    expect(restored.totalFiles).toBe(summary.totalFiles);
    expect(restored.analysisPriority).toBe(summary.analysisPriority);
    expect(restored.priorityReasons).toEqual(summary.priorityReasons);
    expect(restored.files).toHaveLength(summary.files.length);
    expect(Array.isArray(restored.touchedDirectories)).toBe(true);
    expect(Array.isArray(restored.languages)).toBe(true);
    expect(Array.isArray(restored.allTouchedSymbols)).toBe(true);
  });

  it("handles empty ChangeSet gracefully", () => {
    const cs = changeSet([]);
    const summary = summarizeRepository(cs, []);
    expect(summary.totalFiles).toBe(0);
    expect(summary.files).toHaveLength(0);
    expect(summary.languages).toHaveLength(0);
    expect(summary.analysisPriority).toBe("low");
  });
});
