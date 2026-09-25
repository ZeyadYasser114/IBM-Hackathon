/**
 * ingest.test.ts
 *
 * Integration tests for the full ingest pipeline.
 * Tests cover:
 *   - InMemoryAdapter: already-built ChangedFile records flow end-to-end
 *   - PastedDiffAdapter: raw diff text → ChangedFile + CodeEvidence
 *   - createRepositoryContext: orchestration, deduplication, evidence assembly
 *   - LocalGitAdapter with MockGitRunner: shell isolation
 *   - buildEvidenceFromChangedFiles: bridge function for binary/null-patch files
 *   - Error handling: zero feature branches, unknown branch name
 */

import {
  createRepositoryContext,
  InMemoryAdapter,
  PastedDiffAdapter,
  LocalGitAdapter,
  buildEvidenceFromChangedFiles,
} from '../src/index.js';
import type { GitRunner } from '../src/index.js';
import type { ChangedFile, BranchRef } from '@mergemind/domain';
import {
  MODIFIED_TWO_FILES,
  ADDED_NEW_FILE,
  BINARY_FILE,
  RENAMED_NO_CONTENT,
  EMPTY_DIFF,
} from '../src/fixtures/diffs.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_SHA = 'a'.repeat(40);
const FEATURE_SHA = 'b'.repeat(40);

const BASE_REF: BranchRef = { name: 'main', sha: BASE_SHA };
const FEATURE_REF: BranchRef = { name: 'feature/auth', sha: FEATURE_SHA };

const REPO = {
  name: 'acme/platform',
  cloneUrl: 'https://github.com/acme/platform',
  provider: 'github',
};

function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: 'src/auth/roles.ts',
    kind: 'MODIFIED',
    patch: MODIFIED_TWO_FILES.split('diff --git a/src/billing')[0] ?? '',
    additions: 1,
    deletions: 1,
    branchName: 'feature/auth',
    language: 'typescript',
    ...overrides,
  };
}

// ===========================================================================
// InMemoryAdapter
// ===========================================================================

describe('InMemoryAdapter', () => {
  it('resolveBranch returns the registered ref', async () => {
    const adapter = new InMemoryAdapter(
      new Map([
        ['main', BASE_REF],
        ['feature/auth', FEATURE_REF],
      ]),
      [],
    );
    const ref = await adapter.resolveBranch('main');
    expect(ref.name).toBe('main');
    expect(ref.sha).toBe(BASE_SHA);
  });

  it('throws on unknown branch name', async () => {
    const adapter = new InMemoryAdapter(new Map(), []);
    await expect(adapter.resolveBranch('unknown')).rejects.toThrow(/unknown/);
  });

  it('getDiffs returns only files for the requested feature branch', async () => {
    const files: ChangedFile[] = [
      makeChangedFile({ branchName: 'feature/auth' }),
      makeChangedFile({ path: 'src/billing/permissions.ts', branchName: 'feature/billing' }),
    ];
    const adapter = new InMemoryAdapter(
      new Map([
        ['main', BASE_REF],
        ['feature/auth', FEATURE_REF],
      ]),
      files,
    );
    const diffs = await adapter.getDiffs(BASE_REF, FEATURE_REF);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.branchName).toBe('feature/auth');
  });
});

// ===========================================================================
// PastedDiffAdapter
// ===========================================================================

describe('PastedDiffAdapter', () => {
  it('parses a two-file diff and exposes both files', () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth');
    expect(adapter.fileCount).toBe(2);
  });

  it('attributes all files to the supplied feature branch', () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth');
    for (const f of adapter.files) {
      expect(f.branchName).toBe('feature/auth');
    }
  });

  it('resolveBranch returns a synthetic but deterministic SHA', async () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth');
    const base = await adapter.resolveBranch('main');
    const base2 = await adapter.resolveBranch('main');
    expect(base.sha).toBe(base2.sha); // deterministic
    expect(base.sha).toHaveLength(40); // 40 hex chars
    expect(base.sha).toMatch(/^[0-9a-f]+$/); // lowercase hex
  });

  it('handles an empty diff without throwing', () => {
    const adapter = new PastedDiffAdapter(EMPTY_DIFF, 'feature/empty');
    expect(adapter.fileCount).toBe(0);
  });

  it('sets kind to ADDED for new-file diffs', () => {
    const adapter = new PastedDiffAdapter(ADDED_NEW_FILE, 'feature/audit');
    expect(adapter.files[0]?.kind).toBe('ADDED');
  });

  it('sets patch to null for binary files', () => {
    const adapter = new PastedDiffAdapter(BINARY_FILE, 'feature/assets');
    expect(adapter.files[0]?.patch).toBeNull();
  });

  it('sets kind to RENAMED for rename diffs', () => {
    const adapter = new PastedDiffAdapter(RENAMED_NO_CONTENT, 'feature/refactor');
    expect(adapter.files[0]?.kind).toBe('RENAMED');
  });

  it('infers language from file extension', () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth');
    const tsFile = adapter.files.find((f) => f.path.endsWith('.ts'));
    expect(tsFile?.language).toBe('typescript');
  });

  it('getDiffs returns the same files regardless of refs', async () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth');
    const diffs = await adapter.getDiffs(BASE_REF, FEATURE_REF);
    expect(diffs).toHaveLength(2);
  });
});

// ===========================================================================
// createRepositoryContext — InMemoryAdapter path
// ===========================================================================

describe('createRepositoryContext — InMemoryAdapter', () => {
  function makeAdapter(extraFiles: ChangedFile[] = []) {
    const files: ChangedFile[] = [makeChangedFile({ branchName: 'feature/auth' }), ...extraFiles];
    return new InMemoryAdapter(
      new Map([
        ['main', BASE_REF],
        ['feature/auth', FEATURE_REF],
      ]),
      files,
    );
  }

  it('returns a RepositoryIngestResult with all three fields', async () => {
    const result = await createRepositoryContext(makeAdapter(), REPO, 'main', ['feature/auth']);
    expect(result).toHaveProperty('source');
    expect(result).toHaveProperty('changedFiles');
    expect(result).toHaveProperty('evidence');
  });

  it('source.name, cloneUrl, and provider match the descriptor', async () => {
    const result = await createRepositoryContext(makeAdapter(), REPO, 'main', ['feature/auth']);
    expect(result.source.name).toBe('acme/platform');
    expect(result.source.cloneUrl).toBe('https://github.com/acme/platform');
    expect(result.source.provider).toBe('github');
  });

  it('source.baseBranch and featureBranches are resolved', async () => {
    const result = await createRepositoryContext(makeAdapter(), REPO, 'main', ['feature/auth']);
    expect(result.source.baseBranch.name).toBe('main');
    expect(result.source.featureBranches).toHaveLength(1);
    expect(result.source.featureBranches[0]?.name).toBe('feature/auth');
  });

  it('source.id is a non-empty string (UUID)', async () => {
    const result = await createRepositoryContext(makeAdapter(), REPO, 'main', ['feature/auth']);
    expect(result.source.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('changedFiles contains the registered files', async () => {
    const result = await createRepositoryContext(makeAdapter(), REPO, 'main', ['feature/auth']);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0]?.path).toBe('src/auth/roles.ts');
  });

  it('deduplicates files with the same (branchName, path)', async () => {
    const duplicate = makeChangedFile({ branchName: 'feature/auth', additions: 5 });
    const result = await createRepositoryContext(makeAdapter([duplicate]), REPO, 'main', [
      'feature/auth',
    ]);
    // Should have deduplicated to 1 file (last write wins)
    expect(result.changedFiles).toHaveLength(1);
  });

  it('evidence array is non-empty when there are changed files', async () => {
    const result = await createRepositoryContext(makeAdapter(), REPO, 'main', ['feature/auth']);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('all evidence records carry the correct branchName', async () => {
    const result = await createRepositoryContext(makeAdapter(), REPO, 'main', ['feature/auth']);
    for (const e of result.evidence) {
      expect(e.branchName).toBe('feature/auth');
    }
  });

  it('throws when featureBranchNames is empty', async () => {
    await expect(createRepositoryContext(makeAdapter(), REPO, 'main', [])).rejects.toThrow(
      /at least one feature branch/,
    );
  });

  it('provider defaults to "local" when omitted', async () => {
    const result = await createRepositoryContext(
      makeAdapter(),
      { name: 'test', cloneUrl: '/tmp/test' },
      'main',
      ['feature/auth'],
    );
    expect(result.source.provider).toBe('local');
  });
});

// ===========================================================================
// createRepositoryContext — PastedDiffAdapter path
// ===========================================================================

describe('createRepositoryContext — PastedDiffAdapter', () => {
  it('produces changedFiles and evidence from a pasted diff', async () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth', 'main');
    const result = await createRepositoryContext(adapter, REPO, 'main', ['feature/auth']);
    expect(result.changedFiles).toHaveLength(2);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('evidence source is FILE_CHANGE for all records', async () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth', 'main');
    const result = await createRepositoryContext(adapter, REPO, 'main', ['feature/auth']);
    for (const e of result.evidence) {
      expect(e.source).toBe('FILE_CHANGE');
    }
  });
});

// ===========================================================================
// LocalGitAdapter with mock runner
// ===========================================================================

describe('LocalGitAdapter — with MockGitRunner', () => {
  /** Mock GitRunner that returns scripted responses keyed by joined args */
  class MockGitRunner implements GitRunner {
    constructor(private readonly responses: Map<string, string>) {}
    async run(args: string[], _cwd: string): Promise<string> {
      const key = args.join(' ');
      const response = this.responses.get(key);
      if (response === undefined) throw new Error(`MockGitRunner: unexpected call: git ${key}`);
      return response;
    }
  }

  const mockRunner = new MockGitRunner(
    new Map([
      [`rev-parse main`, BASE_SHA + '\n'],
      [`rev-parse feature/auth`, FEATURE_SHA + '\n'],
      [`diff --unified=3 ${BASE_SHA}...${FEATURE_SHA}`, MODIFIED_TWO_FILES],
    ]),
  );

  it('resolveBranch returns the SHA from the runner', async () => {
    const adapter = new LocalGitAdapter('/repo', mockRunner);
    const ref = await adapter.resolveBranch('main');
    expect(ref.sha).toBe(BASE_SHA);
  });

  it('getDiffs parses the diff returned by the runner', async () => {
    const adapter = new LocalGitAdapter('/repo', mockRunner);
    const diffs = await adapter.getDiffs(BASE_REF, FEATURE_REF);
    expect(diffs).toHaveLength(2);
    expect(diffs[0]?.kind).toBe('MODIFIED');
  });

  it('getDiffs preserves language hints', async () => {
    const adapter = new LocalGitAdapter('/repo', mockRunner);
    const diffs = await adapter.getDiffs(BASE_REF, FEATURE_REF);
    for (const d of diffs) expect(d.language).toBe('typescript');
  });

  it('getDiffs sets branchName to the feature branch name', async () => {
    const adapter = new LocalGitAdapter('/repo', mockRunner);
    const diffs = await adapter.getDiffs(BASE_REF, FEATURE_REF);
    for (const d of diffs) expect(d.branchName).toBe('feature/auth');
  });
});

// ===========================================================================
// buildEvidenceFromChangedFiles — binary and null-patch edge cases
// ===========================================================================

describe('buildEvidenceFromChangedFiles', () => {
  it('produces evidence for a normal MODIFIED file', () => {
    const file = makeChangedFile();
    const evidence = buildEvidenceFromChangedFiles([file]);
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0]?.source).toBe('FILE_CHANGE');
  });

  it('produces one opaque record for a binary file (null patch)', () => {
    const binary: ChangedFile = {
      path: 'public/logo.png',
      kind: 'MODIFIED',
      patch: null,
      additions: 0,
      deletions: 0,
      branchName: 'feature/assets',
      language: null,
    };
    const evidence = buildEvidenceFromChangedFiles([binary]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.lineStart).toBeNull();
    expect(evidence[0]?.snippet).toBeNull();
  });

  it('carries previousPath in metadata for RENAMED files', () => {
    const renamed: ChangedFile = {
      path: 'src/auth/guards.ts',
      previousPath: 'src/auth/middleware.ts',
      kind: 'RENAMED',
      patch: null,
      additions: 0,
      deletions: 0,
      branchName: 'feature/refactor',
      language: 'typescript',
    };
    const evidence = buildEvidenceFromChangedFiles([renamed]);
    expect(evidence[0]?.metadata['previousPath']).toBe('src/auth/middleware.ts');
  });

  it('returns [] for empty input', () => {
    expect(buildEvidenceFromChangedFiles([])).toHaveLength(0);
  });
});
