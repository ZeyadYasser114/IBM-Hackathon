/**
 * ingest-example.ts
 *
 * Demonstrates the full git-ingest pipeline:
 *   diff text input → normalized ChangedFile + CodeEvidence output
 *
 * Run with (from the repo root):
 *   pnpm --filter @mergemind/git-ingest example
 *
 * (Compiles src + examples to the gitignored dist-examples/ dir and runs it.
 * examples/ is excluded from the package tsconfig so demo code never ships
 * in dist/.)
 *
 * No AI, no semantic analysis — purely deterministic ingestion.
 */

import {
  PastedDiffAdapter,
  createRepositoryContext,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Scenario: two feature branches both touch auth/billing
// ---------------------------------------------------------------------------

/** The diff produced by feature/auth-rbac — changes PRIVILEGED_ROLE to 'owner' */
const AUTH_DIFF = `\
diff --git a/src/auth/roles.ts b/src/auth/roles.ts
index abc1234..def5678 100644
--- a/src/auth/roles.ts
+++ b/src/auth/roles.ts
@@ -10,7 +10,7 @@ export type Role = 'owner' | 'member';
 
 // Auth agent updated this from 'admin' to 'owner'
-const PRIVILEGED_ROLE: Role = 'admin';
+const PRIVILEGED_ROLE: Role = 'owner';
 
 export function isPrivileged(role: Role): boolean {
   return role === PRIVILEGED_ROLE;
diff --git a/src/audit/logger.ts b/src/audit/logger.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/audit/logger.ts
@@ -0,0 +1,3 @@
+export function auditLog(event: string, payload: unknown): void {
+  console.log('[AUDIT]', event, JSON.stringify(payload));
+}
`;

/** The diff produced by feature/billing-service — checks for 'admin' (the conflict) */
const BILLING_DIFF = `\
diff --git a/src/billing/permissions.ts b/src/billing/permissions.ts
index aaa0000..bbb1111 100644
--- a/src/billing/permissions.ts
+++ b/src/billing/permissions.ts
@@ -14,7 +14,7 @@ import type { User } from '../auth/roles.js';
 
 // Billing agent wrote 'admin' — should have used 'owner'
 export function canManageSubscription(user: User): boolean {
-  return user.role === 'owner';
+  return user.role === 'admin';
 }
diff --git a/public/logo.png b/public/logo.png
index abc1234..fed5678 100644
Binary files a/public/logo.png and b/public/logo.png differ
`;

async function main() {
  console.log('='.repeat(60));
  console.log('MergeMind git-ingest — deterministic ingestion example');
  console.log('='.repeat(60));
  console.log();

  // ---------------------------------------------------------------------------
  // Step 1: Create adapters for each branch's diff text
  // ---------------------------------------------------------------------------

  const authAdapter = new PastedDiffAdapter(AUTH_DIFF, 'feature/auth-rbac', 'main');
  const billingAdapter = new PastedDiffAdapter(BILLING_DIFF, 'feature/billing-service', 'main');

  console.log(`Auth branch files parsed:    ${authAdapter.fileCount}`);
  console.log(`Billing branch files parsed: ${billingAdapter.fileCount}`);
  console.log();

  // ---------------------------------------------------------------------------
  // Step 2: Run createRepositoryContext for each branch
  // ---------------------------------------------------------------------------

  const authResult = await createRepositoryContext(
    authAdapter,
    { name: 'acme/platform', cloneUrl: 'https://github.com/acme/platform', provider: 'github' },
    'main',
    ['feature/auth-rbac'],
  );

  const billingResult = await createRepositoryContext(
    billingAdapter,
    { name: 'acme/platform', cloneUrl: 'https://github.com/acme/platform', provider: 'github' },
    'main',
    ['feature/billing-service'],
  );

  // ---------------------------------------------------------------------------
  // Step 3: Inspect normalized ChangedFile output
  // ---------------------------------------------------------------------------

  console.log('--- ChangedFile records ---');
  for (const f of [...authResult.changedFiles, ...billingResult.changedFiles]) {
    const rename = f.previousPath ? ` (was: ${f.previousPath})` : '';
    const binary = f.patch === null ? ' [binary/no-patch]' : '';
    console.log(`  [${f.kind.padEnd(8)}] ${f.path}${rename}${binary}`);
    console.log(`             branch: ${f.branchName}  +${f.additions}/-${f.deletions}  lang: ${f.language ?? 'unknown'}`);
  }
  console.log();

  // ---------------------------------------------------------------------------
  // Step 4: Inspect CodeEvidence output
  // ---------------------------------------------------------------------------

  console.log('--- CodeEvidence records ---');
  const allEvidence = [...authResult.evidence, ...billingResult.evidence];
  for (const e of allEvidence) {
    const lines =
      e.lineStart !== null
        ? `L${e.lineStart}${e.lineEnd !== e.lineStart ? `–${e.lineEnd}` : ''}`
        : 'no-lines';
    const snippet = e.snippet?.split('\n')[0]?.trim().slice(0, 50) ?? '(no snippet)';
    console.log(`  [${e.source}]  ${e.filePath}  @${lines}`);
    console.log(`    branch: ${e.branchName}`);
    console.log(`    snippet: ${snippet}`);
    if (Object.keys(e.metadata).length) {
      console.log(`    metadata: ${JSON.stringify(e.metadata)}`);
    }
    console.log();
  }

  // ---------------------------------------------------------------------------
  // Step 5: Show RepositorySource summary
  // ---------------------------------------------------------------------------

  console.log('--- RepositorySource (auth branch) ---');
  const src = authResult.source;
  console.log(`  name:       ${src.name}`);
  console.log(`  provider:   ${src.provider}`);
  console.log(`  base:       ${src.baseBranch.name} @ ${src.baseBranch.sha}`);
  console.log(`  features:   ${src.featureBranches.map((b) => b.name).join(', ')}`);
  console.log(`  resolvedAt: ${src.resolvedAt}`);
  console.log();

  // ---------------------------------------------------------------------------
  // Step 6: Summary counts
  // ---------------------------------------------------------------------------

  const totalFiles = authResult.changedFiles.length + billingResult.changedFiles.length;
  const totalEvidence = allEvidence.length;
  // Opaque records (null snippet) cover binary files and files without a
  // usable patch. The opaque path cannot distinguish the two, so they are
  // reported together rather than as "binary".
  const opaqueRecords = allEvidence.filter((e) => e.snippet === null).length;

  console.log('--- Summary ---');
  console.log(`  Total changed files:    ${totalFiles}`);
  console.log(`  Total evidence records: ${totalEvidence}`);
  console.log(`  Opaque records (binary/no patch): ${opaqueRecords}`);
  console.log(`  Text hunk records:      ${totalEvidence - opaqueRecords}`);
  console.log();
  console.log('Ingestion complete. No AI was called. No semantic decisions were made.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
