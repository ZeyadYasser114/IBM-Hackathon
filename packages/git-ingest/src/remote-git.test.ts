/**
 * remote-git.test.ts
 *
 * Unit tests for remote GitHub ingestion guards. No network access:
 * URL validation, ref validation, and diff-limit enforcement are pure and
 * deterministic. The clone/fetch path is exercised through the API layer
 * with a real public repository (manual verification) rather than in CI.
 */

import { parseGitHubUrl, validateRef, assertDiffLimits } from '../src/adapters/remote-git.js';
import type { ChangedFile } from '@mergemind/domain';

// ---------------------------------------------------------------------------
// parseGitHubUrl
// ---------------------------------------------------------------------------

describe('parseGitHubUrl', () => {
  it('accepts a canonical public GitHub URL', () => {
    const parsed = parseGitHubUrl('https://github.com/acme/platform');
    expect(parsed.owner).toBe('acme');
    expect(parsed.repo).toBe('platform');
    expect(parsed.canonicalUrl).toBe('https://github.com/acme/platform');
    expect(parsed.name).toBe('acme/platform');
  });

  it('strips a .git suffix and trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/acme/platform.git').canonicalUrl).toBe(
      'https://github.com/acme/platform',
    );
    expect(parseGitHubUrl('https://github.com/acme/platform/').name).toBe('acme/platform');
  });

  it.each([
    ['empty', ''],
    ['ssh scheme', 'git@github.com:acme/platform.git'],
    ['ssh URL', 'ssh://git@github.com/acme/platform'],
    ['file URL', 'file:///tmp/repo'],
    ['ftp scheme', 'ftp://github.com/acme/platform'],
    ['non-GitHub host', 'https://gitlab.com/acme/platform'],
    ['localhost', 'https://localhost/acme/platform'],
    ['IP literal', 'https://127.0.0.1/acme/platform'],
    ['credentials', 'https://user:token@github.com/acme/platform'],
    ['missing repo', 'https://github.com/acme'],
    ['too deep', 'https://github.com/acme/platform/extra'],
    ['http scheme', 'http://github.com/acme/platform'],
  ])('rejects %s', (_label, url) => {
    expect(() => parseGitHubUrl(url)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateRef
// ---------------------------------------------------------------------------

describe('validateRef', () => {
  it.each([
    ['main'],
    ['feature/auth-roles'],
    ['feature/billing-permissions'],
    ['v1.2.0'],
    ['abc1234'],
  ])('accepts %s', (ref) => {
    expect(() => validateRef(ref, 'branchA')).not.toThrow();
  });

  it.each([
    ['empty', ''],
    ['leading dash', '-rm-rf'],
    ['leading slash', '/etc/passwd'],
    ['path traversal', '../main'],
    ['template', 'main@{1}'],
    ['whitespace', 'my branch'],
    ['shell metachars', 'main; rm -rf /'],
    ['too long', 'a'.repeat(256)],
  ])('rejects %s', (_label, ref) => {
    expect(() => validateRef(ref, 'branchA')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertDiffLimits
// ---------------------------------------------------------------------------

function makeFile(patchSize: number, path = 'src/a.ts'): ChangedFile {
  return {
    path,
    kind: 'MODIFIED',
    patch: 'x'.repeat(patchSize),
    additions: 1,
    deletions: 1,
    branchName: 'feature/a',
    language: 'typescript',
  };
}

describe('assertDiffLimits', () => {
  it('accepts small diffs', () => {
    expect(() => assertDiffLimits([makeFile(100)], 200, 1_000_000)).not.toThrow();
  });

  it('accepts an empty diff (same branch compared against itself)', () => {
    expect(() => assertDiffLimits([], 200, 1_000_000)).not.toThrow();
  });

  it('rejects too many files', () => {
    const files = Array.from({ length: 3 }, (_, i) => makeFile(10, `src/${i}.ts`));
    expect(() => assertDiffLimits(files, 2, 1_000_000)).toThrow(/too many files/);
  });

  it('rejects oversized diffs', () => {
    expect(() => assertDiffLimits([makeFile(100)], 200, 50)).toThrow(/too large/);
  });
});
