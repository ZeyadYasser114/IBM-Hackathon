/**
 * diff-parser.ts
 *
 * Deterministic, zero-dependency unified-diff parser.
 *
 * Responsibilities:
 *   - Split a multi-file `git diff` output into per-file records.
 *   - Extract the full patch text for each file.
 *   - Identify the change kind (ADDED / DELETED / MODIFIED / RENAMED).
 *   - Detect binary files and produce a null patch with a BINARY marker.
 *   - Parse each hunk header (@@ -l,s +l,s @@) into structured DiffHunk records.
 *   - Count additions and deletions from hunk content lines.
 *   - Return normalised forward-slash paths (no "a/" or "b/" prefixes).
 *
 * Non-responsibilities (no AI, no semantics):
 *   - Does NOT decide whether a change is correct.
 *   - Does NOT compare two assumptions.
 *   - Does NOT throw on malformed input — it returns what it can parse.
 *
 * Public API:
 *   parseDiff(raw, branchName) → ParsedFile[]
 */

import type { ChangeKind } from '@mergemind/domain';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single hunk extracted from a unified diff.
 * Preserves the raw hunk text and the parsed header numbers.
 */
export type DiffHunk = {
  /**
   * First line of the base file that this hunk covers (1-based).
   * Zero for hunks in new files (no base context).
   */
  baseStart: number;
  /** Number of lines from the base file in this hunk (0 for pure additions). */
  baseCount: number;
  /**
   * First line of the feature file that this hunk covers (1-based).
   * Zero for hunks in deleted files.
   */
  headStart: number;
  /** Number of lines from the feature file in this hunk (0 for pure deletions). */
  headCount: number;
  /**
   * Optional context label appended after the @@ marker by Git (e.g. a function name).
   * Empty string when absent.
   */
  contextLabel: string;
  /** Raw text of this hunk including the @@ header line and all body lines. */
  rawHunk: string;
  /** Lines prefixed with '+' (excluding the +++ file header). */
  addedLines: string[];
  /** Lines prefixed with '-' (excluding the --- file header). */
  removedLines: string[];
};

/**
 * A single file entry parsed from a unified diff.
 * This is the primary output of `parseDiff`.
 */
export type ParsedFile = {
  /**
   * Repository-relative path after the change.
   * Forward-slash separated; no "b/" prefix.
   */
  path: string;
  /**
   * Previous path, set only when the file was renamed.
   * Forward-slash separated; no "a/" prefix.
   */
  previousPath: string | undefined;
  /** How the file changed relative to the base branch. */
  kind: ChangeKind;
  /**
   * True when Git detected this as a binary file.
   * Binary files have null patch and zero hunks.
   */
  isBinary: boolean;
  /**
   * Full unified diff text for this file (including the `diff --git` header).
   * Null for binary files.
   */
  patch: string | null;
  /** Sum of all added lines across all hunks. */
  additions: number;
  /** Sum of all removed lines across all hunks. */
  deletions: number;
  /** Structured hunks. Empty for binary files and pure renames with no content change. */
  hunks: DiffHunk[];
};

// ---------------------------------------------------------------------------
// Parser implementation
// ---------------------------------------------------------------------------

/**
 * Parse a raw `git diff` string into structured per-file records.
 *
 * Handles:
 *   - Normal modified files
 *   - New files (new file mode)
 *   - Deleted files (deleted file mode)
 *   - Renamed files (rename from / rename to markers)
 *   - Binary files (Binary files ... differ)
 *   - Empty diffs (returns [])
 *   - Malformed / truncated input (skips unparseable chunks)
 *
 * @param raw       Full output of `git diff --unified=N` or equivalent
 * @returns         One ParsedFile per changed file; order matches the diff
 */
export function parseDiff(raw: string): ParsedFile[] {
  if (!raw.trim()) return [];

  // Split on the "diff --git" boundary, keeping each chunk self-contained.
  const chunks = raw.split(/^(?=diff --git )/m).filter((c) => c.trim());

  const results: ParsedFile[] = [];
  for (const chunk of chunks) {
    const parsed = parseChunk(chunk);
    if (parsed !== null) results.push(parsed);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Per-chunk parsing
// ---------------------------------------------------------------------------

function parseChunk(chunk: string): ParsedFile | null {
  const lines = chunk.split('\n');

  // Line 0 must be "diff --git a/<path> b/<path>"
  const headerLine = lines[0] ?? '';
  const headerMatch = headerLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!headerMatch) return null;

  const rawPathA = headerMatch[1] ?? '';
  const rawPathB = headerMatch[2] ?? '';

  // --- Determine change kind and paths from extended headers ---
  let kind: ChangeKind = 'MODIFIED';
  let path = normalizePath(rawPathB);
  let previousPath: string | undefined;
  let isBinary = false;

  for (const line of lines.slice(1)) {
    if (line.startsWith('new file mode')) {
      kind = 'ADDED';
    } else if (line.startsWith('deleted file mode')) {
      kind = 'DELETED';
      path = normalizePath(rawPathA); // use source path for deletions
    } else if (line.startsWith('rename from ')) {
      previousPath = normalizePath(line.slice('rename from '.length).trim());
    } else if (line.startsWith('rename to ')) {
      kind = 'RENAMED';
      path = normalizePath(line.slice('rename to '.length).trim());
    } else if (/^Binary files? .+ differ$/.test(line)) {
      isBinary = true;
      break;
    } else if (line.startsWith('@@')) {
      break; // reached hunk section
    }
  }

  // --- Binary file: no patch, no hunks ---
  if (isBinary) {
    return {
      path,
      previousPath,
      kind,
      isBinary: true,
      patch: null,
      additions: 0,
      deletions: 0,
      hunks: [],
    };
  }

  // --- Parse hunks ---
  const hunks = parseHunks(lines);

  let additions = 0;
  let deletions = 0;
  for (const h of hunks) {
    additions += h.addedLines.length;
    deletions += h.removedLines.length;
  }

  return {
    path,
    previousPath,
    kind,
    isBinary: false,
    patch: chunk.endsWith('\n') ? chunk : chunk + '\n',
    additions,
    deletions,
    hunks,
  };
}

// ---------------------------------------------------------------------------
// Hunk parsing
// ---------------------------------------------------------------------------

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/;

function parseHunks(fileLines: string[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let i = 0;

  // Skip the file-level header lines until we hit the first @@
  while (i < fileLines.length && !fileLines[i]?.startsWith('@@')) i++;

  while (i < fileLines.length) {
    const headerLine = fileLines[i] ?? '';
    const m = headerLine.match(HUNK_HEADER);
    if (!m) {
      i++;
      continue;
    }

    const baseStart = parseInt(m[1] ?? '0', 10);
    const baseCount = m[2] !== undefined ? parseInt(m[2], 10) : 1;
    const headStart = parseInt(m[3] ?? '0', 10);
    const headCount = m[4] !== undefined ? parseInt(m[4], 10) : 1;
    const contextLabel = (m[5] ?? '').trim();

    // Collect body lines until the next @@ or end
    const bodyLines: string[] = [];
    i++;
    while (i < fileLines.length && !fileLines[i]?.startsWith('@@')) {
      bodyLines.push(fileLines[i] ?? '');
      i++;
    }

    const addedLines = bodyLines.filter((l) => l.startsWith('+'));
    const removedLines = bodyLines.filter((l) => l.startsWith('-'));
    const rawHunk = [headerLine, ...bodyLines].join('\n');

    hunks.push({
      baseStart,
      baseCount,
      headStart,
      headCount,
      contextLabel,
      rawHunk,
      addedLines,
      removedLines,
    });
  }

  return hunks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip "a/" / "b/" prefixes that Git prepends to diff paths,
 * and normalise backslashes to forward slashes.
 */
function normalizePath(p: string): string {
  // Remove leading a/ or b/ produced by git
  const stripped = p.replace(/^[ab]\//, '');
  // Normalize OS path separators
  return stripped.replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

/**
 * Best-effort programming language hint from the file extension.
 * Returns null when the extension is unrecognised.
 * Agents must not treat this as authoritative.
 */
export function inferLanguage(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'py':
      return 'python';
    case 'rb':
      return 'ruby';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'java':
      return 'java';
    case 'kt':
    case 'kts':
      return 'kotlin';
    case 'cs':
      return 'csharp';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'c':
    case 'h':
    case 'hpp':
      return 'cpp';
    case 'sql':
      return 'sql';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'json':
    case 'jsonc':
      return 'json';
    case 'toml':
      return 'toml';
    case 'md':
    case 'mdx':
      return 'markdown';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'dockerfile':
      return 'dockerfile';
    case 'tf':
      return 'terraform';
    case 'proto':
      return 'protobuf';
    default:
      return null;
  }
}
