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
 *   - 1 ConflictFinding of category 'BUSINESS_RULE', severity 'HIGH'
 *   - status: 'FAIL'
 */
import type { ChangedFile, FeatureRequest, RepositorySource } from '@mergemind/domain';

export const DEMO_FEATURE_REQUEST: FeatureRequest = {
  id: 'demo-req-001',
  title: 'Add organization billing',
  description: 'Add organization billing. Only organization owners can manage subscriptions.',
  acceptanceCriteria: [
    { key: 'AC-1', description: 'Only organization owners can manage subscriptions.' },
    { key: 'AC-2', description: 'Organization billing respects the role system.' },
  ],
  rules: [
    'Only organization owners can manage subscriptions',
    'Organization billing must respect the role system',
  ],
  tags: ['billing', 'permissions', 'demo'],
  createdAt: '2024-08-01T12:00:00.000Z',
  submittedBy: 'demo@example.com',
};

export const DEMO_AUTH_DIFF: ChangedFile = {
  path: 'src/auth/roles.ts',
  kind: 'MODIFIED',
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
  additions: 1,
  deletions: 1,
  branchName: 'feature/auth-roles-owner',
  language: 'typescript',
};

export const DEMO_BILLING_DIFF: ChangedFile = {
  path: 'src/billing/permissions.ts',
  kind: 'ADDED',
  patch: `diff --git a/src/billing/permissions.ts b/src/billing/permissions.ts
new file mode 100644
index 0000000..1111111
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
  additions: 3,
  deletions: 0,
  branchName: 'feature/billing-subscriptions',
  language: 'typescript',
};

const BASE_SHA = '0000000000000000000000000000000000000000';
const AUTH_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BILLING_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

export const DEMO_REPOSITORY: RepositorySource = {
  id: 'demo-repo-001',
  name: 'acme-platform',
  cloneUrl: 'https://github.com/acme/acme-platform',
  provider: 'github',
  baseBranch: { name: 'main', sha: BASE_SHA },
  featureBranches: [
    { name: 'feature/auth-roles-owner', sha: AUTH_SHA },
    { name: 'feature/billing-subscriptions', sha: BILLING_SHA },
  ],
  resolvedAt: '2024-08-01T12:00:00.000Z',
};

/**
 * Full scenario object — use this to pre-populate the VerifyForm.
 */
export const DEMO_SCENARIO = {
  featureRequest: DEMO_FEATURE_REQUEST,
  repositorySource: DEMO_REPOSITORY,
  changedFiles: [DEMO_AUTH_DIFF, DEMO_BILLING_DIFF],
};
