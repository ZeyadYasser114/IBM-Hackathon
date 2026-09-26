/**
 * integration.test.ts
 *
 * Integration tests for the local Git ingestion provider.
 *
 * These tests create REAL Git repositories in OS temporary directories.
 * No mocks — actual `git` commands are executed.
 *
 * Coverage:
 *   - modified file with text diff hunks (line numbers, added/removed/context lines)
 *   - added file
 *   - deleted file
 *   - renamed file
 *   - binary file detection + BINARY_FILE_SKIPPED warning
 *   - empty diff (two refs with no file changes between them)
 *   - invalid ref → REF_NOT_FOUND warning, graceful result
 *   - truncated oversized diff → TRUNCATED_DIFF warning
 *   - working-tree mode (WORKING_TREE sentinel)
 *   - deterministic output ordering across multiple changed files
 *   - ingestChanges() convenience function
 *   - ChangeSet JSON serialization round-trip
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  ingestLocalGit,
  ingestChanges,
  WORKING_TREE,
} from "../src/providers/git.js";
import type { ChangeSet, DiffLine } from "../src/models/index.js";

// ---------------------------------------------------------------------------
// Test repo factory
// ---------------------------------------------------------------------------

interface TestRepo {
  dir: string;
  /** Run a shell command inside the repo dir. */
  git: (cmd: string) => string;
  /** Write (or overwrite) a file relative to the repo root. */
  write: (relPath: string, content: string) => void;
  /** Write binary content (null bytes) to mark a file as binary. */
  writeBinary: (relPath: string) => void;
  /** Stage all changes. */
  addAll: () => void;
  /** Create a commit with the given message and return its SHA. */
  commit: (message: string) => string;
  /** Create and switch to a new branch. */
  branch: (name: string) => void;
  /** Switch to an existing branch. */
  checkout: (name: string) => void;
}

function makeRepo(): TestRepo {
  const dir = mkdtempSync(join(tmpdir(), "mergemind-test-"));

  const git = (cmd: string): string =>
    execSync(`git ${cmd}`, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        // Use fixed author so commits are deterministic.
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@example.com",
        GIT_AUTHOR_DATE: "2024-01-01T00:00:00+00:00",
        GIT_COMMITTER_DATE: "2024-01-01T00:00:00+00:00",
      },
    }).trim();

  const write = (relPath: string, content: string) => {
    const full = join(dir, relPath);
    mkdirSync(full.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(full, content, "utf8");
  };

  const writeBinary = (relPath: string) => {
    const full = join(dir, relPath);
    mkdirSync(full.replace(/\/[^/]+$/, ""), { recursive: true });
    // A null byte makes git detect the file as binary.
    writeFileSync(full, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
  };

  const addAll = () => git("add -A");

  const commit = (message: string): string => {
    git(`commit --allow-empty -m "${message}"`);
    return git("rev-parse HEAD");
  };

  const branch = (name: string) => git(`checkout -b ${name}`);
  const checkout = (name: string) => git(`checkout ${name}`);

  // Init
  git("init -b main");
  git('config user.email "test@example.com"');
  git('config user.name "Test"');

  return { dir, git, write, writeBinary, addAll, commit, branch, checkout };
}

function teardown(repo: TestRepo): void {
  rmSync(repo.dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileByPath(cs: ChangeSet, path: string) {
  const f = cs.changedFiles.find((f) => f.path === path);
  if (!f) throw new Error(`File "${path}" not found in ChangeSet`);
  return f;
}

function linesOfKind(lines: readonly DiffLine[], kind: DiffLine["kind"]): DiffLine[] {
  return lines.filter((l) => l.kind === kind);
}

// ---------------------------------------------------------------------------
// Suite setup: one repo per test
// ---------------------------------------------------------------------------

let repo: TestRepo;

beforeEach(() => {
  repo = makeRepo();
});

afterEach(() => {
  teardown(repo);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestLocalGit — modified file", () => {
  it("produces a ChangeSet with correct hunks and DiffLine entries", async () => {
    // Base commit on main
    repo.write("src/auth/roles.ts", 'export const ROLE = "admin";\n');
    repo.addAll();
    repo.commit("initial");

    // Feature branch with a modification
    repo.branch("feature");
    repo.write("src/auth/roles.ts", 'export const ROLE = "owner";\n');
    repo.addAll();
    repo.commit("change role to owner");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
    });

    expect(cs.changedFiles).toHaveLength(1);
    const f = fileByPath(cs, "src/auth/roles.ts");
    expect(f.status).toBe("modified");
    expect(f.isBinary).toBe(false);
    expect(f.additions).toBe(1);
    expect(f.deletions).toBe(1);
    expect(f.hunks).toHaveLength(1);

    const hunk = f.hunks[0];
    expect(hunk.header).toMatch(/^@@/);
    expect(hunk.oldStart).toBeGreaterThan(0);
    expect(hunk.newStart).toBeGreaterThan(0);

    const added = linesOfKind(hunk.lines, "added");
    const removed = linesOfKind(hunk.lines, "removed");
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(added[0].content).toContain("owner");
    expect(removed[0].content).toContain("admin");

    // added lines have newLine, no oldLine
    expect(added[0].newLine).toBeGreaterThan(0);
    expect(added[0].oldLine).toBeUndefined();

    // removed lines have oldLine, no newLine
    expect(removed[0].oldLine).toBeGreaterThan(0);
    expect(removed[0].newLine).toBeUndefined();

    expect(cs.mergeBase).toBeDefined();
    expect(typeof cs.mergeBase).toBe("string");
    expect(cs.warnings).toHaveLength(0);
  });
});

describe("ingestLocalGit — added file", () => {
  it("reports added files with correct status and line counts", async () => {
    repo.write("existing.ts", "// base\n");
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.write("src/billing/permissions.ts", "// new billing\nexport {};\n");
    repo.addAll();
    repo.commit("add billing");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
    });

    const f = fileByPath(cs, "src/billing/permissions.ts");
    expect(f.status).toBe("added");
    expect(f.additions).toBe(2);
    expect(f.deletions).toBe(0);
    expect(f.hunks.length).toBeGreaterThan(0);

    const allLines = f.hunks.flatMap((h) => h.lines);
    const addedLines = linesOfKind(allLines, "added");
    expect(addedLines.length).toBeGreaterThan(0);
    addedLines.forEach((l) => {
      expect(l.newLine).toBeGreaterThan(0);
      expect(l.oldLine).toBeUndefined();
    });
  });
});

describe("ingestLocalGit — deleted file", () => {
  it("reports deleted files with correct status and line counts", async () => {
    repo.write("src/old-module.ts", "export const x = 1;\nexport const y = 2;\n");
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.git("rm src/old-module.ts");
    repo.commit("remove old module");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
    });

    const f = fileByPath(cs, "src/old-module.ts");
    expect(f.status).toBe("deleted");
    expect(f.deletions).toBe(2);
    expect(f.additions).toBe(0);

    const allLines = f.hunks.flatMap((h) => h.lines);
    const removedLines = linesOfKind(allLines, "removed");
    expect(removedLines.length).toBeGreaterThan(0);
    removedLines.forEach((l) => {
      expect(l.oldLine).toBeGreaterThan(0);
      expect(l.newLine).toBeUndefined();
    });
  });
});

describe("ingestLocalGit — renamed file", () => {
  it("reports renamed files with previousPath set", async () => {
    repo.write("src/auth/roles.ts", "export const ROLE = 'owner';\n");
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.git("mv src/auth/roles.ts src/auth/authorize.ts");
    repo.commit("rename roles to authorize");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
    });

    const f = fileByPath(cs, "src/auth/authorize.ts");
    expect(f.status).toBe("renamed");
    expect(f.previousPath).toBe("src/auth/roles.ts");
    expect(f.isBinary).toBe(false);
  });
});

describe("ingestLocalGit — binary file", () => {
  it("marks binary files correctly and emits BINARY_FILE_SKIPPED warning", async () => {
    repo.write("readme.txt", "base\n");
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.writeBinary("assets/logo.png");
    repo.addAll();
    repo.commit("add binary asset");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
    });

    const f = fileByPath(cs, "assets/logo.png");
    expect(f.isBinary).toBe(true);
    expect(f.hunks).toHaveLength(0);
    expect(f.additions).toBeUndefined();
    expect(f.deletions).toBeUndefined();

    const binaryWarnings = cs.warnings.filter((w) => w.code === "BINARY_FILE_SKIPPED");
    expect(binaryWarnings).toHaveLength(1);
    expect(binaryWarnings[0].filePath).toBe("assets/logo.png");
  });
});

describe("ingestLocalGit — empty diff", () => {
  it("returns an empty ChangeSet when refs have no file differences", async () => {
    repo.write("README.md", "# Hello\n");
    repo.addAll();
    const sha = repo.commit("initial");

    // Compare the same commit against itself — no changes.
    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: sha,
      headRef: sha,
    });

    expect(cs.changedFiles).toHaveLength(0);
    expect(cs.totalAdditions).toBe(0);
    expect(cs.totalDeletions).toBe(0);
    expect(cs.warnings).toHaveLength(0);
  });
});

describe("ingestLocalGit — invalid ref", () => {
  it("emits REF_NOT_FOUND warning and still returns a ChangeSet", async () => {
    repo.write("index.ts", "export {};\n");
    repo.addAll();
    repo.commit("initial");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "nonexistent-branch-xyz",
    });

    const refWarnings = cs.warnings.filter((w) => w.code === "REF_NOT_FOUND");
    expect(refWarnings.length).toBeGreaterThan(0);
    // Should still return a valid (possibly empty) ChangeSet, not throw.
    expect(cs).toBeDefined();
    expect(cs.source.kind).toBe("local-git");
  });
});

describe("ingestLocalGit — truncated diff", () => {
  it("truncates diffs exceeding maxDiffBytesPerFile and emits TRUNCATED_DIFF warning", async () => {
    // Write a file with many lines so the diff is large
    const manyLines = Array.from({ length: 200 }, (_, i) => `const line${i} = ${i};`).join("\n");
    repo.write("src/big.ts", "");
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.write("src/big.ts", manyLines);
    repo.addAll();
    repo.commit("big change");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
      maxDiffBytesPerFile: 200, // very small limit
    });

    const truncWarnings = cs.warnings.filter((w) => w.code === "TRUNCATED_DIFF");
    expect(truncWarnings.length).toBeGreaterThan(0);
    expect(truncWarnings[0].filePath).toBe("src/big.ts");
  });
});

describe("ingestLocalGit — working-tree mode", () => {
  it("diffs uncommitted changes against a base ref", async () => {
    repo.write("src/app.ts", 'const mode = "production";\n');
    repo.addAll();
    repo.commit("initial");

    // Make an uncommitted change (not staged)
    repo.write("src/app.ts", 'const mode = "development";\n');

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: WORKING_TREE,
    });

    expect(cs.source).toMatchObject({ kind: "local-git", headRef: WORKING_TREE });
    // mergeBase is undefined in working-tree mode
    expect(cs.mergeBase).toBeUndefined();

    const f = fileByPath(cs, "src/app.ts");
    expect(f.status).toBe("modified");
    const allLines = f.hunks.flatMap((h) => h.lines);
    expect(linesOfKind(allLines, "added").some((l) => l.content.includes("development"))).toBe(true);
    expect(linesOfKind(allLines, "removed").some((l) => l.content.includes("production"))).toBe(true);
  });

  it("does not emit REF_NOT_FOUND for WORKING_TREE sentinel", async () => {
    repo.write("file.ts", "export {};\n");
    repo.addAll();
    repo.commit("initial");

    repo.write("file.ts", "export const x = 1;\n");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: WORKING_TREE,
    });

    expect(cs.warnings.filter((w) => w.code === "REF_NOT_FOUND")).toHaveLength(0);
  });
});

describe("ingestLocalGit — deterministic ordering", () => {
  it("returns changed files sorted by path regardless of git order", async () => {
    repo.write("z-last.ts", "1\n");
    repo.write("a-first.ts", "1\n");
    repo.write("m-middle.ts", "1\n");
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.write("z-last.ts", "2\n");
    repo.write("a-first.ts", "2\n");
    repo.write("m-middle.ts", "2\n");
    repo.addAll();
    repo.commit("change all");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
    });

    const paths = cs.changedFiles.map((f) => f.path);
    expect(paths).toEqual([...paths].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ));
  });
});

describe("ingestLocalGit — multiple file types in one diff", () => {
  it("handles a mix of added, modified, deleted files", async () => {
    repo.write("keep.ts", "export const keep = true;\n");
    repo.write("change.ts", 'export const val = "old";\n');
    repo.write("remove.ts", "export const gone = true;\n");
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.write("keep.ts", "export const keep = true;\n"); // unchanged
    repo.write("change.ts", 'export const val = "new";\n');
    repo.git("rm remove.ts");
    repo.write("added.ts", "export const fresh = true;\n");
    repo.addAll();
    repo.commit("multi-file change");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
    });

    const statuses = Object.fromEntries(cs.changedFiles.map((f) => [f.path, f.status]));
    expect(statuses["change.ts"]).toBe("modified");
    expect(statuses["remove.ts"]).toBe("deleted");
    expect(statuses["added.ts"]).toBe("added");
    // "keep.ts" is NOT in changedFiles because it was not modified
    expect(cs.changedFiles.find((f) => f.path === "keep.ts")).toBeUndefined();
    expect(cs.warnings).toHaveLength(0);
  });
});

describe("ingestLocalGit — context lines carry both line numbers", () => {
  it("context lines have both oldLine and newLine set", async () => {
    const content = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
    repo.write("ctx.ts", content);
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    // Change only line 5 so context lines appear on both sides
    const lines = content.split("\n");
    lines[4] = "line5_changed";
    repo.write("ctx.ts", lines.join("\n"));
    repo.addAll();
    repo.commit("change line 5");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
    });

    const f = fileByPath(cs, "ctx.ts");
    const allLines = f.hunks.flatMap((h) => h.lines);
    const contextLines = linesOfKind(allLines, "context");

    expect(contextLines.length).toBeGreaterThan(0);
    for (const cl of contextLines) {
      expect(cl.oldLine).toBeGreaterThan(0);
      expect(cl.newLine).toBeGreaterThan(0);
    }
  });
});

describe("ingestChanges — convenience function", () => {
  it("is callable as ingestChanges(baseRef, headRef) and returns a ChangeSet", async () => {
    repo.write("src/api.ts", 'export const version = "1";\n');
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.write("src/api.ts", 'export const version = "2";\n');
    repo.addAll();
    repo.commit("bump version");

    // ingestChanges does NOT take repositoryPath as a positional arg,
    // so pass it via the options bag
    const cs = await ingestChanges("main", "feature", {
      repositoryPath: repo.dir,
      title: "Version bump",
    });

    expect(cs.title).toBe("Version bump");
    expect(cs.changedFiles).toHaveLength(1);
    expect(fileByPath(cs, "src/api.ts").status).toBe("modified");
  });
});

describe("ChangeSet — JSON serialization round-trip", () => {
  it("round-trips through JSON.stringify/parse preserving all fields", async () => {
    repo.write("src/auth/roles.ts", 'export const ROLE = "admin";\n');
    repo.addAll();
    repo.commit("initial");

    repo.branch("feature");
    repo.write("src/auth/roles.ts", 'export const ROLE = "owner";\n');
    repo.addAll();
    repo.commit("update role");

    const cs = await ingestLocalGit({
      repositoryPath: repo.dir,
      baseRef: "main",
      headRef: "feature",
      title: "Update role",
      summary: "Changes privileged role from admin to owner",
    });

    const restored: ChangeSet = JSON.parse(JSON.stringify(cs));

    expect(restored.id).toBe(cs.id);
    expect(restored.title).toBe(cs.title);
    expect(restored.summary).toBe(cs.summary);
    expect(restored.mergeBase).toBe(cs.mergeBase);
    expect(restored.source).toEqual(cs.source);
    expect(restored.changedFiles).toHaveLength(1);

    const hunk = restored.changedFiles[0].hunks[0];
    expect(hunk.lines.length).toBeGreaterThan(0);
    expect(hunk.lines.every((l) => ["added", "removed", "context"].includes(l.kind))).toBe(true);
  });
});
