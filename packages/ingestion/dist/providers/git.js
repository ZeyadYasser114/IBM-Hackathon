"use strict";
/**
 * git.ts — local Git provider
 *
 * Calls the real Git binary via simple-git to produce a ChangeSet.
 * All Git-specific logic is isolated here; downstream code depends only on
 * the types in models/index.ts and the public API in src/index.ts.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKING_TREE = void 0;
exports.ingestLocalGit = ingestLocalGit;
exports.ingestChanges = ingestChanges;
exports.compareBranches = compareBranches;
const node_crypto_1 = require("node:crypto");
const simple_git_1 = __importDefault(require("simple-git"));
const parse_js_1 = require("../utils/parse.js");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Sentinel value for headRef.
 * When passed as headRef, the provider diffs the working tree (staged +
 * unstaged) against the given baseRef instead of comparing two commits.
 */
exports.WORKING_TREE = "WORKING_TREE";
const DEFAULT_MAX_DIFF_BYTES = 500000;
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Resolve the human-readable repository name from the remote URL or the
 * directory basename.
 */
async function resolveRepoDescriptor(git, repositoryPath) {
    let remoteUrl;
    let defaultBranch;
    let name;
    try {
        const raw = await git.remote(["get-url", "origin"]);
        remoteUrl = raw ? raw.trim() || undefined : undefined;
    }
    catch {
        // No remote — that is fine for local repos.
    }
    try {
        const symbolic = (await git.raw(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).trim();
        // e.g. "origin/main" → "main"
        defaultBranch = symbolic.replace(/^origin\//, "") || undefined;
    }
    catch {
        // HEAD not set or no remote — ignore.
    }
    if (remoteUrl) {
        // Extract "<owner>/<repo>" or just "<repo>" from the URL.
        const match = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
        name = match ? match[1] : remoteUrl;
    }
    else {
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
async function collectNumstat(git, base, head, isWorkingTree) {
    const result = new Map();
    try {
        const args = isWorkingTree
            ? ["diff", "--numstat", base]
            : ["diff", "--numstat", `${base}...${head}`];
        const raw = await git.raw(args);
        for (const line of raw.split("\n")) {
            const parsed = (0, parse_js_1.parseNumstatLine)(line);
            if (parsed)
                result.set(parsed.path, parsed);
        }
    }
    catch {
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
async function collectNameStatus(git, base, head, isWorkingTree) {
    const entries = [];
    try {
        const args = isWorkingTree
            ? ["diff", "--name-status", base]
            : ["diff", "--name-status", `${base}...${head}`];
        const raw = await git.raw(args);
        for (const line of raw.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            const renamed = (0, parse_js_1.parseRenamedPaths)(trimmed);
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
    }
    catch {
        // Swallow — invalid refs are already reported as REF_NOT_FOUND warnings.
    }
    return entries;
}
/**
 * Fetch the unified diff for a single file path.
 * Returns an empty string on error and records a warning.
 */
async function fetchFileDiff(git, base, head, isWorkingTree, filePath, maxBytes, warnings) {
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
    }
    catch (err) {
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
async function ingestLocalGit(options) {
    const repositoryPath = options.repositoryPath ?? process.cwd();
    const maxBytes = options.maxDiffBytesPerFile ?? DEFAULT_MAX_DIFF_BYTES;
    const { baseRef, headRef } = options;
    const isWorkingTree = headRef === exports.WORKING_TREE;
    const git = (0, simple_git_1.default)(repositoryPath);
    const warnings = [];
    // Verify refs exist before doing heavier work.
    // For working-tree mode only validate baseRef (headRef is a sentinel).
    const refsToVerify = isWorkingTree ? [baseRef] : [baseRef, headRef];
    for (const ref of refsToVerify) {
        try {
            await git.raw(["rev-parse", "--verify", ref]);
        }
        catch {
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
    const [repository, mergeBase, nameStatusEntries, numstatMap] = await Promise.all([
        resolveRepoDescriptor(git, repositoryPath),
        mergeBasePromise,
        collectNameStatus(git, baseRef, headRef, isWorkingTree),
        collectNumstat(git, baseRef, headRef, isWorkingTree),
    ]);
    // Build one ChangedFile per entry, fetching per-file diffs in parallel.
    const unsortedFiles = await Promise.all(nameStatusEntries.map(async (entry) => {
        const stat = numstatMap.get(entry.path);
        const isBinary = stat?.isBinary ?? false;
        const rawDiff = isBinary
            ? ""
            : await fetchFileDiff(git, baseRef, headRef, isWorkingTree, entry.path, maxBytes, warnings);
        const raw = {
            path: entry.path,
            previousPath: entry.previousPath,
            statusLetter: entry.statusLetter,
            additions: stat?.additions,
            deletions: stat?.deletions,
            isBinary,
            rawDiff,
        };
        return (0, parse_js_1.buildChangedFile)(raw, warnings);
    }));
    // Sort deterministically so downstream consumers get a stable order.
    const changedFiles = (0, parse_js_1.sortChangedFiles)(unsortedFiles);
    const totalAdditions = changedFiles.reduce((s, f) => s + (f.additions ?? 0), 0);
    const totalDeletions = changedFiles.reduce((s, f) => s + (f.deletions ?? 0), 0);
    const source = {
        kind: "local-git",
        repositoryPath,
        baseRef,
        headRef,
    };
    const changeSet = {
        id: (0, node_crypto_1.randomUUID)(),
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
async function ingestChanges(baseRef, headRef, options) {
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
async function compareBranches(repositoryPath, baseRef, headRef) {
    const git = (0, simple_git_1.default)(repositoryPath);
    const repository = await resolveRepoDescriptor(git, repositoryPath);
    const mergeBase = await git
        .raw(["merge-base", baseRef, headRef])
        .then((s) => s.trim() || undefined)
        .catch(() => undefined);
    // Count commits ahead/behind using rev-list.
    let aheadBy;
    let behindBy;
    try {
        const ahead = await git.raw(["rev-list", "--count", `${baseRef}..${headRef}`]);
        const behind = await git.raw(["rev-list", "--count", `${headRef}..${baseRef}`]);
        aheadBy = parseInt(ahead.trim(), 10);
        behindBy = parseInt(behind.trim(), 10);
    }
    catch {
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
//# sourceMappingURL=git.js.map