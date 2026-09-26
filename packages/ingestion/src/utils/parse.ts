/**
 * parse.ts — low-level helpers for turning raw git output into typed models.
 * No semantic conclusions are made here; these are pure structural transforms.
 */

import type {
  ChangedFile,
  DiffHunk,
  DiffLine,
  FileStatus,
  IngestionWarning,
} from "../models/index.js";

// ---------------------------------------------------------------------------
// FileStatus normalisation
// ---------------------------------------------------------------------------

/**
 * Maps a single git status letter (as produced by `git diff --name-status`
 * or `git status --porcelain`) to a normalised FileStatus.
 */
export function normaliseStatus(letter: string): FileStatus {
  switch (letter.toUpperCase()[0]) {
    case "A": return "added";
    case "M": return "modified";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    default:  return "unknown";
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
export function parseHunkLines(
  hunkBody: string,
  oldStart: number,
  newStart: number,
): DiffLine[] {
  if (!hunkBody) return [];

  const lines: DiffLine[] = [];
  let oldCursor = oldStart;
  let newCursor = newStart;

  for (const raw of hunkBody.split("\n")) {
    // Skip the @@ header line and "\ No newline at end of file" notices.
    if (raw.startsWith("@@") || raw.startsWith("\\ No newline")) continue;

    if (raw.startsWith("+")) {
      lines.push({ kind: "added", content: raw.slice(1), newLine: newCursor });
      newCursor++;
    } else if (raw.startsWith("-")) {
      lines.push({ kind: "removed", content: raw.slice(1), oldLine: oldCursor });
      oldCursor++;
    } else if (raw.startsWith(" ")) {
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
export function parseDiffHunks(
  rawDiff: string,
  filePath: string,
  warnings: IngestionWarning[],
): DiffHunk[] {
  if (!rawDiff || !rawDiff.trim()) return [];

  const hunks: DiffHunk[] = [];
  // Split on hunk headers but keep the header in each segment.
  const segments = rawDiff.split(/(?=^@@[ \t])/m);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed || !trimmed.startsWith("@@")) continue;

    // Match:  @@ -oldStart[,oldLines] +newStart[,newLines] @@
    const headerMatch = trimmed.match(
      /^(@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*)/,
    );
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
export function parseNumstatLine(
  line: string,
): { additions: number | undefined; deletions: number | undefined; isBinary: boolean; path: string } | null {
  const parts = line.split("\t");
  if (parts.length < 3) return null;

  const [addRaw, delRaw, ...pathParts] = parts;
  const path = pathParts.join("\t"); // handles tabs in paths (rare but valid)

  const isBinary = addRaw === "-" && delRaw === "-";

  const parseCount = (raw: string): number | undefined => {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  return {
    additions: isBinary ? undefined : parseCount(addRaw),
    deletions: isBinary ? undefined : parseCount(delRaw),
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
export function parseRenamedPaths(
  line: string,
): { oldPath: string; newPath: string } | null {
  const parts = line.split("\t");
  if (parts.length < 3) return null;
  const firstPart = parts[0];
  if (!firstPart) return null;                          // guard empty segment
  const letter = firstPart[0].toUpperCase();
  if (letter !== "R" && letter !== "C") return null;
  // Require non-empty old and new paths.
  if (!parts[1] || !parts[2]) return null;
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
export function sortChangedFiles<T extends { path: string }>(files: T[]): T[] {
  return [...files].sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { sensitivity: "base" }),
  );
}

// ---------------------------------------------------------------------------
// Build ChangedFile from collected data
// ---------------------------------------------------------------------------

export interface RawFileData {
  path: string;
  previousPath?: string;
  statusLetter: string;
  additions?: number;
  deletions?: number;
  isBinary: boolean;
  rawDiff: string;
}

export function buildChangedFile(
  raw: RawFileData,
  warnings: IngestionWarning[],
): ChangedFile {
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
