/**
 * Demo fixture: the auth/billing role conflict scenario.
 *
 * This is the canonical demo repository state used during the hackathon demo.
 * It models a real semantic conflict that Git cannot detect:
 *
 *   - Auth branch:    PRIVILEGED_ROLE = 'owner'
 *   - Billing branch: if (user.role === 'admin') { manageSubscription() }
 *
 * Both branches compile. Git reports clean merge. MergeMind finds HIGH severity
 * semantic conflict.
 *
 * Usage:
 *   import { DEMO_SCENARIO } from '@/fixtures/demo-scenario';
 *   // Pre-populate the VerifyForm or write a test
 *
 * EXTENSION POINT
 * ---------------
 * The conflict detection branch should use this scenario as the reference
 * test case — the expected output is:
 *   - 2 Assumptions extracted
 *   - 1 SemanticConflict of class 'business-rule', severity 'HIGH'
 *   - status: 'FAIL'
 */
import type { FeatureRequirement, FileDiff, RepositoryContext } from '@mergemind/domain';

export const DEMO_REQUIREMENT: FeatureRequirement = {
  id: 'req-demo-001',
  description:
    'Add organization billing. Only organization owners can manage subscriptions.',
  rules: [
    'Only organization owners can manage subscriptions',
    'Organization billing must respect the role system',
  ],
};

export const DEMO_AUTH_DIFF: FileDiff = {
  path: 'src/auth/roles.ts',
  additions: 1,
  deletions: 1,
  patch: `diff --git a/src/auth/roles.ts b/src/auth/roles.ts
index abc1234..def5678 100644
--- a/src/auth/roles.ts
+++ b/src/auth/roles.ts
@@ -1,5 +1,5 @@
 export type Role = 'owner' | 'member';
-const PRIVILEGED_ROLE = 'admin';
+const PRIVILEGED_ROLE = 'owner';
 
 export function isPrivileged(role: Role): boolean {
   return role === PRIVILEGED_ROLE;
`,
};

export const DEMO_BILLING_DIFF: FileDiff = {
  path: 'src/billing/permissions.ts',
  additions: 3,
  deletions: 0,
  patch: `diff --git a/src/billing/permissions.ts b/src/billing/permissions.ts
index 0000000..1111111 100644
--- /dev/null
+++ b/src/billing/permissions.ts
@@ -0,0 +1,7 @@
+import type { User } from '../auth/roles';
+
+export function canManageSubscription(user: User): boolean {
+  // BUG: should be 'owner', but was written assuming old role name
+  return user.role === 'admin';
+}
`,
};

const BASE_SHA = '0000000000000000000000000000000000000000';
const AUTH_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BILLING_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

export const DEMO_REPOSITORY: RepositoryContext = {
  name: 'acme-platform',
  location: 'https://github.com/acme/acme-platform',
  baseBranch: { name: 'main', sha: BASE_SHA },
  featureBranches: [
    { name: 'feature/auth-roles-owner', sha: AUTH_SHA },
    { name: 'feature/billing-subscriptions', sha: BILLING_SHA },
  ],
  diffs: [DEMO_AUTH_DIFF, DEMO_BILLING_DIFF],
};

/**
 * Full scenario object — use this to pre-populate the VerifyForm.
 */
export const DEMO_SCENARIO = {
  requirement: DEMO_REQUIREMENT,
  repository: DEMO_REPOSITORY,
};
