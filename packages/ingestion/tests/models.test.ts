/**
 * models.test.ts
 *
 * Tests for:
 *   - data model shape validation (required fields, allowed values)
 *   - JSON serialization round-trips (JSON.stringify / JSON.parse)
 *   - helper: normaliseStatus
 *   - helper: parseNumstatLine
 *   - helper: parseRenamedPaths
 *   - helper: parseDiffHunks (valid hunks, malformed header, binary no-op)
 *   - helper: buildChangedFile (text file, binary file, rename)
 */

import { describe, it, expect } from "vitest";
import {
  normaliseStatus,
  parseNumstatLine,
  parseRenamedPaths,
  parseDiffHunks,
  parseHunkLines,
  sortChangedFiles,
  buildChangedFile,
} from "../src/utils/parse.js";
import type {
  ChangeSet,
  ChangedFile,
  DiffHunk,
  DiffLine,
  EvidenceSnippet,
  IngestionWarning,
  BranchComparison,
  RepositoryDescriptor,
  LocalGitSource,
} from "../src/models/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<RepositoryDescriptor> = {}): RepositoryDescriptor {
  return {
    name: "my-repo",
    remoteUrl: "https://github.com/org/my-repo",
    defaultBranch: "main",
    ...overrides,
  };
}

function makeHunk(overrides: Partial<DiffHunk> = {}): DiffHunk {
  return {
    header: "@@ -1,4 +1,6 @@",
    oldStart: 1,
    oldLines: 4,
    newStart: 1,
    newLines: 6,
    body: "@@ -1,4 +1,6 @@\n context\n-old line\n+new line\n+another new line\n context",
    lines: [
      { kind: "context", content: "context", oldLine: 1, newLine: 1 },
      { kind: "removed", content: "old line", oldLine: 2 },
      { kind: "added",   content: "new line",         newLine: 2 },
      { kind: "added",   content: "another new line", newLine: 3 },
      { kind: "context", content: "context", oldLine: 3, newLine: 4 },
    ],
    ...overrides,
  };
}

function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: "src/auth/roles.ts",
    status: "modified",
    additions: 5,
    deletions: 2,
    isBinary: false,
    hunks: [makeHunk()],
    ...overrides,
  };
}

function makeSnippet(overrides: Partial<EvidenceSnippet> = {}): EvidenceSnippet {
  return {
    id: "snip-abc123",
    changeSetId: "cs-001",
    filePath: "src/auth/roles.ts",
    sourceType: "function",
    diffRelation: "added",
    startLine: 10,
    endLine: 15,
    content: 'if (user.role === "owner") {',
    label: "function authorise",
    ...overrides,
  };
}

function makeWarning(overrides: Partial<IngestionWarning> = {}): IngestionWarning {
  return {
    code: "BINARY_FILE_SKIPPED",
    message: "Binary file skipped.",
    filePath: "assets/logo.png",
    ...overrides,
  };
}

function makeSource(): LocalGitSource {
  return {
    kind: "local-git",
    repositoryPath: "/home/dev/my-repo",
    baseRef: "main",
    headRef: "feature/billing",
  };
}

function makeChangeSet(overrides: Partial<ChangeSet> = {}): ChangeSet {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Add organization billing",
    summary: "Implements owner-only subscription management.",
    source: makeSource(),
    repository: makeRepo(),
    mergeBase: "abc123def456abc123def456abc123def456abc123",
    changedFiles: [makeChangedFile()],
    totalAdditions: 5,
    totalDeletions: 2,
    evidenceSnippets: [makeSnippet()],
    warnings: [],
    capturedAt: "2024-01-15T10:30:00.000Z",
    ...overrides,
  };
}

function makeBranchComparison(overrides: Partial<BranchComparison> = {}): BranchComparison {
  return {
    repository: makeRepo(),
    baseRef: "main",
    headRef: "feature/billing",
    mergeBase: "abc123def456",
    aheadBy: 3,
    behindBy: 0,
    capturedAt: "2024-01-15T10:30:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RepositoryDescriptor
// ---------------------------------------------------------------------------

describe("RepositoryDescriptor", () => {
  it("requires only name", () => {
    const repo: RepositoryDescriptor = { name: "bare-repo" };
    expect(repo.name).toBe("bare-repo");
    expect(repo.remoteUrl).toBeUndefined();
    expect(repo.defaultBranch).toBeUndefined();
  });

  it("accepts all optional fields", () => {
    const repo = makeRepo({ metadata: { stars: 42 } });
    expect(repo.metadata).toEqual({ stars: 42 });
  });

  it("round-trips through JSON", () => {
    const repo = makeRepo();
    const json = JSON.stringify(repo);
    const restored: RepositoryDescriptor = JSON.parse(json);
    expect(restored).toEqual(repo);
  });
});

// ---------------------------------------------------------------------------
// DiffHunk
// ---------------------------------------------------------------------------

describe("DiffHunk", () => {
  it("has the expected shape", () => {
    const hunk = makeHunk();
    expect(hunk.header).toMatch(/^@@/);
    expect(hunk.oldStart).toBeGreaterThan(0);
    expect(hunk.newStart).toBeGreaterThan(0);
    expect(typeof hunk.body).toBe("string");
  });

  it("round-trips through JSON", () => {
    const hunk = makeHunk();
    expect(JSON.parse(JSON.stringify(hunk))).toEqual(hunk);
  });
});

// ---------------------------------------------------------------------------
// ChangedFile
// ---------------------------------------------------------------------------

describe("ChangedFile", () => {
  it("accepts all normalised status values", () => {
    const statuses = ["added", "modified", "deleted", "renamed", "copied", "unknown"] as const;
    for (const status of statuses) {
      const f = makeChangedFile({ status });
      expect(f.status).toBe(status);
    }
  });

  it("accepts binary files with empty hunks", () => {
    const f = makeChangedFile({
      isBinary: true,
      additions: undefined,
      deletions: undefined,
      hunks: [],
    });
    expect(f.isBinary).toBe(true);
    expect(f.hunks).toHaveLength(0);
    expect(f.additions).toBeUndefined();
  });

  it("accepts renamed files with previousPath", () => {
    const f = makeChangedFile({
      path: "src/auth/authorize.ts",
      previousPath: "src/auth/roles.ts",
      status: "renamed",
    });
    expect(f.previousPath).toBe("src/auth/roles.ts");
    expect(f.status).toBe("renamed");
  });

  it("round-trips through JSON", () => {
    const f = makeChangedFile();
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });
});

// ---------------------------------------------------------------------------
// EvidenceSnippet
// ---------------------------------------------------------------------------

describe("EvidenceSnippet", () => {
  it("requires all mandatory fields", () => {
    const s = makeSnippet();
    expect(typeof s.id).toBe("string");
    expect(typeof s.changeSetId).toBe("string");
    expect(s.filePath).toBeTruthy();
    expect(s.startLine).toBeGreaterThan(0);
    expect(s.endLine).toBeGreaterThanOrEqual(s.startLine);
    expect(typeof s.content).toBe("string");
    expect(["function","type-decl","constant","route","diff-context","unknown"]).toContain(s.sourceType);
    expect(["added","removed","context","surrounding"]).toContain(s.diffRelation);
  });

  it("label is optional", () => {
    const s = makeSnippet({ label: undefined });
    expect(s.label).toBeUndefined();
  });

  it("accepts startLine=0 as unknown sentinel", () => {
    const s = makeSnippet({ startLine: 0, endLine: 0 });
    expect(s.startLine).toBe(0);
    expect(s.endLine).toBe(0);
  });

  it("accepts all sourceType values", () => {
    const types = ["function","type-decl","constant","route","diff-context","unknown"] as const;
    for (const t of types) {
      expect(makeSnippet({ sourceType: t }).sourceType).toBe(t);
    }
  });

  it("accepts all diffRelation values", () => {
    const rels = ["added","removed","context","surrounding"] as const;
    for (const r of rels) {
      expect(makeSnippet({ diffRelation: r }).diffRelation).toBe(r);
    }
  });

  it("round-trips through JSON", () => {
    const s = makeSnippet();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

// ---------------------------------------------------------------------------
// IngestionWarning
// ---------------------------------------------------------------------------

describe("IngestionWarning", () => {
  it("accepts all warning codes", () => {
    const codes = [
      "BINARY_FILE_SKIPPED",
      "DIFF_PARSE_ERROR",
      "EVIDENCE_EXTRACTION_FAILED",
      "STAT_UNAVAILABLE",
      "REF_NOT_FOUND",
      "TRUNCATED_DIFF",
      "UNKNOWN",
    ] as const;
    for (const code of codes) {
      const w: IngestionWarning = { code, message: "test" };
      expect(w.code).toBe(code);
    }
  });

  it("filePath is optional", () => {
    const w = makeWarning({ filePath: undefined });
    expect(w.filePath).toBeUndefined();
  });

  it("round-trips through JSON", () => {
    const w = makeWarning();
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});

// ---------------------------------------------------------------------------
// ChangeSet
// ---------------------------------------------------------------------------

describe("ChangeSet", () => {
  it("has required fields", () => {
    const cs = makeChangeSet();
    expect(typeof cs.id).toBe("string");
    expect(cs.id).toHaveLength(36); // UUID v4
    expect(cs.source.kind).toBe("local-git");
    expect(Array.isArray(cs.changedFiles)).toBe(true);
    expect(Array.isArray(cs.evidenceSnippets)).toBe(true);
    expect(Array.isArray(cs.warnings)).toBe(true);
    expect(cs.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("title and summary are optional", () => {
    const cs = makeChangeSet({ title: undefined, summary: undefined });
    expect(cs.title).toBeUndefined();
    expect(cs.summary).toBeUndefined();
  });

  it("totalAdditions equals sum of changedFile additions", () => {
    const files = [
      makeChangedFile({ additions: 10, deletions: 2 }),
      makeChangedFile({ path: "src/billing/permissions.ts", additions: 7, deletions: 3 }),
    ];
    const cs = makeChangeSet({
      changedFiles: files,
      totalAdditions: files.reduce((s, f) => s + (f.additions ?? 0), 0),
      totalDeletions: files.reduce((s, f) => s + (f.deletions ?? 0), 0),
    });
    expect(cs.totalAdditions).toBe(17);
    expect(cs.totalDeletions).toBe(5);
  });

  it("accepts LocalGitSource, GitHubPRSource, and UnknownSource", () => {
    const localCs = makeChangeSet();
    expect(localCs.source.kind).toBe("local-git");

    const ghCs = makeChangeSet({
      source: {
        kind: "github-pr",
        owner: "org",
        repo: "my-repo",
        prNumber: 42,
        baseRef: "main",
        headRef: "feature/billing",
        prUrl: "https://github.com/org/my-repo/pull/42",
      },
    });
    expect(ghCs.source.kind).toBe("github-pr");

    const unknownCs = makeChangeSet({ source: { kind: "unknown", description: "imported" } });
    expect(unknownCs.source.kind).toBe("unknown");
  });

  it("round-trips through JSON", () => {
    const cs = makeChangeSet();
    const restored: ChangeSet = JSON.parse(JSON.stringify(cs));
    expect(restored).toEqual(cs);
    expect(restored.changedFiles[0].hunks[0].header).toBe("@@ -1,4 +1,6 @@");
  });

  it("preserves nested evidence snippets through JSON", () => {
    const cs = makeChangeSet({
      evidenceSnippets: [
        makeSnippet({ label: "export-declaration" }),
        makeSnippet({ filePath: "src/billing/permissions.ts", startLine: 20, endLine: 25, content: "// billing" }),
      ],
    });
    const restored: ChangeSet = JSON.parse(JSON.stringify(cs));
    expect(restored.evidenceSnippets).toHaveLength(2);
    expect(restored.evidenceSnippets[0].label).toBe("export-declaration");
  });
});

// ---------------------------------------------------------------------------
// BranchComparison
// ---------------------------------------------------------------------------

describe("BranchComparison", () => {
  it("has required fields", () => {
    const bc = makeBranchComparison();
    expect(bc.baseRef).toBe("main");
    expect(bc.headRef).toBe("feature/billing");
    expect(bc.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("mergeBase, aheadBy, behindBy are optional", () => {
    const bc = makeBranchComparison({ mergeBase: undefined, aheadBy: undefined, behindBy: undefined });
    expect(bc.mergeBase).toBeUndefined();
    expect(bc.aheadBy).toBeUndefined();
    expect(bc.behindBy).toBeUndefined();
  });

  it("round-trips through JSON", () => {
    const bc = makeBranchComparison();
    expect(JSON.parse(JSON.stringify(bc))).toEqual(bc);
  });
});

// ---------------------------------------------------------------------------
// normaliseStatus
// ---------------------------------------------------------------------------

describe("normaliseStatus", () => {
  it.each([
    ["A", "added"],
    ["M", "modified"],
    ["D", "deleted"],
    ["R", "renamed"],
    ["C", "copied"],
    ["R100", "renamed"],   // similarity score suffix
    ["?", "unknown"],
    ["", "unknown"],
    ["U", "unknown"],
  ])("maps %s → %s", (letter, expected) => {
    expect(normaliseStatus(letter)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(normaliseStatus("a")).toBe("added");
    expect(normaliseStatus("m")).toBe("modified");
  });
});

// ---------------------------------------------------------------------------
// parseNumstatLine
// ---------------------------------------------------------------------------

describe("parseNumstatLine", () => {
  it("parses a standard text file line", () => {
    const result = parseNumstatLine("5\t3\tsrc/auth/roles.ts");
    expect(result).toEqual({
      additions: 5,
      deletions: 3,
      isBinary: false,
      path: "src/auth/roles.ts",
    });
  });

  it("parses a binary file line", () => {
    const result = parseNumstatLine("-\t-\tassets/logo.png");
    expect(result).toEqual({
      additions: undefined,
      deletions: undefined,
      isBinary: true,
      path: "assets/logo.png",
    });
  });

  it("returns null for lines with fewer than 3 tab-separated parts", () => {
    expect(parseNumstatLine("5\t3")).toBeNull();
    expect(parseNumstatLine("")).toBeNull();
    expect(parseNumstatLine("only-one-part")).toBeNull();
  });

  it("handles paths containing tabs", () => {
    // Unusual but valid — join remaining parts
    const result = parseNumstatLine("2\t1\tpath/with\ttab.ts");
    expect(result).not.toBeNull();
    expect(result!.path).toBe("path/with\ttab.ts");
  });
});

// ---------------------------------------------------------------------------
// parseRenamedPaths
// ---------------------------------------------------------------------------

describe("parseRenamedPaths", () => {
  it("parses a rename line", () => {
    const result = parseRenamedPaths("R100\tsrc/old.ts\tsrc/new.ts");
    expect(result).toEqual({ oldPath: "src/old.ts", newPath: "src/new.ts" });
  });

  it("parses a copy line", () => {
    const result = parseRenamedPaths("C80\tsrc/base.ts\tsrc/copy.ts");
    expect(result).toEqual({ oldPath: "src/base.ts", newPath: "src/copy.ts" });
  });

  it("returns null for non-rename lines", () => {
    expect(parseRenamedPaths("M\tsrc/auth/roles.ts")).toBeNull();
    expect(parseRenamedPaths("A\tsrc/new-file.ts")).toBeNull();
  });

  it("returns null for lines with fewer than 3 parts", () => {
    expect(parseRenamedPaths("R100\tonly-one-path")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseDiffHunks
// ---------------------------------------------------------------------------

describe("parseDiffHunks", () => {
  const singleHunkDiff = [
    "@@ -10,6 +10,8 @@ function authorise(user: User) {",
    " const role = user.role;",
    "-if (role === 'admin') {",
    "+if (role === 'owner') {",
    " }",
  ].join("\n");

  it("parses a single hunk correctly", () => {
    const warnings: IngestionWarning[] = [];
    const hunks = parseDiffHunks(singleHunkDiff, "src/auth/roles.ts", warnings);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldStart).toBe(10);
    expect(hunks[0].oldLines).toBe(6);
    expect(hunks[0].newStart).toBe(10);
    expect(hunks[0].newLines).toBe(8);
    expect(hunks[0].header).toBe("@@ -10,6 +10,8 @@ function authorise(user: User) {");
    expect(warnings).toHaveLength(0);
  });

  it("parses multiple hunks", () => {
    const multiHunkDiff = [
      "@@ -1,3 +1,4 @@",
      " line1",
      "+inserted",
      " line2",
      " line3",
      "@@ -20,4 +21,3 @@",
      " lineA",
      "-removed",
      " lineB",
      " lineC",
    ].join("\n");
    const warnings: IngestionWarning[] = [];
    const hunks = parseDiffHunks(multiHunkDiff, "src/file.ts", warnings);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].newStart).toBe(1);
    expect(hunks[1].oldStart).toBe(20);
    expect(warnings).toHaveLength(0);
  });

  it("handles hunk with no line count (defaults to 1)", () => {
    // Git omits ,1 when the count is exactly 1
    const diff = "@@ -5 +5 @@ single line change\n-old\n+new";
    const warnings: IngestionWarning[] = [];
    const hunks = parseDiffHunks(diff, "src/file.ts", warnings);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].oldLines).toBe(1);
    expect(hunks[0].newLines).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(parseDiffHunks("", "src/file.ts", [])).toEqual([]);
    expect(parseDiffHunks("   ", "src/file.ts", [])).toEqual([]);
  });

  it("adds a DIFF_PARSE_ERROR warning for malformed hunk headers", () => {
    const badDiff = "@@ not a valid header @@\n some content";
    const warnings: IngestionWarning[] = [];
    const hunks = parseDiffHunks(badDiff, "src/bad.ts", warnings);
    expect(hunks).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("DIFF_PARSE_ERROR");
    expect(warnings[0].filePath).toBe("src/bad.ts");
  });
});

// ---------------------------------------------------------------------------
// buildChangedFile
// ---------------------------------------------------------------------------

describe("buildChangedFile", () => {
  it("builds a text file with parsed hunks", () => {
    const rawDiff = "@@ -1,2 +1,3 @@\n context\n-old\n+new\n+extra";
    const warnings: IngestionWarning[] = [];
    const file = buildChangedFile(
      {
        path: "src/auth/roles.ts",
        statusLetter: "M",
        additions: 2,
        deletions: 1,
        isBinary: false,
        rawDiff,
      },
      warnings,
    );
    expect(file.status).toBe("modified");
    expect(file.hunks).toHaveLength(1);
    expect(file.isBinary).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it("builds a binary file with no hunks and emits BINARY_FILE_SKIPPED warning", () => {
    const warnings: IngestionWarning[] = [];
    const file = buildChangedFile(
      {
        path: "assets/logo.png",
        statusLetter: "A",
        isBinary: true,
        rawDiff: "",
      },
      warnings,
    );
    expect(file.isBinary).toBe(true);
    expect(file.hunks).toHaveLength(0);
    expect(file.status).toBe("added");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("BINARY_FILE_SKIPPED");
  });

  it("builds a renamed file with previousPath", () => {
    const warnings: IngestionWarning[] = [];
    const file = buildChangedFile(
      {
        path: "src/auth/authorize.ts",
        previousPath: "src/auth/roles.ts",
        statusLetter: "R",
        additions: 0,
        deletions: 0,
        isBinary: false,
        rawDiff: "",
      },
      warnings,
    );
    expect(file.status).toBe("renamed");
    expect(file.previousPath).toBe("src/auth/roles.ts");
    expect(file.path).toBe("src/auth/authorize.ts");
  });

  it("builds a deleted file", () => {
    const warnings: IngestionWarning[] = [];
    const file = buildChangedFile(
      {
        path: "src/old-module.ts",
        statusLetter: "D",
        additions: 0,
        deletions: 50,
        isBinary: false,
        rawDiff: "@@ -1,3 +0,0 @@\n-line1\n-line2\n-line3",
      },
      warnings,
    );
    expect(file.status).toBe("deleted");
    expect(file.deletions).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// DiffLine model
// ---------------------------------------------------------------------------

describe("DiffLine", () => {
  it("added line has newLine, no oldLine", () => {
    const line: DiffLine = { kind: "added", content: 'if (role === "owner")', newLine: 12 };
    expect(line.kind).toBe("added");
    expect(line.newLine).toBe(12);
    expect(line.oldLine).toBeUndefined();
  });

  it("removed line has oldLine, no newLine", () => {
    const line: DiffLine = { kind: "removed", content: 'if (role === "admin")', oldLine: 10 };
    expect(line.kind).toBe("removed");
    expect(line.oldLine).toBe(10);
    expect(line.newLine).toBeUndefined();
  });

  it("context line has both oldLine and newLine", () => {
    const line: DiffLine = { kind: "context", content: "const role = user.role;", oldLine: 9, newLine: 9 };
    expect(line.kind).toBe("context");
    expect(line.oldLine).toBe(9);
    expect(line.newLine).toBe(9);
  });

  it("round-trips through JSON", () => {
    const line: DiffLine = { kind: "added", content: "new code", newLine: 5 };
    expect(JSON.parse(JSON.stringify(line))).toEqual(line);
  });
});

// ---------------------------------------------------------------------------
// parseHunkLines
// ---------------------------------------------------------------------------

describe("parseHunkLines", () => {
  const hunkBody = [
    "@@ -10,4 +10,5 @@ function authorise(user: User) {",
    " const role = user.role;",
    '-if (role === "admin") {',
    '+if (role === "owner") {',
    '+  // owner check',
    " }",
  ].join("\n");

  it("parses added, removed, and context lines with correct line numbers", () => {
    const lines = parseHunkLines(hunkBody, 10, 10);

    const context = lines.filter((l) => l.kind === "context");
    const added   = lines.filter((l) => l.kind === "added");
    const removed  = lines.filter((l) => l.kind === "removed");

    expect(context.length).toBeGreaterThanOrEqual(2);
    expect(added).toHaveLength(2);
    expect(removed).toHaveLength(1);

    // First context line: old=10, new=10
    expect(context[0].oldLine).toBe(10);
    expect(context[0].newLine).toBe(10);

    // Removed line: old=11, no newLine
    expect(removed[0].oldLine).toBe(11);
    expect(removed[0].newLine).toBeUndefined();
    expect(removed[0].content).toContain("admin");

    // First added line: new=11, no oldLine
    expect(added[0].newLine).toBe(11);
    expect(added[0].oldLine).toBeUndefined();
    expect(added[0].content).toContain("owner");
  });

  it("skips the @@ header line", () => {
    const lines = parseHunkLines(hunkBody, 10, 10);
    expect(lines.every((l) => !l.content.startsWith("@@"))).toBe(true);
  });

  it("skips no-newline-at-end-of-file notices", () => {
    const body = "@@ -1,1 +1,1 @@\n-old\n+new\n\\ No newline at end of file";
    const lines = parseHunkLines(body, 1, 1);
    expect(lines.every((l) => !l.content.includes("No newline"))).toBe(true);
  });

  it("returns empty array for empty or header-only input", () => {
    expect(parseHunkLines("", 1, 1)).toEqual([]);
    expect(parseHunkLines("@@ -1,0 +1,0 @@", 1, 1)).toEqual([]);
  });

  it("increments old/new cursors independently", () => {
    // Two adds, one remove: new advances by 2, old by 1
    const body = "@@ -5,1 +5,2 @@\n-old\n+new1\n+new2";
    const lines = parseHunkLines(body, 5, 5);

    const removed = lines.filter((l) => l.kind === "removed");
    const added   = lines.filter((l) => l.kind === "added");

    expect(removed[0].oldLine).toBe(5);
    expect(added[0].newLine).toBe(5);
    expect(added[1].newLine).toBe(6);
  });

  it("round-trips each line through JSON", () => {
    const lines = parseHunkLines(hunkBody, 10, 10);
    expect(JSON.parse(JSON.stringify(lines))).toEqual(lines);
  });
});

// ---------------------------------------------------------------------------
// sortChangedFiles
// ---------------------------------------------------------------------------

describe("sortChangedFiles", () => {
  it("returns files sorted by path", () => {
    const files = [
      { path: "z-last.ts" },
      { path: "a-first.ts" },
      { path: "m-middle.ts" },
    ];
    const sorted = sortChangedFiles(files);
    expect(sorted.map((f) => f.path)).toEqual(["a-first.ts", "m-middle.ts", "z-last.ts"]);
  });

  it("does not mutate the original array", () => {
    const files = [{ path: "z.ts" }, { path: "a.ts" }];
    const original = [...files];
    sortChangedFiles(files);
    expect(files).toEqual(original);
  });

  it("is stable for already-sorted input", () => {
    const files = [{ path: "a.ts" }, { path: "b.ts" }, { path: "c.ts" }];
    expect(sortChangedFiles(files)).toEqual(files);
  });

  it("is case-insensitive", () => {
    const files = [{ path: "Z.ts" }, { path: "a.ts" }];
    const sorted = sortChangedFiles(files);
    expect(sorted[0].path).toBe("a.ts");
  });
});

// ---------------------------------------------------------------------------
// DiffHunk — lines field
// ---------------------------------------------------------------------------

describe("DiffHunk.lines", () => {
  it("includes the lines array in the fixture", () => {
    const hunk = makeHunk();
    expect(Array.isArray(hunk.lines)).toBe(true);
    expect(hunk.lines.length).toBeGreaterThan(0);
  });

  it("round-trips lines through JSON", () => {
    const hunk = makeHunk();
    const restored = JSON.parse(JSON.stringify(hunk));
    expect(restored.lines).toEqual(hunk.lines);
  });
});

// ---------------------------------------------------------------------------
// ChangeSet — mergeBase field
// ---------------------------------------------------------------------------

describe("ChangeSet.mergeBase", () => {
  it("carries mergeBase from the fixture", () => {
    const cs = makeChangeSet();
    expect(typeof cs.mergeBase).toBe("string");
  });

  it("mergeBase is optional — can be undefined", () => {
    const cs = makeChangeSet({ mergeBase: undefined });
    expect(cs.mergeBase).toBeUndefined();
  });

  it("round-trips mergeBase through JSON", () => {
    const cs = makeChangeSet();
    const restored = JSON.parse(JSON.stringify(cs));
    expect(restored.mergeBase).toBe(cs.mergeBase);
  });
});
