"use strict";
/**
 * parse.ts — low-level helpers for turning raw git output into typed models.
 * No semantic conclusions are made here; these are pure structural transforms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normaliseStatus = normaliseStatus;
exports.parseHunkLines = parseHunkLines;
exports.parseDiffHunks = parseDiffHunks;
exports.parseNumstatLine = parseNumstatLine;
exports.parseRenamedPaths = parseRenamedPaths;
exports.sortChangedFiles = sortChangedFiles;
exports.buildChangedFile = buildChangedFile;
// ---------------------------------------------------------------------------
// FileStatus normalisation
// ---------------------------------------------------------------------------
/**
 * Maps a single git status letter (as produced by `git diff --name-status`
 * or `git status --porcelain`) to a normalised FileStatus.
 */
function normaliseStatus(letter) {
    switch (letter.toUpperCase()[0]) {
        case "A": return "added";
        case "M": return "modified";
        case "D": return "deleted";
        case "R": return "renamed";
        case "C": return "copied";
        default: return "unknown";
    }
}
// ---------------------------------------------------------------------------
// DiffLine parsing
// ---------------------------------------------------------------------------
/**
 * Parse the individual lines of a single hunk body into typed DiffLine
 * objects, carrying exact 1-based old/new line numbers.
 *
 * Skips the hunk header line (starts with @@) and "\ No newline" notices.
 * Does NOT mutate the provided counters — callers pass in the start values
 * from the parsed header.
 */
function parseHunkLines(hunkBody, oldStart, newStart) {
    if (!hunkBody)
        return [];
    const lines = [];
    let oldCursor = oldStart;
    let newCursor = newStart;
    for (const raw of hunkBody.split("\n")) {
        // Skip the @@ header line and "\ No newline at end of file" notices.
        if (raw.startsWith("@@") || raw.startsWith("\\ No newline"))
            continue;
        if (raw.startsWith("+")) {
            lines.push({ kind: "added", content: raw.slice(1), newLine: newCursor });
            newCursor++;
        }
        else if (raw.startsWith("-")) {
            lines.push({ kind: "removed", content: raw.slice(1), oldLine: oldCursor });
            oldCursor++;
        }
        else if (raw.startsWith(" ")) {
            // Context line: leading space present.
            lines.push({
                kind: "context",
                content: raw.slice(1),
                oldLine: oldCursor,
                newLine: newCursor,
            });
            oldCursor++;
            newCursor++;
        }
        // Trailing empty lines at the end of the hunk body are silently skipped.
    }
    return lines;
}
// ---------------------------------------------------------------------------
// Unified diff hunk parsing
// ---------------------------------------------------------------------------
/**
 * Parse the output of `git diff --unified=3` for a single file into an array
 * of DiffHunks, each containing fully typed DiffLine entries.
 *
 * Handles the standard unified-diff hunk header:
 *   @@ -oldStart,oldLines +newStart,newLines @@ optional context
 *
 * Returns an empty array when rawDiff is empty or contains no hunk headers.
 * Appends a warning entry (mutating the provided array) when a header cannot
 * be parsed so the caller can surface it without aborting.
 */
function parseDiffHunks(rawDiff, filePath, warnings) {
    if (!rawDiff || !rawDiff.trim())
        return [];
    const hunks = [];
    // Split on hunk headers but keep the header in each segment.
    const segments = rawDiff.split(/(?=^@@[ \t])/m);
    for (const segment of segments) {
        const trimmed = segment.trim();
        if (!trimmed || !trimmed.startsWith("@@"))
            continue;
        // Match:  @@ -oldStart[,oldLines] +newStart[,newLines] @@
        const headerMatch = trimmed.match(/^(@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*)/);
        if (!headerMatch) {
            warnings.push({
                code: "DIFF_PARSE_ERROR",
                message: `Could not parse hunk header in diff for "${filePath}": ${trimmed.slice(0, 80)}`,
                filePath,
            });
            continue;
        }
        const [, header, oldStartStr, oldLinesRaw, newStartStr, newLinesRaw] = headerMatch;
        const oldStart = parseInt(oldStartStr, 10);
        const newStart = parseInt(newStartStr, 10);
        const oldLines = oldLinesRaw !== undefined ? parseInt(oldLinesRaw, 10) : 1;
        const newLines = newLinesRaw !== undefined ? parseInt(newLinesRaw, 10) : 1;
        const lines = parseHunkLines(trimmed, oldStart, newStart);
        hunks.push({
            header,
            oldStart,
            oldLines,
            newStart,
            newLines,
            body: trimmed,
            lines,
        });
    }
    return hunks;
}
// ---------------------------------------------------------------------------
// Stat parsing  (output of `git diff --numstat`)
// ---------------------------------------------------------------------------
/**
 * Parse one line of `git diff --numstat` output.
 * Format: "<additions>\t<deletions>\t<path>"
 * Binary files are reported as "-\t-\t<path>".
 *
 * Returns null when the line does not match the expected format.
 */
function parseNumstatLine(line) {
    const parts = line.split("\t");
    if (parts.length < 3)
        return null;
    const [addRaw, delRaw, ...pathParts] = parts;
    const path = pathParts.join("\t"); // handles tabs in paths (rare but valid)
    const isBinary = addRaw === "-" && delRaw === "-";
    return {
        additions: isBinary ? undefined : parseInt(addRaw, 10),
        deletions: isBinary ? undefined : parseInt(delRaw, 10),
        isBinary,
        path,
    };
}
// ---------------------------------------------------------------------------
// Renamed-path extraction
// ---------------------------------------------------------------------------
/**
 * Git reports renames in `--name-status` as:
 *   R<similarity>\t<oldPath>\t<newPath>
 * This helper splits that line into its components.
 * Returns null when the line is not a rename/copy entry.
 */
function parseRenamedPaths(line) {
    const parts = line.split("\t");
    if (parts.length < 3)
        return null;
    const letter = parts[0][0].toUpperCase();
    if (letter !== "R" && letter !== "C")
        return null;
    return { oldPath: parts[1], newPath: parts[2] };
}
// ---------------------------------------------------------------------------
// Deterministic ordering
// ---------------------------------------------------------------------------
/**
 * Sort changed files in a stable, deterministic order.
 * Primary sort: file path (locale-aware, case-insensitive).
 * This ensures ChangeSet output is identical across runs regardless of the
 * order git returns entries.
 */
function sortChangedFiles(files) {
    return [...files].sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
}
function buildChangedFile(raw, warnings) {
    const status = normaliseStatus(raw.statusLetter);
    const hunks = raw.isBinary
        ? []
        : parseDiffHunks(raw.rawDiff, raw.path, warnings);
    if (raw.isBinary) {
        warnings.push({
            code: "BINARY_FILE_SKIPPED",
            message: `Binary file "${raw.path}" — diff content not available.`,
            filePath: raw.path,
        });
    }
    return {
        path: raw.path,
        previousPath: raw.previousPath,
        status,
        additions: raw.additions,
        deletions: raw.deletions,
        isBinary: raw.isBinary,
        hunks,
    };
}
//# sourceMappingURL=parse.js.map