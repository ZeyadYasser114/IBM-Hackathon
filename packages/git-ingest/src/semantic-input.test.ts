/**
 * semantic-input.test.ts
 *
 * Tests for the shared ingestion contract (Amr's contract):
 * ingestChanges, changeSetFromIngestResult, buildSemanticAnalysisInput.
 * No network access — InMemoryAdapter supplies all fixtures.
 */

import { InMemoryAdapter } from '../src/adapters/in-memory.js';
import {
  ingestChanges,
  changeSetFromIngestResult,
  buildSemanticAnalysisInput,
} from '../src/semantic-input.js';
import type { BranchRef, ChangedFile } from '@mergemind/domain';

const BASE: BranchRef = { name: 'main', sha: 'a'.repeat(40) };
const AUTH: BranchRef = { name: 'feature/auth', sha: 'b'.repeat(40) };
const BILLING: BranchRef = { name: 'feature/billing', sha: 'c'.repeat(40) };

const AUTH_PATCH = [
  'diff --git a/auth/roles.ts b/auth/roles.ts',
  'index 1111111..2222222 100644',
  '--- a/auth/roles.ts',
  '+++ b/auth/roles.ts',
  '@@ -1,2 +1,2 @@',
  "-export const ORG_PRIVILEGED_ROLE = 'owner';",
  "+User.role = 'owner';",
  ' export function getRole() {}',
].join('\n');

function file(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: 'auth/roles.ts',
    kind: 'MODIFIED',
    patch: AUTH_PATCH,
    additions: 1,
    deletions: 1,
    branchName: 'feature/auth',
    language: 'typescript',
    ...overrides,
  };
}

function adapter(files: ChangedFile[] = [file()]): InMemoryAdapter {
  const branches = new Map<string, BranchRef>([
    ['main', BASE],
    ['feature/auth', AUTH],
    ['feature/billing', BILLING],
  ]);
  return new InMemoryAdapter(branches, files);
}

const REPO = {
  name: 'acme/platform',
  cloneUrl: 'https://github.com/acme/platform',
  provider: 'github',
};

describe('ingestChanges', () => {
  it('compares two refs with evidence attached', async () => {
    const comparison = await ingestChanges(adapter(), REPO, 'main', 'feature/auth');
    expect(comparison.base).toEqual(BASE);
    expect(comparison.head).toEqual(AUTH);
    expect(comparison.files).toHaveLength(1);
    expect(comparison.files[0]?.path).toBe('auth/roles.ts');
    expect(comparison.files[0]?.evidence.length).toBeGreaterThan(0);
    expect(comparison.files[0]?.evidence[0]?.lineStart).toBe(1);
    expect(comparison.warnings).toEqual([]);
  });

  it('warns on binary files instead of failing', async () => {
    const comparison = await ingestChanges(
      adapter([file({ patch: null, kind: 'ADDED', path: 'logo.png' })]),
      REPO,
      'main',
      'feature/auth',
    );
    expect(comparison.files).toHaveLength(1);
    expect(comparison.files[0]?.evidence).toEqual([]);
    expect(comparison.warnings.some((w) => w.code === 'BINARY_OR_EMPTY_PATCH')).toBe(true);
  });

  it('rejects unknown branches with an actionable error', async () => {
    await expect(ingestChanges(adapter(), REPO, 'main', 'nope')).rejects.toThrow(
      /branch 'nope' not registered/,
    );
  });

  it('returns an empty file list for identical refs', async () => {
    const comparison = await ingestChanges(adapter([]), REPO, 'main', 'feature/billing');
    expect(comparison.files).toEqual([]);
    expect(comparison.warnings).toEqual([]);
  });
});

describe('changeSetFromIngestResult', () => {
  it('groups files under their head refs', () => {
    const changeSet = changeSetFromIngestResult(
      {
        repoPath: '/tmp/x',
        cleanup: () => Promise.resolve(),
        parsed: {
          owner: 'acme',
          repo: 'platform',
          canonicalUrl: 'https://github.com/acme/platform',
          name: 'acme/platform',
        },
        base: BASE,
        changeARef: AUTH,
        changeBRef: BILLING,
        changedFiles: [file()],
        totalDiffBytes: 10,
      },
      'GIT_DIFF',
    );
    expect(changeSet.baseBranch).toBe('main');
    expect(changeSet.comparisons).toHaveLength(2);
    expect(changeSet.comparisons[0]?.files).toHaveLength(1);
    // Empty head still yields a comparison (for honest PASS on empty diffs)
    expect(changeSet.comparisons[1]?.files).toHaveLength(0);
  });
});

describe('buildSemanticAnalysisInput', () => {
  it('applies the single-feed rule: files present means placeholder content', () => {
    const semantic = buildSemanticAnalysisInput(
      {
        repository: {
          name: 'acme/platform',
          cloneUrl: 'https://github.com/acme/platform',
          provider: 'github',
        },
        baseBranch: 'main',
        comparisons: [
          { base: BASE, head: AUTH, files: [], warnings: [] },
          {
            base: BASE,
            head: BILLING,
            files: [
              {
                path: 'billing/permissions.ts',
                kind: 'MODIFIED',
                patch: 'diff --git a/billing/permissions.ts b/billing/permissions.ts\n+line',
                additions: 1,
                deletions: 0,
                language: 'typescript',
                branchName: 'feature/billing',
                evidence: [],
              },
            ],
            warnings: [],
          },
        ],
        source: 'GIT_DIFF',
      },
      'Only owners manage subscriptions.',
    );
    expect(semantic.requirementText).toContain('Only owners');
    expect(semantic.changes).toHaveLength(2);
    // Empty head → explanatory content, no files
    expect(semantic.changes[0]?.files).toHaveLength(0);
    expect(semantic.changes[0]?.content).toContain('No textual differences');
    // Non-empty head → placeholder content + real files (no double feed)
    expect(semantic.changes[1]?.content).toBe('—');
    expect(semantic.changes[1]?.files).toHaveLength(1);
    expect(semantic.changes[1]?.files[0]?.path).toBe('billing/permissions.ts');
  });

  it('forwards ingestion warnings and truncates overflow', () => {
    const files = Array.from({ length: 60 }, (_, i) => ({
      path: `src/${i}.ts`,
      kind: 'MODIFIED' as const,
      patch: '+x',
      additions: 1,
      deletions: 0,
      language: 'typescript' as const,
      branchName: 'feature/auth',
      evidence: [],
    }));
    const semantic = buildSemanticAnalysisInput(
      {
        repository: { name: 'r', cloneUrl: 'u', provider: 'github' },
        baseBranch: 'main',
        comparisons: [{ base: BASE, head: AUTH, files, warnings: [] }],
        source: 'API',
      },
      'req',
    );
    expect(semantic.changes[0]?.files).toHaveLength(50);
    expect(semantic.warnings.some((w) => w.code === 'FILES_TRUNCATED')).toBe(true);
  });
});
