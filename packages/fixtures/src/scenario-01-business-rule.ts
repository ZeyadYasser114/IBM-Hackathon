/**
 * scenario-01-business-rule.ts
 *
 * SCENARIO 1 — Business-rule mismatch
 * ─────────────────────────────────────────────────────────────────────────────
 * Original requirement
 *   "Add organisation billing. Only organisation owners may manage subscriptions."
 *
 * What each parallel branch did
 *   Branch A (feature/auth-roles-owner)
 *     – Renamed the privileged role from 'admin' to 'owner' in the auth module.
 *       This makes the role model self-documenting and aligns with the requirement.
 *
 *   Branch B (feature/billing-subscriptions)
 *     – Added the subscription-management gate, but hard-coded the check against
 *       the OLD role name 'admin'.  The two agents were working in parallel, so
 *       Branch B never saw Branch A's rename.
 *
 * Why Git is silent
 *   The files live in different directories; there is no textual overlap.
 *   `git merge` produces a clean commit.
 *
 * Contradiction
 *   After merge, `canManageSubscription` always returns false for every owner
 *   because it checks `user.role === 'admin'` but no user can ever have the
 *   role 'admin' — that string was removed by Branch A.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ScenarioFixture } from './types.js';

// ---------------------------------------------------------------------------
// Base-branch files (common ancestor)
// ---------------------------------------------------------------------------

const BASE_ROLES_TS = `\
export type Role = 'admin' | 'member';

const PRIVILEGED_ROLE: Role = 'admin';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export function isPrivileged(role: Role): boolean {
  return role === PRIVILEGED_ROLE;
}
`;

const BASE_PERMISSIONS_TS = `\
import type { User } from '../auth/roles.js';

// TODO: implement subscription permission gate
export function canManageSubscription(_user: User): boolean {
  return false;
}
`;

// ---------------------------------------------------------------------------
// Branch A — auth-roles-owner
// ---------------------------------------------------------------------------

const BRANCH_A_ROLES_TS = `\
export type Role = 'owner' | 'member';

// Renamed from 'admin' → 'owner' to match the requirement
const PRIVILEGED_ROLE: Role = 'owner';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export function isPrivileged(role: Role): boolean {
  return role === PRIVILEGED_ROLE;
}
`;

const PATCH_A = `\
--- a/src/auth/roles.ts
+++ b/src/auth/roles.ts
@@ -1,6 +1,7 @@
-export type Role = 'admin' | 'member';
+export type Role = 'owner' | 'member';
 
-const PRIVILEGED_ROLE: Role = 'admin';
+// Renamed from 'admin' → 'owner' to match the requirement
+const PRIVILEGED_ROLE: Role = 'owner';
 
 export interface User {
   id: string;
`;

// ---------------------------------------------------------------------------
// Branch B — billing-subscriptions
// ---------------------------------------------------------------------------

const BRANCH_B_PERMISSIONS_TS = `\
import type { User } from '../auth/roles.js';

/**
 * Returns true if the user is allowed to manage organisation subscriptions.
 * Requirement: only organisation owners may manage subscriptions.
 */
export function canManageSubscription(user: User): boolean {
  // BUG: checks 'admin' but Branch A renamed the privileged role to 'owner'
  return user.role === 'admin';
}

export function manageSubscription(user: User): void {
  if (!canManageSubscription(user)) {
    throw new Error('Unauthorised: only organisation owners can manage subscriptions');
  }
  // ... subscription management logic ...
}
`;

const PATCH_B = `\
--- a/src/billing/permissions.ts
+++ b/src/billing/permissions.ts
@@ -1,5 +1,17 @@
 import type { User } from '../auth/roles.js';
 
-// TODO: implement subscription permission gate
-export function canManageSubscription(_user: User): boolean {
-  return false;
+/**
+ * Returns true if the user is allowed to manage organisation subscriptions.
+ * Requirement: only organisation owners may manage subscriptions.
+ */
+export function canManageSubscription(user: User): boolean {
+  // BUG: checks 'admin' but Branch A renamed the privileged role to 'owner'
+  return user.role === 'admin';
+}
+
+export function manageSubscription(user: User): void {
+  if (!canManageSubscription(user)) {
+    throw new Error('Unauthorised: only organisation owners can manage subscriptions');
+  }
+  // ... subscription management logic ...
 }
`;

// ---------------------------------------------------------------------------
// Canonical VerificationResult
// ---------------------------------------------------------------------------

export const scenario01BusinessRule: ScenarioFixture = {
  id: 'scenario-01-business-rule',
  title: 'Privileged-role name mismatch (owner vs admin)',
  originalRequirement:
    'Add organisation billing. Only organisation owners may manage subscriptions.',
  conflictCategory: 'BUSINESS_RULE',

  baseFiles: [
    { path: 'src/auth/roles.ts', content: BASE_ROLES_TS },
    { path: 'src/billing/permissions.ts', content: BASE_PERMISSIONS_TS },
  ],

  branches: [
    {
      name: 'feature/auth-roles-owner',
      changedFiles: [{ path: 'src/auth/roles.ts', content: BRANCH_A_ROLES_TS }],
      patch: PATCH_A,
    },
    {
      name: 'feature/billing-subscriptions',
      changedFiles: [{ path: 'src/billing/permissions.ts', content: BRANCH_B_PERMISSIONS_TS }],
      patch: PATCH_B,
    },
  ],

  expectedContradiction:
    'Branch feature/auth-roles-owner renamed the privileged role from "admin" to "owner" ' +
    '(src/auth/roles.ts). Branch feature/billing-subscriptions gates subscription management ' +
    'on user.role === "admin" (src/billing/permissions.ts). After merge the string "admin" ' +
    'no longer exists as a valid Role, so canManageSubscription always returns false — every ' +
    'organisation owner is silently locked out of managing subscriptions.',

  expectedAffectedFiles: ['src/auth/roles.ts', 'src/billing/permissions.ts'],

  expectedAffectedComponents: ['auth', 'billing'],

  canonicalResult: {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
    schemaVersion: '1.0.0',
    featureRequest: {
      id: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
      title: 'Add organisation billing',
      description: 'Add organisation billing. Only organisation owners may manage subscriptions.',
      acceptanceCriteria: [
        { key: 'AC-1', description: 'Only organisation owners can manage subscriptions.' },
        { key: 'AC-2', description: 'Billing respects the role system defined in auth.' },
      ],
      rules: [
        'Only organisation owners can manage subscriptions',
        'Billing must use the role name defined by the auth module',
      ],
      tags: ['billing', 'permissions', 'roles'],
      createdAt: '2024-08-01T09:00:00.000Z',
      submittedBy: 'demo@example.com',
    },
    repositorySource: {
      id: 'c3d4e5f6-a7b8-4c9d-0e1f-a2b3c4d5e6f7',
      name: 'acme-platform',
      cloneUrl: 'https://github.com/acme-demo/acme-platform',
      provider: 'github',
      baseBranch: {
        name: 'main',
        sha: '0000000000000000000000000000000000000000',
      },
      featureBranches: [
        {
          name: 'feature/auth-roles-owner',
          sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        {
          name: 'feature/billing-subscriptions',
          sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
      ],
      resolvedAt: '2024-08-01T09:00:00.000Z',
    },
    status: 'FAIL',
    startedAt: '2024-08-01T09:00:00.000Z',
    completedAt: '2024-08-01T09:05:00.000Z',
    assumptions: [
      {
        id: 'd4e5f6a7-b8c9-4d0e-1f2a-b3c4d5e6f7a8',
        branchName: 'feature/auth-roles-owner',
        sourceFile: 'src/auth/roles.ts',
        statement: "The privileged organisation role is 'owner'",
        concept: 'privileged-role-name',
        value: "'owner'",
        sourceAgent: 'intent',
        evidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/auth/roles.ts',
            lineStart: 4,
            lineEnd: 4,
            snippet: "const PRIVILEGED_ROLE: Role = 'owner';",
            branchName: 'feature/auth-roles-owner',
            metadata: { symbolKind: 'VariableDeclaration', symbolName: 'PRIVILEGED_ROLE' },
          },
        ],
        confidence: 'HIGH',
        numericConfidence: 0.97,
        relatedAssumptionIds: ['e5f6a7b8-c9d0-4e1f-2a3b-c4d5e6f7a8b9'],
        extractedAt: '2024-08-01T09:01:00.000Z',
      },
      {
        id: 'e5f6a7b8-c9d0-4e1f-2a3b-c4d5e6f7a8b9',
        branchName: 'feature/billing-subscriptions',
        sourceFile: 'src/billing/permissions.ts',
        statement: "Subscription management is allowed when user.role === 'admin'",
        concept: 'privileged-role-name',
        value: "'admin'",
        sourceAgent: 'contract',
        evidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/billing/permissions.ts',
            lineStart: 9,
            lineEnd: 9,
            snippet: "  return user.role === 'admin';",
            branchName: 'feature/billing-subscriptions',
            metadata: {
              symbolKind: 'FunctionDeclaration',
              symbolName: 'canManageSubscription',
            },
          },
        ],
        confidence: 'HIGH',
        numericConfidence: 0.95,
        relatedAssumptionIds: ['d4e5f6a7-b8c9-4d0e-1f2a-b3c4d5e6f7a8'],
        extractedAt: '2024-08-01T09:02:00.000Z',
      },
    ],
    conflicts: [
      {
        id: 'f6a7b8c9-d0e1-4f2a-3b4c-d5e6f7a8b9c0',
        title: 'Privileged role name mismatch: "owner" vs "admin"',
        description:
          'feature/auth-roles-owner defines PRIVILEGED_ROLE as "owner" (src/auth/roles.ts:4), ' +
          'but feature/billing-subscriptions checks user.role === "admin" ' +
          '(src/billing/permissions.ts:9). After merge the string "admin" is not a valid Role ' +
          'value, so canManageSubscription always returns false — every organisation owner is ' +
          'silently locked out of billing.',
        severity: 'HIGH',
        category: 'BUSINESS_RULE',
        affectedAssumptionIds: [
          'd4e5f6a7-b8c9-4d0e-1f2a-b3c4d5e6f7a8',
          'e5f6a7b8-c9d0-4e1f-2a3b-c4d5e6f7a8b9',
        ],
        affectedFiles: ['src/auth/roles.ts', 'src/billing/permissions.ts'],
        conflictEvidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/billing/permissions.ts',
            lineStart: 7,
            lineEnd: 10,
            snippet:
              'export function canManageSubscription(user: User): boolean {\n' +
              "  // BUG: checks 'admin' but Branch A renamed the privileged role to 'owner'\n" +
              "  return user.role === 'admin';\n" +
              '}',
            branchName: 'feature/billing-subscriptions',
            metadata: {},
          },
        ],
        proposedResolution: null,
        resolvedAt: null,
      },
    ],
    summary: {
      assumptionsFound: 2,
      conflictsFound: 1,
      conflictsResolved: 0,
      filesChanged: 2,
      requirementCoverage: 50,
      conflictsBySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
    },
    errorMessage: null,
  },
};
