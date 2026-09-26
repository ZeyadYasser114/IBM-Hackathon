/**
 * git-provider.test.ts
 *
 * Tests for the local Git provider (providers/git.ts).
 * simple-git is fully mocked — no real Git calls are made.
 *
 * Tests cover:
 *   - ingestLocalGit: happy path, binary files, renames, missing stats,
 *     truncated diff, unknown ref warning, missing remote
 *   - compareBranches: happy path, no remote, missing merge-base
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock simple-git before importing the provider
// ---------------------------------------------------------------------------

const mockRaw = vi.fn();
const mockRemote = vi.fn();
const mockGitInstance = { raw: mockRaw, remote: mockRemote };

vi.mock("simple-git", () => ({
  default: vi.fn(() => mockGitInstance),
}));

// Also mock crypto.randomUUID so IDs are deterministic in tests
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-1234-5678-9abc-def012345678"),
}));

import { ingestLocalGit, compareBranches } from "../src/providers/git.js";

// ---------------------------------------------------------------------------
// Helpers — build git command responses
// ---------------------------------------------------------------------------

/** Build a minimal --name-status response. */
function nameStatus(entries: Array<{ letter: string; path: string; oldPath?: string }>): string {
  return entries
    .map((e) =>
      e.oldPath ? `${e.letter}\t${e.oldPath}\t${e.path}` : `${e.letter}\t${e.path}`,
    )
    .join("\n");
}

/** Build a minimal --numstat response. */
function numStat(entries: Array<{ add: string; del: string; path: string }>): string {
  return entries.map((e) => `${e.add}\t${e.del}\t${e.path}`).join("\n");
}

/**
 * Helper that sets up mockRaw to return canned responses for the specific
 * git sub-commands used by ingestLocalGit / compareBranches.
 *
 * The matcher checks the first arg of the args array passed to git.raw().
 */
function setupMocks({
  revParseBaseRef = "abc111\n",
  revParseHeadRef = "def222\n",
  mergeBase = "base-sha\n",
  nameStatusOutput = "",
  numStatOutput = "",
  fileDiffs = new Map<string, string>(),
  remoteUrl = "https://github.com/org/repo.git\n",
  symbolicRef = "origin/main\n",
  aheadCount = "2\n",
  behindCount = "0\n",
}: {
  revParseBaseRef?: string;
  revParseHeadRef?: string;
  mergeBase?: string;
  nameStatusOutput?: string;
  numStatOutput?: string;
  fileDiffs?: Map<string, string>;
  remoteUrl?: string | null;
  symbolicRef?: string | null;
  aheadCount?: string;
  behindCount?: string;
} = {}): void {
  mockRemote.mockImplementation(async (args: string[]) => {
    if (args.includes("get-url")) {
      if (remoteUrl === null) throw new Error("no remote");
      return remoteUrl;
    }
    return "";
  });

  mockRaw.mockImplementation(async (args: string[]) => {
    const cmd = args[0];

    if (cmd === "rev-parse") {
      if (args.includes("main") || args.includes("base")) return revParseBaseRef;
      return revParseHeadRef;
    }

    if (cmd === "symbolic-ref") {
      if (symbolicRef === null) throw new Error("no symbolic ref");
      return symbolicRef;
    }

    if (cmd === "merge-base") return mergeBase;

    if (cmd === "diff") {
      if (args.includes("--name-status")) return nameStatusOutput;
      if (args.includes("--numstat")) return numStatOutput;
      // per-file diff: last arg before "--" (or last arg) is the file path
      const dashDashIdx = args.indexOf("--");
      const filePath = dashDashIdx !== -1 ? args[dashDashIdx + 1] : args[args.length - 1];
      return fileDiffs.get(filePath) ?? "";
    }

    if (cmd === "rev-list") {
      if (args.includes(`main..feature`)) return aheadCount;
      if (args.includes(`feature..main`)) return behindCount;
      // generic pattern
      const countIdx = args.indexOf("--count");
      const rangeArg = args[countIdx + 1] ?? "";
      if (rangeArg.endsWith(`..${args[args.length - 1]}`)) return aheadCount;
      return aheadCount;
    }

    return "";
  });
}

// ---------------------------------------------------------------------------
// ingestLocalGit — happy path
// ---------------------------------------------------------------------------

describe("ingestLocalGit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a ChangeSet with correct metadata on the happy path", async () => {
    setupMocks({
      nameStatusOutput: nameStatus([
        { letter: "M", path: "src/auth/roles.ts" },
        { letter: "A", path: "src/billing/permissions.ts" },
      ]),
      numStatOutput: numStat([
        { add: "5", del: "2", path: "src/auth/roles.ts" },
        { add: "20", del: "0", path: "src/billing/permissions.ts" },
      ]),
      fileDiffs: new Map([
        [
          "src/auth/roles.ts",
          '@@ -10,3 +10,3 @@\n context\n-if (role === "admin")\n+if (role === "owner")',
        ],
        [
          "src/billing/permissions.ts",
          "@@ -1,0 +1,20 @@\n+// new billing module\n",
        ],
      ]),
    });

    const cs = await ingestLocalGit({
      repositoryPath: "/repo",
      baseRef: "main",
      headRef: "feature",
      title: "Org billing",
      summary: "Owner-only subscription management",
    });

    expect(cs.id).toBe("test-uuid-1234-5678-9abc-def012345678");
    expect(cs.title).toBe("Org billing");
    expect(cs.summary).toBe("Owner-only subscription management");
    expect(cs.source).toMatchObject({ kind: "local-git", baseRef: "main", headRef: "feature" });
    expect(cs.changedFiles).toHaveLength(2);
    expect(cs.totalAdditions).toBe(25);
    expect(cs.totalDeletions).toBe(2);
    expect(cs.evidenceSnippets).toEqual([]);
    expect(cs.warnings).toHaveLength(0);
    expect(cs.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets correct file statuses", async () => {
    setupMocks({
      nameStatusOutput: nameStatus([
        { letter: "A", path: "src/new.ts" },
        { letter: "D", path: "src/old.ts" },
        { letter: "M", path: "src/changed.ts" },
      ]),
      numStatOutput: numStat([
        { add: "10", del: "0", path: "src/new.ts" },
        { add: "0", del: "5", path: "src/old.ts" },
        { add: "3", del: "1", path: "src/changed.ts" },
      ]),
    });

    const cs = await ingestLocalGit({ repositoryPath: "/repo", baseRef: "main", headRef: "feature" });
    const statuses = Object.fromEntries(cs.changedFiles.map((f) => [f.path, f.status]));
    expect(statuses["src/new.ts"]).toBe("added");
    expect(statuses["src/old.ts"]).toBe("deleted");
    expect(statuses["src/changed.ts"]).toBe("modified");
  });

  it("handles renamed files correctly", async () => {
    setupMocks({
      nameStatusOutput: nameStatus([
        { letter: "R100", path: "src/auth/authorize.ts", oldPath: "src/auth/roles.ts" },
      ]),
      numStatOutput: numStat([
        { add: "0", del: "0", path: "src/auth/authorize.ts" },
      ]),
    });

    const cs = await ingestLocalGit({ repositoryPath: "/repo", baseRef: "main", headRef: "feature" });
    expect(cs.changedFiles).toHaveLength(1);
    const f = cs.changedFiles[0];
    expect(f.status).toBe("renamed");
    expect(f.path).toBe("src/auth/authorize.ts");
    expect(f.previousPath).toBe("src/auth/roles.ts");
  });

  it("marks binary files and emits BINARY_FILE_SKIPPED warning", async () => {
    setupMocks({
      nameStatusOutput: nameStatus([{ letter: "A", path: "assets/logo.png" }]),
      numStatOutput: "-\t-\tassets/logo.png",
    });

    const cs = await ingestLocalGit({ repositoryPath: "/repo", baseRef: "main", headRef: "feature" });
    const f = cs.changedFiles[0];
    expect(f.isBinary).toBe(true);
    expect(f.hunks).toHaveLength(0);
    expect(cs.warnings.some((w) => w.code === "BINARY_FILE_SKIPPED")).toBe(true);
  });

  it("emits REF_NOT_FOUND warning when a ref cannot be resolved", async () => {
    setupMocks({
      revParseHeadRef: undefined as unknown as string,
    });
    // Make rev-parse throw for the head ref only
    mockRaw.mockImplementation(async (args: string[]) => {
      if (args[0] === "rev-parse" && args.includes("bad-ref")) {
        throw new Error("unknown revision");
      }
      return "";
    });

    const cs = await ingestLocalGit({ repositoryPath: "/repo", baseRef: "main", headRef: "bad-ref" });
    expect(cs.warnings.some((w) => w.code === "REF_NOT_FOUND")).toBe(true);
  });

  it("truncates oversized diffs and emits TRUNCATED_DIFF warning", async () => {
    const largeDiff = "@@ -1,2 +1,3 @@\n" + "x".repeat(600);
    setupMocks({
      nameStatusOutput: nameStatus([{ letter: "M", path: "src/big.ts" }]),
      numStatOutput: numStat([{ add: "1", del: "0", path: "src/big.ts" }]),
      fileDiffs: new Map([["src/big.ts", largeDiff]]),
    });

    const cs = await ingestLocalGit({
      repositoryPath: "/repo",
      baseRef: "main",
      headRef: "feature",
      maxDiffBytesPerFile: 100,
    });

    expect(cs.warnings.some((w) => w.code === "TRUNCATED_DIFF")).toBe(true);
  });

  it("handles repository with no remote gracefully", async () => {
    setupMocks({ remoteUrl: null, symbolicRef: null });

    const cs = await ingestLocalGit({ repositoryPath: "/repo", baseRef: "main", headRef: "feature" });
    expect(cs.repository.remoteUrl).toBeUndefined();
    expect(cs.repository.defaultBranch).toBeUndefined();
    expect(typeof cs.repository.name).toBe("string");
  });

  it("produces empty changedFiles and zero totals when no files differ", async () => {
    setupMocks({ nameStatusOutput: "", numStatOutput: "" });

    const cs = await ingestLocalGit({ repositoryPath: "/repo", baseRef: "main", headRef: "feature" });
    expect(cs.changedFiles).toHaveLength(0);
    expect(cs.totalAdditions).toBe(0);
    expect(cs.totalDeletions).toBe(0);
  });

  it("serializes to JSON and back preserving all fields", async () => {
    setupMocks({
      nameStatusOutput: nameStatus([{ letter: "M", path: "src/auth/roles.ts" }]),
      numStatOutput: numStat([{ add: "3", del: "1", path: "src/auth/roles.ts" }]),
      fileDiffs: new Map([
        ["src/auth/roles.ts", '@@ -5,3 +5,3 @@\n ctx\n-old\n+new'],
      ]),
    });

    const cs = await ingestLocalGit({ repositoryPath: "/repo", baseRef: "main", headRef: "feature" });
    const restored = JSON.parse(JSON.stringify(cs));
    expect(restored.id).toBe(cs.id);
    expect(restored.changedFiles[0].hunks[0].oldStart).toBe(5);
    expect(restored.source.kind).toBe("local-git");
  });
});

// ---------------------------------------------------------------------------
// compareBranches
// ---------------------------------------------------------------------------

describe("compareBranches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a BranchComparison with all fields on happy path", async () => {
    setupMocks({
      mergeBase: "sha-merge-base\n",
      aheadCount: "3\n",
      behindCount: "1\n",
    });

    const bc = await compareBranches("/repo", "main", "feature");
    expect(bc.baseRef).toBe("main");
    expect(bc.headRef).toBe("feature");
    expect(bc.mergeBase).toBe("sha-merge-base");
    expect(typeof bc.aheadBy).toBe("number");
    expect(typeof bc.behindBy).toBe("number");
    expect(bc.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns undefined mergeBase when refs share no common ancestor", async () => {
    setupMocks({ mergeBase: "" });
    // Also make merge-base throw to simulate no common ancestor
    mockRaw.mockImplementation(async (args: string[]) => {
      if (args[0] === "merge-base") throw new Error("no common ancestor");
      if (args[0] === "rev-list") return "0\n";
      return "";
    });
    mockRemote.mockResolvedValue("https://github.com/org/repo.git");

    const bc = await compareBranches("/repo", "main", "orphan-branch");
    expect(bc.mergeBase).toBeUndefined();
  });

  it("has undefined aheadBy/behindBy when rev-list fails", async () => {
    setupMocks();
    mockRaw.mockImplementation(async (args: string[]) => {
      if (args[0] === "rev-list") throw new Error("bad ref");
      if (args[0] === "merge-base") return "sha\n";
      if (args[0] === "symbolic-ref") return "origin/main\n";
      return "";
    });
    mockRemote.mockResolvedValue("https://github.com/org/repo.git\n");

    const bc = await compareBranches("/repo", "main", "feature");
    expect(bc.aheadBy).toBeUndefined();
    expect(bc.behindBy).toBeUndefined();
  });

  it("serializes to JSON and back", async () => {
    setupMocks();
    const bc = await compareBranches("/repo", "main", "feature");
    expect(JSON.parse(JSON.stringify(bc))).toEqual(bc);
  });
});
