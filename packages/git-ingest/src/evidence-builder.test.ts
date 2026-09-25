/**
 * evidence-builder.test.ts
 *
 * Tests for the CodeEvidence builder.
 * Verifies that ParsedFile records from the diff parser are correctly
 * mapped to CodeEvidence contracts — the right source, line numbers,
 * snippets, metadata, and edge-case handling.
 */

import { parseDiff } from '../src/diff-parser.js';
import { buildEvidenceForFile, buildAllEvidence } from '../src/evidence-builder.js';
import {
  MODIFIED_TWO_FILES,
  ADDED_NEW_FILE,
  DELETED_FILE,
  RENAMED_NO_CONTENT,
  RENAMED_WITH_CONTENT,
  BINARY_FILE,
  MULTI_HUNK,
} from '../src/fixtures/diffs.js';

const BRANCH = 'feature/auth-rbac';

// ===========================================================================
// source is always FILE_CHANGE
// ===========================================================================

describe('buildEvidenceForFile — source field', () => {
  it('always produces FILE_CHANGE evidence', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    for (const f of files) {
      const evidence = buildEvidenceForFile(f, BRANCH);
      for (const e of evidence) {
        expect(e.source).toBe('FILE_CHANGE');
      }
    }
  });
});

// ===========================================================================
// MODIFIED file — hunk-level evidence
// ===========================================================================

describe('buildEvidenceForFile — MODIFIED file', () => {
  const file = parseDiff(MODIFIED_TWO_FILES).find((f) => f.path === 'src/auth/roles.ts')!;

  it('produces one evidence record per hunk', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence).toHaveLength(file.hunks.length);
    expect(evidence).toHaveLength(1);
  });

  it('sets filePath from the file path', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.filePath).toBe('src/auth/roles.ts');
  });

  it('sets branchName correctly', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.branchName).toBe(BRANCH);
  });

  it('sets lineStart to hunk.headStart', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.lineStart).toBe(file.hunks[0]!.headStart);
  });

  it('lineEnd >= lineStart', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    const e = evidence[0]!;
    expect(e.lineEnd).not.toBeNull();
    expect(e.lineEnd!).toBeGreaterThanOrEqual(e.lineStart!);
  });

  it('snippet contains the changed lines', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    const snippet = evidence[0]?.snippet ?? '';
    // Should contain either the added or removed line
    expect(snippet).toMatch(/'owner'|'admin'/);
  });

  it('metadata records changeKind and hunkIndex', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    const meta = evidence[0]?.metadata ?? {};
    expect(meta['changeKind']).toBe('MODIFIED');
    expect(meta['hunkIndex']).toBe('0');
  });
});

// ===========================================================================
// ADDED file
// ===========================================================================

describe('buildEvidenceForFile — ADDED file', () => {
  const file = parseDiff(ADDED_NEW_FILE)[0]!;

  it('produces one evidence per hunk', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence.length).toBeGreaterThan(0);
  });

  it('metadata changeKind is ADDED', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.metadata['changeKind']).toBe('ADDED');
  });

  it('lineStart is 1 for the first hunk of a new file', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.lineStart).toBe(1);
  });

  it('snippet contains added lines', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.snippet).toContain('auditLog');
  });
});

// ===========================================================================
// DELETED file
// ===========================================================================

describe('buildEvidenceForFile — DELETED file', () => {
  const file = parseDiff(DELETED_FILE)[0]!;

  it('produces evidence records', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence.length).toBeGreaterThan(0);
  });

  it('metadata changeKind is DELETED', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.metadata['changeKind']).toBe('DELETED');
  });
});

// ===========================================================================
// BINARY file
// ===========================================================================

describe('buildEvidenceForFile — BINARY file', () => {
  const file = parseDiff(BINARY_FILE)[0]!;

  it('produces exactly one evidence record', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence).toHaveLength(1);
  });

  it('lineStart and lineEnd are null', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.lineStart).toBeNull();
    expect(evidence[0]?.lineEnd).toBeNull();
  });

  it('snippet is null', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.snippet).toBeNull();
  });

  it('metadata marks isBinary', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.metadata['isBinary']).toBe('true');
  });
});

// ===========================================================================
// RENAMED — no content change
// ===========================================================================

describe('buildEvidenceForFile — RENAMED (no content)', () => {
  const file = parseDiff(RENAMED_NO_CONTENT)[0]!;

  it('produces exactly one evidence record', () => {
    expect(buildEvidenceForFile(file, BRANCH)).toHaveLength(1);
  });

  it('metadata records previousPath', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.metadata['previousPath']).toBe('src/auth/middleware.ts');
  });

  it('lineStart and lineEnd are null', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.lineStart).toBeNull();
    expect(evidence[0]?.lineEnd).toBeNull();
  });
});

// ===========================================================================
// RENAMED — with content change
// ===========================================================================

describe('buildEvidenceForFile — RENAMED (with content)', () => {
  const file = parseDiff(RENAMED_WITH_CONTENT)[0]!;

  it('produces one evidence record per hunk', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence).toHaveLength(file.hunks.length);
    expect(evidence.length).toBeGreaterThan(0);
  });

  it('metadata records previousPath on each hunk evidence', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    for (const e of evidence) {
      expect(e.metadata['previousPath']).toBe('src/auth/middleware.ts');
    }
  });
});

// ===========================================================================
// Multi-hunk — one evidence per hunk
// ===========================================================================

describe('buildEvidenceForFile — multi-hunk', () => {
  const file = parseDiff(MULTI_HUNK)[0]!;

  it('produces two evidence records for a two-hunk file', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence).toHaveLength(2);
  });

  it('hunkIndex increments across records', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    expect(evidence[0]?.metadata['hunkIndex']).toBe('0');
    expect(evidence[1]?.metadata['hunkIndex']).toBe('1');
  });

  it('each record has distinct lineStart values', () => {
    const evidence = buildEvidenceForFile(file, BRANCH);
    const starts = evidence.map((e) => e.lineStart);
    expect(starts[0]).not.toBe(starts[1]);
  });
});

// ===========================================================================
// buildAllEvidence — aggregate
// ===========================================================================

describe('buildAllEvidence', () => {
  it('processes all files in the diff', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    const evidence = buildAllEvidence(files, BRANCH);
    // Two files, one hunk each → two evidence records
    expect(evidence).toHaveLength(2);
  });

  it('all records carry the supplied branchName', () => {
    const files = parseDiff(MODIFIED_TWO_FILES);
    const evidence = buildAllEvidence(files, BRANCH);
    for (const e of evidence) expect(e.branchName).toBe(BRANCH);
  });

  it('returns [] for an empty file list', () => {
    expect(buildAllEvidence([], BRANCH)).toHaveLength(0);
  });
});
