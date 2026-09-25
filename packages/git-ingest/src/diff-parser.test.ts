/**
 * diff-parser.test.ts
 *
 * Tests for the deterministic unified-diff parser.
 * Covers: normal edits, ADDED, DELETED, RENAMED (with/without content),
 * binary files, multi-hunk, empty input, whitespace-only, malformed input.
 */

import { parseDiff, inferLanguage } from '../src/diff-parser.js';
import {
  MODIFIED_TWO_FILES,
  ADDED_NEW_FILE,
  DELETED_FILE,
  RENAMED_NO_CONTENT,
  RENAMED_WITH_CONTENT,
  BINARY_FILE,
  MULTI_HUNK,
  EMPTY_DIFF,
  WHITESPACE_ONLY,
  MALFORMED_NO_HEADER,
  MALFORMED_TRUNCATED,
} from '../src/fixtures/diffs.js';

// ===========================================================================
// Empty / whitespace / malformed input — must never throw
// ===========================================================================

describe('parseDiff — empty / whitespace / malformed input', () => {
  it('returns [] for an empty string', () => {
    expect(parseDiff(EMPTY_DIFF)).toHaveLength(0);
  });

  it('returns [] for whitespace-only input', () => {
    expect(parseDiff(WHITESPACE_ONLY)).toHaveLength(0);
  });

  it('returns [] when there is no diff --git header', () => {
    expect(parseDiff(MALFORMED_NO_HEADER)).toHaveLength(0);
  });

  it('returns one ParsedFile with 0 hunks for a truncated diff', () => {
    const files = parseDiff(MALFORMED_TRUNCATED);
    // Truncated after the header: still parses the path, no hunks
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/foo.ts');
    expect(files[0]?.hunks).toHaveLength(0);
  });
});

// ===========================================================================
// MODIFIED files
// ===========================================================================

describe('parseDiff — MODIFIED files', () => {
  it('returns one ParsedFile per changed file', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    expect(files).toHaveLength(2);
  });

  it('extracts correct paths (no a/ or b/ prefix)', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/auth/roles.ts');
    expect(paths).toContain('src/billing/permissions.ts');
  });

  it('sets kind to MODIFIED', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    for (const f of files) expect(f.kind).toBe('MODIFIED');
  });

  it('counts additions and deletions correctly', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    const auth = files.find((f) => f.path === 'src/auth/roles.ts')!;
    expect(auth.additions).toBe(1);
    expect(auth.deletions).toBe(1);
  });

  it('preserves the full patch string (starts with diff --git)', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    for (const f of files) {
      expect(f.patch).not.toBeNull();
      expect(f.patch).toMatch(/^diff --git /);
    }
  });

  it('isBinary is false', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    for (const f of files) expect(f.isBinary).toBe(false);
  });

  it('parses hunk header numbers correctly', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    const auth = files.find((f) => f.path === 'src/auth/roles.ts')!;
    expect(auth.hunks).toHaveLength(1);
    const hunk = auth.hunks[0]!;
    expect(hunk.baseStart).toBe(10);
    expect(hunk.headStart).toBe(10);
  });

  it('captures added and removed lines in each hunk', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    const auth = files.find((f) => f.path === 'src/auth/roles.ts')!;
    const hunk = auth.hunks[0]!;
    expect(hunk.addedLines).toHaveLength(1);
    expect(hunk.removedLines).toHaveLength(1);
    expect(hunk.addedLines[0]).toContain("'owner'");
    expect(hunk.removedLines[0]).toContain("'admin'");
  });
});

// ===========================================================================
// ADDED files
// ===========================================================================

describe('parseDiff — ADDED file', () => {
  it('returns one ParsedFile with kind ADDED', () => {
    const files = parseDiff(ADDED_NEW_FILE);
    expect(files).toHaveLength(1);
    expect(files[0]?.kind).toBe('ADDED');
  });

  it('extracts the correct path', () => {
    const files = parseDiff(ADDED_NEW_FILE);
    expect(files[0]?.path).toBe('src/audit/logger.ts');
  });

  it('counts only additions (0 deletions)', () => {
    const files = parseDiff(ADDED_NEW_FILE);
    const f = files[0]!;
    // 3 added lines in the fixture hunk body (auditLog function, 3 lines)
    expect(f.additions).toBe(3);
    expect(f.deletions).toBe(0);
  });

  it('hunk headStart is 1 for a new file', () => {
    const files = parseDiff(ADDED_NEW_FILE);
    expect(files[0]?.hunks[0]?.headStart).toBe(1);
  });
});

// ===========================================================================
// DELETED files
// ===========================================================================

describe('parseDiff — DELETED file', () => {
  it('returns one ParsedFile with kind DELETED', () => {
    const files = parseDiff(DELETED_FILE);
    expect(files).toHaveLength(1);
    expect(files[0]?.kind).toBe('DELETED');
  });

  it('uses the source path (a/...) as the path', () => {
    const files = parseDiff(DELETED_FILE);
    expect(files[0]?.path).toBe('src/legacy/old-auth.ts');
  });

  it('counts only deletions (0 additions)', () => {
    const files = parseDiff(DELETED_FILE);
    const f = files[0]!;
    expect(f.additions).toBe(0);
    expect(f.deletions).toBe(2);
  });
});

// ===========================================================================
// RENAMED files
// ===========================================================================

describe('parseDiff — RENAMED file (no content change)', () => {
  it('returns one ParsedFile with kind RENAMED', () => {
    const files = parseDiff(RENAMED_NO_CONTENT);
    expect(files).toHaveLength(1);
    expect(files[0]?.kind).toBe('RENAMED');
  });

  it('sets path to the new name', () => {
    const files = parseDiff(RENAMED_NO_CONTENT);
    expect(files[0]?.path).toBe('src/auth/guards.ts');
  });

  it('sets previousPath to the old name', () => {
    const files = parseDiff(RENAMED_NO_CONTENT);
    expect(files[0]?.previousPath).toBe('src/auth/middleware.ts');
  });

  it('has zero additions and deletions', () => {
    const files = parseDiff(RENAMED_NO_CONTENT);
    const f = files[0]!;
    expect(f.additions).toBe(0);
    expect(f.deletions).toBe(0);
  });

  it('has no hunks', () => {
    const files = parseDiff(RENAMED_NO_CONTENT);
    expect(files[0]?.hunks).toHaveLength(0);
  });
});

describe('parseDiff — RENAMED file (with content change)', () => {
  it('kind is RENAMED', () => {
    const files = parseDiff(RENAMED_WITH_CONTENT);
    expect(files[0]?.kind).toBe('RENAMED');
  });

  it('has hunks with additions and deletions', () => {
    const files = parseDiff(RENAMED_WITH_CONTENT);
    const f = files[0]!;
    expect(f.additions).toBeGreaterThan(0);
    expect(f.deletions).toBeGreaterThan(0);
    expect(f.hunks.length).toBeGreaterThan(0);
  });

  it('previousPath and path are both set', () => {
    const files = parseDiff(RENAMED_WITH_CONTENT);
    const f = files[0]!;
    expect(f.path).toBe('src/auth/guards.ts');
    expect(f.previousPath).toBe('src/auth/middleware.ts');
  });
});

// ===========================================================================
// BINARY files
// ===========================================================================

describe('parseDiff — BINARY file', () => {
  it('returns one ParsedFile with isBinary true', () => {
    const files = parseDiff(BINARY_FILE);
    expect(files).toHaveLength(1);
    expect(files[0]?.isBinary).toBe(true);
  });

  it('patch is null for binary files', () => {
    const files = parseDiff(BINARY_FILE);
    expect(files[0]?.patch).toBeNull();
  });

  it('additions and deletions are 0', () => {
    const files = parseDiff(BINARY_FILE);
    const f = files[0]!;
    expect(f.additions).toBe(0);
    expect(f.deletions).toBe(0);
  });

  it('hunks is empty for binary files', () => {
    const files = parseDiff(BINARY_FILE);
    expect(files[0]?.hunks).toHaveLength(0);
  });
});

// ===========================================================================
// Multi-hunk
// ===========================================================================

describe('parseDiff — multi-hunk file', () => {
  it('returns one ParsedFile with two hunks', () => {
    const files = parseDiff(MULTI_HUNK);
    expect(files).toHaveLength(1);
    expect(files[0]?.hunks).toHaveLength(2);
  });

  it('counts additions across all hunks', () => {
    const files = parseDiff(MULTI_HUNK);
    // Each hunk adds 1 line
    expect(files[0]?.additions).toBe(2);
    expect(files[0]?.deletions).toBe(2);
  });

  it('each hunk has distinct baseStart values', () => {
    const files = parseDiff(MULTI_HUNK);
    const starts = files[0]?.hunks.map((h) => h.baseStart) ?? [];
    expect(new Set(starts).size).toBe(2); // two different positions
  });
});

// ===========================================================================
// inferLanguage
// ===========================================================================

describe('inferLanguage', () => {
  const cases: Array<[string, string | null]> = [
    ['src/auth/roles.ts', 'typescript'],
    ['src/auth/roles.tsx', 'typescript'],
    ['src/app.js', 'javascript'],
    ['app.py', 'python'],
    ['schema.sql', 'sql'],
    ['config.yml', 'yaml'],
    ['config.yaml', 'yaml'],
    ['package.json', 'json'],
    ['Cargo.toml', 'toml'],
    ['README.md', 'markdown'],
    ['styles.css', 'css'],
    ['styles.scss', 'css'],
    ['main.go', 'go'],
    ['lib.rs', 'rust'],
    ['src/Main.java', 'java'],
    ['app.rb', 'ruby'],
    ['Dockerfile', 'dockerfile'], // no dot → split returns full name lowercase
    ['file.unknown', null],
    ['no-extension', null],
  ];

  it.each(cases)('inferLanguage("%s") → %s', (path, expected) => {
    expect(inferLanguage(path)).toBe(expected);
  });
});
