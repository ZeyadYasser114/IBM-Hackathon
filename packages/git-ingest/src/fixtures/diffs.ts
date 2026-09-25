/**
 * fixtures/diffs.ts
 *
 * Canonical diff string fixtures for git-ingest tests.
 * All fixtures use consistent SHA-like values and realistic file paths
 * so tests are readable and self-documenting.
 */

// ---------------------------------------------------------------------------
// MODIFIED — two files edited, one hunk each
// ---------------------------------------------------------------------------
export const MODIFIED_TWO_FILES = `\
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
`;

// ---------------------------------------------------------------------------
// ADDED — new file
// ---------------------------------------------------------------------------
export const ADDED_NEW_FILE = `\
diff --git a/src/audit/logger.ts b/src/audit/logger.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/audit/logger.ts
@@ -0,0 +1,5 @@
+export function auditLog(event: string, payload: unknown): void {
+  console.log('[AUDIT]', event, JSON.stringify(payload));
+}
`;

// ---------------------------------------------------------------------------
// DELETED — file removed
// ---------------------------------------------------------------------------
export const DELETED_FILE = `\
diff --git a/src/legacy/old-auth.ts b/src/legacy/old-auth.ts
deleted file mode 100644
index aaabbbc..0000000
--- a/src/legacy/old-auth.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-// deprecated
-export function oldAuth() {}
`;

// ---------------------------------------------------------------------------
// RENAMED — file renamed, no content change
// ---------------------------------------------------------------------------
export const RENAMED_NO_CONTENT = `\
diff --git a/src/auth/middleware.ts b/src/auth/guards.ts
similarity index 100%
rename from src/auth/middleware.ts
rename to src/auth/guards.ts
`;

// ---------------------------------------------------------------------------
// RENAMED — file renamed with content change
// ---------------------------------------------------------------------------
export const RENAMED_WITH_CONTENT = `\
diff --git a/src/auth/middleware.ts b/src/auth/guards.ts
similarity index 80%
rename from src/auth/middleware.ts
rename to src/auth/guards.ts
index abc1234..fed9876 100644
--- a/src/auth/middleware.ts
+++ b/src/auth/guards.ts
@@ -1,4 +1,5 @@
 export function authGuard() {
-  return true;
+  // improved guard
+  return validate();
 }
`;

// ---------------------------------------------------------------------------
// BINARY — image file changed
// ---------------------------------------------------------------------------
export const BINARY_FILE = `\
diff --git a/public/logo.png b/public/logo.png
index abc1234..fed5678 100644
Binary files a/public/logo.png and b/public/logo.png differ
`;

// ---------------------------------------------------------------------------
// MULTI-HUNK — one file with multiple hunks
// ---------------------------------------------------------------------------
export const MULTI_HUNK = `\
diff --git a/src/billing/service.ts b/src/billing/service.ts
index aaabbbc..dddeeef 100644
--- a/src/billing/service.ts
+++ b/src/billing/service.ts
@@ -5,7 +5,7 @@ import { canManageSubscription } from './permissions.js';
 
 export class BillingService {
   subscribe(userId: string): void {
-    console.log('subscribing', userId);
+    console.log('subscribe:', userId);
   }
 
@@ -20,7 +20,7 @@ export class BillingService {
   }
 
   cancel(userId: string): void {
-    console.log('cancelling', userId);
+    console.log('cancel:', userId);
   }
 }
`;

// ---------------------------------------------------------------------------
// EMPTY — empty string
// ---------------------------------------------------------------------------
export const EMPTY_DIFF = '';

// ---------------------------------------------------------------------------
// WHITESPACE_ONLY — spaces/newlines, no actual diff content
// ---------------------------------------------------------------------------
export const WHITESPACE_ONLY = '   \n\n  \t\n';

// ---------------------------------------------------------------------------
// MALFORMED — no "diff --git" header
// ---------------------------------------------------------------------------
export const MALFORMED_NO_HEADER = `\
This is not a diff at all.
Just some random text.
`;

// ---------------------------------------------------------------------------
// MALFORMED — partial header (truncated mid-diff)
// ---------------------------------------------------------------------------
export const MALFORMED_TRUNCATED = `\
diff --git a/src/foo.ts b/src/foo.ts
`;
