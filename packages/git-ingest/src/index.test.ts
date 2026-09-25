import { parseDiffOutput } from '../src/index.js';

describe('parseDiffOutput', () => {
  const RAW_DIFF = `diff --git a/src/auth/roles.ts b/src/auth/roles.ts
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

  it('returns one FileDiff per changed file', () => {
    const diffs = parseDiffOutput(RAW_DIFF, 'feature/billing');
    expect(diffs).toHaveLength(2);
  });

  it('extracts the correct file paths', () => {
    const diffs = parseDiffOutput(RAW_DIFF, 'feature/billing');
    const paths = diffs.map((d) => d.path);
    expect(paths).toContain('src/auth/roles.ts');
    expect(paths).toContain('src/billing/permissions.ts');
  });

  it('counts additions and deletions', () => {
    const diffs = parseDiffOutput(RAW_DIFF, 'feature/billing');
    const authDiff = diffs.find((d) => d.path === 'src/auth/roles.ts');
    expect(authDiff?.additions).toBe(1);
    expect(authDiff?.deletions).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseDiffOutput('', 'main')).toHaveLength(0);
  });

  it('tags each record with branchName, kind, and language', () => {
    const diffs = parseDiffOutput(RAW_DIFF, 'feature/billing');
    for (const d of diffs) {
      expect(d.branchName).toBe('feature/billing');
      expect(d.kind).toBe('MODIFIED');
      expect(d.language).toBe('typescript');
      expect(d.patch).toContain('diff --git');
    }
  });

  it('detects ADDED files from new-file markers', () => {
    const raw = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+export const x = 1;
`;
    const diffs = parseDiffOutput(raw, 'feature/x');
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.kind).toBe('ADDED');
    expect(diffs[0]?.additions).toBe(1);
  });
});
