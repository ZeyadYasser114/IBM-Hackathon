/**
 * index.test.ts
 *
 * Smoke tests exercising the public API surface of @mergemind/git-ingest.
 * Detailed parser and evidence tests live in diff-parser.test.ts and
 * evidence-builder.test.ts respectively.
 */

import {
  parseDiff,
  PastedDiffAdapter,
  InMemoryAdapter,
  createRepositoryContext,
} from '../src/index.js';
import type { BranchRef, ChangedFile } from '@mergemind/domain';

const BRANCH = 'feature/billing';

const RAW_DIFF = `\
diff --git a/src/auth/roles.ts b/src/auth/roles.ts
index abc1234..def5678 100644
--- a/src/auth/roles.ts
+++ b/src/auth/roles.ts
@@ -1,5 +1,5 @@
 export type Role = 'owner' | 'member';
-const PRIVILEGED_ROLE = 'admin';
+const PRIVILEGED_ROLE = 'owner';
 export function isPrivileged(role: Role) {
   return role === PRIVILEGED_ROLE;
 }
diff --git a/src/billing/permissions.ts b/src/billing/permissions.ts
index aaa0000..bbb1111 100644
--- a/src/billing/permissions.ts
+++ b/src/billing/permissions.ts
@@ -1,5 +1,5 @@
 import { isPrivileged } from '../auth/roles';
-if (user.role === 'owner') {
+if (user.role === 'admin') {
   manageSubscription();
 }
`;

describe('parseDiff (public API)', () => {
  it('returns one ParsedFile per changed file', () => {
    const files = parseDiff(RAW_DIFF);
    expect(files).toHaveLength(2);
  });

  it('extracts the correct file paths', () => {
    const files = parseDiff(RAW_DIFF);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/auth/roles.ts');
    expect(paths).toContain('src/billing/permissions.ts');
  });

  it('counts additions and deletions', () => {
    const files = parseDiff(RAW_DIFF);
    const authFile = files.find((f) => f.path === 'src/auth/roles.ts')!;
    expect(authFile.additions).toBe(1);
    expect(authFile.deletions).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseDiff('')).toHaveLength(0);
  });

  it('tags each record with kind and language (via PastedDiffAdapter)', () => {
    const adapter = new PastedDiffAdapter(RAW_DIFF, BRANCH);
    for (const f of adapter.files) {
      expect(f.branchName).toBe(BRANCH);
      expect(f.kind).toBe('MODIFIED');
      expect(f.language).toBe('typescript');
      expect(f.patch).toContain('diff --git');
    }
  });

  it('detects ADDED files from new-file markers', () => {
    const raw = `\
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+export const x = 1;
`;
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0]?.kind).toBe('ADDED');
    expect(files[0]?.additions).toBe(1);
  });
});

describe('createRepositoryContext (public API)', () => {
  const baseRef: BranchRef = { name: 'main', sha: 'a'.repeat(40) };
  const featureRef: BranchRef = { name: 'feature/auth', sha: 'b'.repeat(40) };

  const file: ChangedFile = {
    path: 'src/auth/roles.ts',
    kind: 'MODIFIED',
    patch: null,
    additions: 1,
    deletions: 1,
    branchName: 'feature/auth',
    language: 'typescript',
  };

  it('returns source + changedFiles + evidence', async () => {
    const adapter = new InMemoryAdapter(
      new Map([
        ['main', baseRef],
        ['feature/auth', featureRef],
      ]),
      [file],
    );
    const result = await createRepositoryContext(
      adapter,
      { name: 'test-repo', cloneUrl: '/tmp/test' },
      'main',
      ['feature/auth'],
    );
    expect(result.source.name).toBe('test-repo');
    expect(result.changedFiles).toHaveLength(1);
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});
