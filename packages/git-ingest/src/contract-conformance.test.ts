/**
 * contract-conformance.test.ts
 *
 * Proves that git-ingest output honours the shared @mergemind/domain contracts:
 *   - Every ChangedFile produced by any adapter validates against ChangedFileSchema.
 *   - Every CodeEvidence record validates against CodeEvidenceSchema
 *     (including binary, renamed, and unparseable-patch fallbacks).
 *   - createRepositoryContext output validates end to end across branches.
 *
 * Plus failure-condition tests: malformed input produces controlled, typed
 * errors (rejected promises / empty results) — never unhandled crashes.
 *
 * Deterministic: all adapters here are in-memory or pasted-diff; the only
 * shell seam (GitRunner) is replaced by scripted fakes. No network, no git.
 */

import {
  ChangedFileSchema,
  CodeEvidenceSchema,
  RepositorySourceSchema,
} from '@mergemind/domain/schemas';
import type { BranchRef, ChangedFile } from '@mergemind/domain';

import {
  buildEvidenceFromChangedFiles,
  createRepositoryContext,
  InMemoryAdapter,
  LocalGitAdapter,
  parseDiff,
  PastedDiffAdapter,
} from './index.js';
import type { GitRunner } from './index.js';
import {
  ADDED_NEW_FILE,
  BINARY_FILE,
  DELETED_FILE,
  EMPTY_DIFF,
  MODIFIED_TWO_FILES,
  RENAMED_NO_CONTENT,
} from './fixtures/diffs.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_REF: BranchRef = { name: 'main', sha: 'a'.repeat(40) };
const AUTH_REF: BranchRef = { name: 'feature/auth', sha: 'b'.repeat(40) };
const BILLING_REF: BranchRef = { name: 'feature/billing', sha: 'c'.repeat(40) };

const REPO = {
  name: 'acme/platform',
  cloneUrl: 'https://github.com/acme/platform',
  provider: 'github',
};

function refsFor(...refs: BranchRef[]): Map<string, BranchRef> {
  return new Map(refs.map((r) => [r.name, r]));
}

// ===========================================================================
// ChangedFile output conforms to the shared contract
// ===========================================================================

describe('adapter ChangedFile output validates against ChangedFileSchema', () => {
  it('PastedDiffAdapter: every file from a two-file MODIFIED diff validates', () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth');
    expect(adapter.files.length).toBeGreaterThan(0);
    for (const f of adapter.files) {
      expect(ChangedFileSchema.safeParse(f).success).toBe(true);
    }
  });

  it('PastedDiffAdapter: ADDED file validates', () => {
    const adapter = new PastedDiffAdapter(ADDED_NEW_FILE, 'feature/audit');
    expect(adapter.files).toHaveLength(1);
    expect(ChangedFileSchema.safeParse(adapter.files[0]).success).toBe(true);
  });

  it('PastedDiffAdapter: DELETED file validates', () => {
    const adapter = new PastedDiffAdapter(DELETED_FILE, 'feature/cleanup');
    expect(adapter.files).toHaveLength(1);
    expect(adapter.files[0]?.kind).toBe('DELETED');
    expect(ChangedFileSchema.safeParse(adapter.files[0]).success).toBe(true);
  });

  it('PastedDiffAdapter: RENAMED file carries a previousPath that validates', () => {
    const adapter = new PastedDiffAdapter(RENAMED_NO_CONTENT, 'feature/refactor');
    const renamed = adapter.files[0];
    expect(renamed?.kind).toBe('RENAMED');
    expect(typeof renamed?.previousPath).toBe('string');
    expect(ChangedFileSchema.safeParse(renamed).success).toBe(true);
  });

  it('PastedDiffAdapter: binary file validates (null patch)', () => {
    const adapter = new PastedDiffAdapter(BINARY_FILE, 'feature/assets');
    expect(adapter.files).toHaveLength(1);
    expect(adapter.files[0]?.patch).toBeNull();
    expect(ChangedFileSchema.safeParse(adapter.files[0]).success).toBe(true);
  });

  it('PastedDiffAdapter: empty diff yields zero files (no crash, no phantom records)', () => {
    const adapter = new PastedDiffAdapter(EMPTY_DIFF, 'feature/empty');
    expect(adapter.files).toHaveLength(0);
  });
});

// ===========================================================================
// CodeEvidence output conforms to the shared contract
// ===========================================================================

describe('evidence output validates against CodeEvidenceSchema', () => {
  it('every evidence record from a MODIFIED diff validates', () => {
    const adapter = new PastedDiffAdapter(MODIFIED_TWO_FILES, 'feature/auth');
    const evidence = buildEvidenceFromChangedFiles([...adapter.files]);
    expect(evidence.length).toBeGreaterThan(0);
    for (const e of evidence) {
      expect(CodeEvidenceSchema.safeParse(e).success).toBe(true);
    }
  });

  it('binary-file fallback record validates (null lines, null snippet)', () => {
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
    expect(CodeEvidenceSchema.safeParse(evidence[0]).success).toBe(true);
  });

  it('unparseable-patch fallback record validates instead of throwing', () => {
    const corrupt: ChangedFile = {
      path: 'src/broken.ts',
      kind: 'MODIFIED',
      patch: 'this is not a diff at all',
      additions: 1,
      deletions: 0,
      branchName: 'feature/broken',
      language: 'typescript',
    };
    const evidence = buildEvidenceFromChangedFiles([corrupt]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.metadata['parseError']).toBe('unparseable-patch');
    expect(CodeEvidenceSchema.safeParse(evidence[0]).success).toBe(true);
  });

  it('renamed-file fallback record carries previousPath metadata and validates', () => {
    const adapter = new PastedDiffAdapter(RENAMED_NO_CONTENT, 'feature/refactor');
    const evidence = buildEvidenceFromChangedFiles([...adapter.files]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.metadata['previousPath']).toBe('src/auth/middleware.ts');
    expect(CodeEvidenceSchema.safeParse(evidence[0]).success).toBe(true);
  });
});

// ===========================================================================
// End-to-end: createRepositoryContext output validates across branches
// ===========================================================================

describe('createRepositoryContext output honours domain contracts', () => {
  function twoBranchAdapter(): InMemoryAdapter {
    const files: ChangedFile[] = [
      {
        path: 'src/auth/roles.ts',
        kind: 'MODIFIED',
        patch: '@@ -1 +1 @@ ...',
        additions: 1,
        deletions: 1,
        branchName: 'feature/auth',
        language: 'typescript',
      },
      {
        path: 'src/auth/guards.ts',
        previousPath: 'src/auth/middleware.ts',
        kind: 'RENAMED',
        patch: null,
        additions: 0,
        deletions: 0,
        branchName: 'feature/billing',
        language: 'typescript',
      },
    ];
    return new InMemoryAdapter(refsFor(BASE_REF, AUTH_REF, BILLING_REF), files);
  }

  it('source validates against RepositorySourceSchema', async () => {
    const result = await createRepositoryContext(twoBranchAdapter(), REPO, 'main', [
      'feature/auth',
      'feature/billing',
    ]);
    expect(RepositorySourceSchema.safeParse(result.source).success).toBe(true);
  });

  it('every changedFile across both branches validates', async () => {
    const result = await createRepositoryContext(twoBranchAdapter(), REPO, 'main', [
      'feature/auth',
      'feature/billing',
    ]);
    expect(result.changedFiles).toHaveLength(2);
    for (const f of result.changedFiles) {
      expect(ChangedFileSchema.safeParse(f).success).toBe(true);
    }
  });

  it('every evidence record validates', async () => {
    const result = await createRepositoryContext(twoBranchAdapter(), REPO, 'main', [
      'feature/auth',
      'feature/billing',
    ]);
    expect(result.evidence.length).toBeGreaterThan(0);
    for (const e of result.evidence) {
      expect(CodeEvidenceSchema.safeParse(e).success).toBe(true);
    }
  });

  it('featureBranches are resolved for every requested branch', async () => {
    const result = await createRepositoryContext(twoBranchAdapter(), REPO, 'main', [
      'feature/auth',
      'feature/billing',
    ]);
    const names = result.source.featureBranches.map((b) => b.name).sort();
    expect(names).toEqual(['feature/auth', 'feature/billing']);
  });
});

// ===========================================================================
// Failure conditions — controlled errors, never crashes
// ===========================================================================

describe('parseDiff — non-string and garbage input', () => {
  it.each([undefined, null, 42, {}, []] as unknown[])(
    'returns [] for non-string input (%s) instead of throwing',
    (input) => {
      expect(() => parseDiff(input as string)).not.toThrow();
      expect(parseDiff(input as string)).toEqual([]);
    },
  );

  it('returns [] for a diff with no parseable file headers', () => {
    expect(parseDiff('just some random log output\nno headers here\n')).toEqual([]);
  });

  it('skips the corrupt chunk but keeps the valid file', () => {
    const mixed = `not a diff header\n${MODIFIED_TWO_FILES}`;
    const files = parseDiff(mixed);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.map((f) => f.path)).toContain('src/auth/roles.ts');
  });
});

describe('createRepositoryContext — controlled failures', () => {
  it('rejects with a clear error when the base branch is unknown', async () => {
    const adapter = new InMemoryAdapter(new Map(), []);
    await expect(createRepositoryContext(adapter, REPO, 'main', ['feature/auth'])).rejects.toThrow(
      /not registered/,
    );
  });

  it('rejects with a clear error when a feature branch is unknown', async () => {
    const adapter = new InMemoryAdapter(refsFor(BASE_REF), []);
    await expect(createRepositoryContext(adapter, REPO, 'main', ['feature/ghost'])).rejects.toThrow(
      /not registered/,
    );
  });

  it('rejects when no feature branches are supplied', async () => {
    const adapter = new InMemoryAdapter(refsFor(BASE_REF), []);
    await expect(createRepositoryContext(adapter, REPO, 'main', [])).rejects.toThrow(
      /at least one feature branch/,
    );
  });
});

describe('LocalGitAdapter — git failures surface as controlled rejections', () => {
  class FailingRunner implements GitRunner {
    async run(args: string[], _cwd: string): Promise<string> {
      throw new Error(`git ${args.join(' ')}: exit code 128 (simulated)`);
    }
  }

  it('resolveBranch rejects with the runner error (no hang, no crash)', async () => {
    const adapter = new LocalGitAdapter('/repo', new FailingRunner());
    await expect(adapter.resolveBranch('main')).rejects.toThrow(/exit code 128/);
  });

  it('getDiffs rejects with the runner error', async () => {
    const adapter = new LocalGitAdapter('/repo', new FailingRunner());
    await expect(adapter.getDiffs(BASE_REF, AUTH_REF)).rejects.toThrow(/exit code 128/);
  });

  it('createRepositoryContext propagates the git failure as a rejection', async () => {
    const adapter = new LocalGitAdapter('/repo', new FailingRunner());
    await expect(createRepositoryContext(adapter, REPO, 'main', ['feature/auth'])).rejects.toThrow(
      /exit code 128/,
    );
  });
});
