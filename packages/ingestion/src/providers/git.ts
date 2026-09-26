/**
 * git.ts — local Git provider
 *
 * Calls the real Git binary via simple-git to produce a ChangeSet.
 * All Git-specific logic is isolated here; downstream code depends only on
 * the types in models/index.ts and the public API in src/index.ts.
 */

import { randomUUID } from "node:crypto";
import simpleGit, { type SimpleGit } from "simple-git";
import type {
  BranchComparison,
  ChangeSet,
  IngestionWarning,
  LocalGitSource,
  RepositoryDescriptor,
} from "../models/index.js";
import {
  buildChangedFile,
  parseNumstatLine,
  parseRenamedPaths,
  sortChangedFiles,
  type RawFileData,
} from "../utils/parse.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sentinel value for headRef.
 * When passed as headRef, the provider diffs the working tree (staged +
 * unstaged) against the given baseRef instead of comparing two commits.
 */
export const WORKING_TREE = "WORKING_TREE" as const;

const DEFAULT_MAX_DIFF_BYTES = 500_000;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface LocalGitIngestionOptions {
  /**
   * Absolute path to the repository root.
   * Defaults to process.cwd() when omitted.
   */
  repositoryPath?: string;
  /**
   * The base ref (branch, tag, or commit SHA) to compare against.
   * Example: "main"
   */
  baseRef: string;
  /**
   * The head ref to compare.
   * Pass the exported WORKING_TREE constant to diff the working tree
   * (staged + unstaged changes) against baseRef.
   * Example: "feature/org-billing" or WORKING_TREE
   */
  headRef: string;
  /**
   * Optional human-readable title for the change.
   * Example: "Add organization billing"
   */
  title?: string;
  /**
   * Optional human-readable summary.
   * Must NOT be a semantic conclusion — use it for caller-supplied
   * descriptions (PR title, task description, etc.).
   */
  summary?: string;
  /**
   * Maximum number of bytes to capture per file diff.
   * Prevents runaway memory usage on very large diffs.
   * Defaults to 500_000.
   */
  maxDiffBytesPerFile?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the human-readable repository name from the remote URL or the
 * directory basename.
 */
async function resolveRepoDescriptor(
  git: SimpleGit,
  repositoryPath: string,
): Promise<RepositoryDescriptor> {
  let remoteUrl: string | undefined;
  let defaultBranch: string | undefined;
  let name: string;

  try {
    const raw = await git.remote(["get-url", "origin"]);
    remoteUrl = raw ? raw.trim() || undefined : undefined;
  } catch {
    // No remote — that is fine for local repos.
  }

  try {
    const symbolic = (
      await git.raw(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
    ).trim();
    // e.g. "origin/main" → "main"
    defaultBranch = symbolic.replace(/^origin\//, "") || undefined;
  } catch {
    // HEAD not set or no remote — ignore.
  }

  if (remoteUrl) {
    // Extract "<owner>/<repo>" or just "<repo>" from the URL.
    const match = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    name = match ? match[1] : remoteUrl;
  } else {
    name = repositoryPath.split("/").filter(Boolean).pop() ?? "unknown";
  }

  return { name, remoteUrl, defaultBranch };
}

/**
 * Collect raw per-file stats from `git diff --numstat`.
 * Returns a map of path → { additions, deletions, isBinary }.
 *
 * When isWorkingTree is true, omit the head ref so git compares the
 * working tree (staged + unstaged) against base.
 */
async function collectNumstat(
  git: SimpleGit,
  base: string,
  head: string,
  isWorkingTree: boolean,
): Promise<Map<string, { additions?: number; deletions?: number; isBinary: boolean }>> {
  const result = new Map<string, { additions?: number; deletions?: number; isBinary: boolean }>();
  try {
    const args = isWorkingTree
      ? ["diff", "--numstat", base]
      : ["diff", "--numstat", `${base}...${head}`];
    const raw = await git.raw(args);
    for (const line of raw.split("\n")) {
      const parsed = parseNumstatLine(line);
      if (parsed) result.set(parsed.path, parsed);
    }
  } catch {
    // Swallow — invalid refs are already reported as REF_NOT_FOUND warnings.
  }
  return result;
}

/**
 * Collect name-status lines to get the list of changed paths and their
 * status letters (A/M/D/R/C/…).
 *
 * When isWorkingTree is true, omit the head ref so git compares the
 * working tree against base.
 */
async function collectNameStatus(
  git: SimpleGit,
  base: string,
  head: string,
  isWorkingTree: boolean,
): Promise<Array<{ statusLetter: string; path: string; previousPath?: string }>> {
  const entries: Array<{ statusLetter: string; path: string; previousPath?: string }> = [];
  try {
    const args = isWorkingTree
      ? ["diff", "--name-status", base]
      : ["diff", "--name-status", `${base}...${head}`];
    const raw = await git.raw(args);

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const renamed = parseRenamedPaths(trimmed);
      if (renamed) {
        entries.push({
          statusLetter: trimmed[0],
          path: renamed.newPath,
          previousPath: renamed.oldPath,
        });
        continue;
      }

      const parts = trimmed.split("\t");
      if (parts.length >= 2) {
        entries.push({ statusLetter: parts[0], path: parts[1] });
      }
    }
  } catch {
    // Swallow — invalid refs are already reported as REF_NOT_FOUND warnings.
  }

  return entries;
}

/**
 * Fetch the unified diff for a single file path.
 * Returns an empty string on error and records a warning.
 */
async function fetchFileDiff(
  git: SimpleGit,
  base: string,
  head: string,
  isWorkingTree: boolean,
  filePath: string,
  maxBytes: number,
  warnings: IngestionWarning[],
): Promise<string> {
  try {
    const args = isWorkingTree
      ? ["diff", "--unified=3", base, "--", filePath]
      : ["diff", "--unified=3", `${base}...${head}`, "--", filePath];

    const raw = await git.raw(args);
    if (raw.length > maxBytes) {
      warnings.push({
        code: "TRUNCATED_DIFF",
        message: `Diff for "${filePath}" exceeded ${maxBytes} bytes and was truncated.`,
        filePath,
      });
      return raw.slice(0, maxBytes);
    }
    return raw;
  } catch (err) {
    warnings.push({
      code: "DIFF_PARSE_ERROR",
      message: `Failed to retrieve diff for "${filePath}": ${String(err)}`,
      filePath,
    });
    return "";
  }
}

// ---------------------------------------------------------------------------
// Public provider function
// ---------------------------------------------------------------------------

/**
 * Ingest a local Git comparison and return a fully populated ChangeSet.
 *
 * Two modes:
 * - **Ref-to-ref** (default): uses three-dot notation (`base...head`) so the
 *   comparison is always relative to the common merge-base, matching PR semantics.
 * - **Working-tree**: pass `headRef: WORKING_TREE` to compare staged + unstaged
 *   changes against baseRef. mergeBase will be undefined in this mode.
 *
 * Output file order is deterministic (sorted by path) regardless of the order
 * git returns entries.
 */
export async function ingestLocalGit(
  options: LocalGitIngestionOptions,
): Promise<ChangeSet> {
  const repositoryPath = options.repositoryPath ?? process.cwd();
  const maxBytes = options.maxDiffBytesPerFile ?? DEFAULT_MAX_DIFF_BYTES;
  const { baseRef, headRef } = options;
  const isWorkingTree = headRef === WORKING_TREE;

  const git: SimpleGit = simpleGit(repositoryPath);
  const warnings: IngestionWarning[] = [];

  // Verify refs exist before doing heavier work.
  // For working-tree mode only validate baseRef (headRef is a sentinel).
  const refsToVerify = isWorkingTree ? [baseRef] : [baseRef, headRef];
  for (const ref of refsToVerify) {
    try {
      await git.raw(["rev-parse", "--verify", ref]);
    } catch {
      warnings.push({
        code: "REF_NOT_FOUND",
        message: `Ref "${ref}" could not be resolved in the repository at "${repositoryPath}".`,
      });
    }
  }

  // Resolve merge-base only for ref-to-ref comparisons.
  const mergeBasePromise = isWorkingTree
    ? Promise.resolve(undefined)
    : git.raw(["merge-base", baseRef, headRef])
        .then((s) => s.trim() || undefined)
        .catch(() => undefined);

  const [repository, mergeBase, nameStatusEntries, numstatMap] =
    await Promise.all([
      resolveRepoDescriptor(git, repositoryPath),
      mergeBasePromise,
      collectNameStatus(git, baseRef, headRef, isWorkingTree),
      collectNumstat(git, baseRef, headRef, isWorkingTree),
    ]);

  // Build one ChangedFile per entry, fetching per-file diffs in parallel.
  const unsortedFiles = await Promise.all(
    nameStatusEntries.map(async (entry) => {
      const stat = numstatMap.get(entry.path);
      const isBinary = stat?.isBinary ?? false;

      const rawDiff = isBinary
        ? ""
        : await fetchFileDiff(
            git,
            baseRef,
            headRef,
            isWorkingTree,
            entry.path,
            maxBytes,
            warnings,
          );

      const raw: RawFileData = {
        path: entry.path,
        previousPath: entry.previousPath,
        statusLetter: entry.statusLetter,
        additions: stat?.additions,
        deletions: stat?.deletions,
        isBinary,
        rawDiff,
      };

      return buildChangedFile(raw, warnings);
    }),
  );

  // Sort deterministically so downstream consumers get a stable order.
  const changedFiles = sortChangedFiles(unsortedFiles);

  const totalAdditions = changedFiles.reduce((s, f) => s + (f.additions ?? 0), 0);
  const totalDeletions = changedFiles.reduce((s, f) => s + (f.deletions ?? 0), 0);

  const source: LocalGitSource = {
    kind: "local-git",
    repositoryPath,
    baseRef,
    headRef,
  };

  const changeSet: ChangeSet = {
    id: randomUUID(),
    title: options.title,
    summary: options.summary,
    source,
    repository,
    mergeBase,
    changedFiles,
    totalAdditions,
    totalDeletions,
    evidenceSnippets: [],
    warnings,
    capturedAt: new Date().toISOString(),
  };

  return changeSet;
}

// ---------------------------------------------------------------------------
// ingestChanges — simple convenience entry point
// ---------------------------------------------------------------------------

/**
 * Simplified entry point that Omar (and other callers) can use directly.
 *
 * Defaults to process.cwd() as the repository path.
 *
 * ```ts
 * const changeSet = await ingestChanges("main", "feature/billing");
 * // or to inspect working-tree changes:
 * const changeSet = await ingestChanges("main", WORKING_TREE);
 * ```
 */
export async function ingestChanges(
  baseRef: string,
  headRef: string,
  options?: Omit<LocalGitIngestionOptions, "baseRef" | "headRef">,
): Promise<ChangeSet> {
  return ingestLocalGit({ ...options, baseRef, headRef });
}

// ---------------------------------------------------------------------------
// BranchComparison (cheap pre-flight — no diff)
// ---------------------------------------------------------------------------

/**
 * Produce a lightweight BranchComparison without loading full diff data.
 * Useful for UI summaries and pre-flight checks before committing to a full
 * ingestLocalGit call.
 */
export async function compareBranches(
  repositoryPath: string,
  baseRef: string,
  headRef: string,
): Promise<BranchComparison> {
  const git: SimpleGit = simpleGit(repositoryPath);
  const repository = await resolveRepoDescriptor(git, repositoryPath);

  const mergeBase = await git
    .raw(["merge-base", baseRef, headRef])
    .then((s) => s.trim() || undefined)
    .catch(() => undefined);

  // Count commits ahead/behind using rev-list.
  let aheadBy: number | undefined;
  let behindBy: number | undefined;
  try {
    const ahead = await git.raw(["rev-list", "--count", `${baseRef}..${headRef}`]);
    const behind = await git.raw(["rev-list", "--count", `${headRef}..${baseRef}`]);
    aheadBy = parseInt(ahead.trim(), 10);
    behindBy = parseInt(behind.trim(), 10);
  } catch {
    // Non-fatal — counts remain undefined.
  }

  return {
    repository,
    baseRef,
    headRef,
    mergeBase,
    aheadBy,
    behindBy,
    capturedAt: new Date().toISOString(),
  };
}
