/**
 * evidence-builder.ts
 *
 * Converts a `ParsedFile` (structural diff output) into a list of `CodeEvidence`
 * records that analysis agents can cite.
 *
 * Rules:
 *   - Each changed hunk becomes one FILE_CHANGE evidence record.
 *   - The evidence source is always FILE_CHANGE — this layer is deterministic;
 *     it makes no AI inferences.
 *   - Line numbers are taken directly from the hunk header (1-based, head file).
 *   - snippet is the first ≤5 changed lines from the hunk (added + removed),
 *     trimmed so it fits the CodeEvidence contract.
 *   - Binary files produce a single evidence record with null lines/snippet.
 *   - Pure renames with no content change produce one evidence record with
 *     null lines/snippet documenting the rename.
 *   - metadata always records: changeKind, hunkIndex, additions, deletions,
 *     and (for renames) previousPath.
 */

import type { CodeEvidence } from '@mergemind/domain';
import { EvidenceSource } from '@mergemind/domain';
import type { ParsedFile, DiffHunk } from './diff-parser.js';

// Maximum lines of diff content to include in a snippet
const MAX_SNIPPET_LINES = 5;

/**
 * Build CodeEvidence records for a single parsed file.
 *
 * @param file        The parsed file from the diff parser
 * @param branchName  The feature branch this file was changed on
 * @returns           One record per hunk (or one record for binary/rename-only)
 */
export function buildEvidenceForFile(file: ParsedFile, branchName: string): CodeEvidence[] {
  // --- Binary file ---
  if (file.isBinary) {
    return [
      {
        source: EvidenceSource.FILE_CHANGE,
        filePath: file.path,
        lineStart: null,
        lineEnd: null,
        snippet: null,
        branchName,
        metadata: {
          changeKind: file.kind,
          isBinary: 'true',
        },
      },
    ];
  }

  // --- Renamed with no content change (no hunks) ---
  if (file.kind === 'RENAMED' && file.hunks.length === 0) {
    return [
      {
        source: EvidenceSource.FILE_CHANGE,
        filePath: file.path,
        lineStart: null,
        lineEnd: null,
        snippet: null,
        branchName,
        metadata: {
          changeKind: 'RENAMED',
          previousPath: file.previousPath ?? '',
        },
      },
    ];
  }

  // --- Deleted file with no hunks (entire file removed) ---
  if (file.kind === 'DELETED' && file.hunks.length === 0) {
    return [
      {
        source: EvidenceSource.FILE_CHANGE,
        filePath: file.path,
        lineStart: null,
        lineEnd: null,
        snippet: null,
        branchName,
        metadata: {
          changeKind: 'DELETED',
          additions: '0',
          deletions: String(file.deletions),
        },
      },
    ];
  }

  // --- Normal file with hunks ---
  return file.hunks.map((hunk, index) =>
    buildEvidenceForHunk(hunk, file, branchName, index),
  );
}

/**
 * Build one CodeEvidence for a single diff hunk.
 */
function buildEvidenceForHunk(
  hunk: DiffHunk,
  file: ParsedFile,
  branchName: string,
  hunkIndex: number,
): CodeEvidence {
  // Line range in the head (feature) file
  const lineStart = hunk.headStart > 0 ? hunk.headStart : null;
  const lineEnd =
    lineStart !== null && hunk.headCount > 0
      ? lineStart + hunk.headCount - 1
      : lineStart;

  // Snippet: up to MAX_SNIPPET_LINES changed lines (added or removed)
  const changedLines = hunk.addedLines
    .concat(hunk.removedLines)
    .slice(0, MAX_SNIPPET_LINES);
  const snippet = changedLines.length > 0 ? changedLines.join('\n') : null;

  const metadata: Record<string, string> = {
    changeKind: file.kind,
    hunkIndex: String(hunkIndex),
    additions: String(hunk.addedLines.length),
    deletions: String(hunk.removedLines.length),
  };
  if (hunk.contextLabel) {
    metadata['contextLabel'] = hunk.contextLabel;
  }
  if (file.previousPath) {
    metadata['previousPath'] = file.previousPath;
  }

  return {
    source: EvidenceSource.FILE_CHANGE,
    filePath: file.path,
    lineStart,
    lineEnd,
    snippet,
    branchName,
    metadata,
  };
}

/**
 * Build CodeEvidence records for every file in a diff.
 *
 * @param files       Array of ParsedFile from parseDiff()
 * @param branchName  The feature branch these files belong to
 */
export function buildAllEvidence(files: ParsedFile[], branchName: string): CodeEvidence[] {
  return files.flatMap((f) => buildEvidenceForFile(f, branchName));
}
