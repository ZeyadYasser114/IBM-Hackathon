/**
 * parse.ts — low-level helpers for turning raw git output into typed models.
 * No semantic conclusions are made here; these are pure structural transforms.
 */
import type { ChangedFile, DiffHunk, DiffLine, FileStatus, IngestionWarning } from "../models/index.js";
/**
 * Maps a single git status letter (as produced by `git diff --name-status`
 * or `git status --porcelain`) to a normalised FileStatus.
 */
export declare function normaliseStatus(letter: string): FileStatus;
/**
 * Parse the individual lines of a single hunk body into typed DiffLine
 * objects, carrying exact 1-based old/new line numbers.
 *
 * Skips the hunk header line (starts with @@) and "\ No newline" notices.
 * Does NOT mutate the provided counters — callers pass in the start values
 * from the parsed header.
 */
export declare function parseHunkLines(hunkBody: string, oldStart: number, newStart: number): DiffLine[];
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
export declare function parseDiffHunks(rawDiff: string, filePath: string, warnings: IngestionWarning[]): DiffHunk[];
/**
 * Parse one line of `git diff --numstat` output.
 * Format: "<additions>\t<deletions>\t<path>"
 * Binary files are reported as "-\t-\t<path>".
 *
 * Returns null when the line does not match the expected format.
 */
export declare function parseNumstatLine(line: string): {
    additions: number | undefined;
    deletions: number | undefined;
    isBinary: boolean;
    path: string;
} | null;
/**
 * Git reports renames in `--name-status` as:
 *   R<similarity>\t<oldPath>\t<newPath>
 * This helper splits that line into its components.
 * Returns null when the line is not a rename/copy entry.
 */
export declare function parseRenamedPaths(line: string): {
    oldPath: string;
    newPath: string;
} | null;
/**
 * Sort changed files in a stable, deterministic order.
 * Primary sort: file path (locale-aware, case-insensitive).
 * This ensures ChangeSet output is identical across runs regardless of the
 * order git returns entries.
 */
export declare function sortChangedFiles<T extends {
    path: string;
}>(files: T[]): T[];
export interface RawFileData {
    path: string;
    previousPath?: string;
    statusLetter: string;
    additions?: number;
    deletions?: number;
    isBinary: boolean;
    rawDiff: string;
}
export declare function buildChangedFile(raw: RawFileData, warnings: IngestionWarning[]): ChangedFile;
//# sourceMappingURL=parse.d.ts.map