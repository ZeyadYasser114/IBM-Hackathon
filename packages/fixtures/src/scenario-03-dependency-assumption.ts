/**
 * scenario-03-dependency-assumption.ts
 *
 * SCENARIO 3 — Dependency assumption mismatch
 * ─────────────────────────────────────────────────────────────────────────────
 * Original requirement
 *   "Allow users to sign up with only a username and password (email optional).
 *    The notification service must continue to send welcome emails to new users."
 *
 * What each parallel branch did
 *   Branch A (feature/optional-email-signup)
 *     – Made email optional in the User model and in the registration handler
 *       to support username-only signup.  The User type now carries
 *       email?: string (optional field).
 *
 *   Branch B (feature/welcome-email)
 *     – Added a welcome-email notification step triggered on new-user
 *       registration.  It was built against the old User model where email
 *       was guaranteed to be present, so it accesses user.email directly
 *       without a null/undefined guard.
 *
 * Why Git is silent
 *   Branch A touches src/users/model.ts and src/users/register.ts.
 *   Branch B touches src/notifications/welcome-email.ts.
 *   No textual overlap — clean merge.
 *
 * Contradiction
 *   After merge, a user who registers with username only triggers the welcome-
 *   email flow, which accesses user.email without checking for undefined.  At
 *   runtime this either sends an email to "undefined" or throws "Cannot read
 *   properties of undefined".  The TypeScript compiler catches it only if
 *   strict + exactOptionalPropertyTypes is on — but the notification module
 *   currently annotates the parameter as User (not the updated optional version).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ScenarioFixture } from './types.js';

// ---------------------------------------------------------------------------
// Base-branch files (common ancestor)
// ---------------------------------------------------------------------------

const BASE_MODEL_TS = `\
/**
 * Core User model.
 */
export interface User {
  id: string;
  username: string;
  /** Required: every user must have an email address */
  email: string;
  createdAt: string;
}
`;

const BASE_REGISTER_TS = `\
import type { User } from './model.js';

export interface RegistrationInput {
  username: string;
  email: string;
  passwordHash: string;
}

export function buildUser(input: RegistrationInput): User {
  return {
    id: crypto.randomUUID(),
    username: input.username,
    email: input.email,
    createdAt: new Date().toISOString(),
  };
}
`;

const BASE_WELCOME_TS = `\
// Stub — welcome-email not yet implemented
`;

// ---------------------------------------------------------------------------
// Branch A — optional-email-signup
// ---------------------------------------------------------------------------

const BRANCH_A_MODEL_TS = `\
/**
 * Core User model.
 * email is now optional to support username-only registration.
 */
export interface User {
  id: string;
  username: string;
  /** Optional: users may register without an email address */
  email?: string;
  createdAt: string;
}
`;

const BRANCH_A_REGISTER_TS = `\
import type { User } from './model.js';

export interface RegistrationInput {
  username: string;
  email?: string;        // optional — username-only signup supported
  passwordHash: string;
}

export function buildUser(input: RegistrationInput): User {
  return {
    id: crypto.randomUUID(),
    username: input.username,
    ...(input.email !== undefined ? { email: input.email } : {}),
    createdAt: new Date().toISOString(),
  };
}
`;

const PATCH_A = `\
--- a/src/users/model.ts
+++ b/src/users/model.ts
@@ -3,7 +3,8 @@
  */
 export interface User {
   id: string;
   username: string;
-  /** Required: every user must have an email address */
-  email: string;
+  /** Optional: users may register without an email address */
+  email?: string;
   createdAt: string;
 }
--- a/src/users/register.ts
+++ b/src/users/register.ts
@@ -3,7 +3,7 @@ import type { User } from './model.js';
 export interface RegistrationInput {
   username: string;
-  email: string;
+  email?: string;        // optional — username-only signup supported
   passwordHash: string;
 }
 
@@ -12,7 +12,7 @@ export function buildUser(input: RegistrationInput): User {
     id: crypto.randomUUID(),
     username: input.username,
-    email: input.email,
+    ...(input.email !== undefined ? { email: input.email } : {}),
     createdAt: new Date().toISOString(),
   };
 }
`;

// ---------------------------------------------------------------------------
// Branch B — welcome-email
// ---------------------------------------------------------------------------

const BRANCH_B_WELCOME_TS = `\
import type { User } from '../users/model.js';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Builds the welcome email for a newly registered user.
 *
 * DEPENDENCY BUG: assumes user.email is always defined.
 * Branch A made email optional — after merge this is potentially undefined.
 */
export function buildWelcomeEmail(user: User): EmailMessage {
  return {
    to: user.email,           // BUG: user.email may be undefined after Branch A's change
    subject: 'Welcome to the platform!',
    body: \`Hi \${user.username}, thanks for joining us!\`,
  };
}

export function sendWelcomeEmail(user: User, send: (msg: EmailMessage) => void): void {
  const msg = buildWelcomeEmail(user);
  send(msg);
}
`;

const PATCH_B = `\
--- a/src/notifications/welcome-email.ts
+++ b/src/notifications/welcome-email.ts
@@ -1 +1,24 @@
-// Stub — welcome-email not yet implemented
+import type { User } from '../users/model.js';
+
+export interface EmailMessage {
+  to: string;
+  subject: string;
+  body: string;
+}
+
+/**
+ * Builds the welcome email for a newly registered user.
+ *
+ * DEPENDENCY BUG: assumes user.email is always defined.
+ * Branch A made email optional — after merge this is potentially undefined.
+ */
+export function buildWelcomeEmail(user: User): EmailMessage {
+  return {
+    to: user.email,           // BUG: user.email may be undefined after Branch A's change
+    subject: 'Welcome to the platform!',
+    body: \`Hi \${user.username}, thanks for joining us!\`,
+  };
+}
+
+export function sendWelcomeEmail(user: User, send: (msg: EmailMessage) => void): void {
+  const msg = buildWelcomeEmail(user);
+  send(msg);
+}
`;

// ---------------------------------------------------------------------------
// Canonical VerificationResult
// ---------------------------------------------------------------------------

export const scenario03DependencyAssumption: ScenarioFixture = {
  id: 'scenario-03-dependency-assumption',
  title: 'Email nullability mismatch: optional in model, required by notification service',
  originalRequirement:
    'Allow users to sign up with only a username and password (email optional). ' +
    'The notification service must continue to send welcome emails to new users.',
  conflictCategory: 'DEPENDENCY',

  baseFiles: [
    { path: 'src/users/model.ts', content: BASE_MODEL_TS },
    { path: 'src/users/register.ts', content: BASE_REGISTER_TS },
    { path: 'src/notifications/welcome-email.ts', content: BASE_WELCOME_TS },
  ],

  branches: [
    {
      name: 'feature/optional-email-signup',
      changedFiles: [
        { path: 'src/users/model.ts', content: BRANCH_A_MODEL_TS },
        { path: 'src/users/register.ts', content: BRANCH_A_REGISTER_TS },
      ],
      patch: PATCH_A,
    },
    {
      name: 'feature/welcome-email',
      changedFiles: [{ path: 'src/notifications/welcome-email.ts', content: BRANCH_B_WELCOME_TS }],
      patch: PATCH_B,
    },
  ],

  expectedContradiction:
    'Branch feature/optional-email-signup changed User.email from required (string) to ' +
    'optional (string | undefined) in src/users/model.ts. Branch feature/welcome-email ' +
    'builds a welcome email using user.email as the "to" address in ' +
    'src/notifications/welcome-email.ts, with no undefined guard. After merge a username-only ' +
    'registrant triggers the welcome-email flow, which passes undefined as the recipient — ' +
    'the email is sent to the string "undefined" or the mailer throws a type error at runtime.',

  expectedAffectedFiles: [
    'src/notifications/welcome-email.ts',
    'src/users/model.ts',
    'src/users/register.ts',
  ],

  expectedAffectedComponents: ['users', 'notifications'],

  canonicalResult: {
    id: 'c3d4e5f6-a7b8-4c9d-0e1f-a2b3c4d5e6f9',
    schemaVersion: '1.0.0',
    featureRequest: {
      id: 'd4e5f6a7-b8c9-4d0e-1f2a-b3c4d5e6f7aa',
      title: 'Optional email signup + welcome email',
      description:
        'Allow users to sign up with only a username and password (email optional). ' +
        'The notification service must continue to send welcome emails to new users.',
      acceptanceCriteria: [
        { key: 'AC-1', description: 'Users can register with only a username and password.' },
        { key: 'AC-2', description: 'A welcome email is sent to users who provide an email.' },
        {
          key: 'AC-3',
          description: 'No runtime error occurs when a user registers without an email.',
        },
      ],
      rules: [
        'email is optional on registration',
        'welcome email must only be sent when an email address is available',
      ],
      tags: ['users', 'notifications', 'email', 'nullability'],
      createdAt: '2024-08-03T09:00:00.000Z',
      submittedBy: 'demo@example.com',
    },
    repositorySource: {
      id: 'e5f6a7b8-c9d0-4e1f-2a3b-c4d5e6f7a8bb',
      name: 'acme-platform',
      cloneUrl: 'https://github.com/acme-demo/acme-platform',
      provider: 'github',
      baseBranch: {
        name: 'main',
        sha: '2222222222222222222222222222222222222222',
      },
      featureBranches: [
        {
          name: 'feature/optional-email-signup',
          sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        },
        {
          name: 'feature/welcome-email',
          sha: 'ffffffffffffffffffffffffffffffffffffffff',
        },
      ],
      resolvedAt: '2024-08-03T09:00:00.000Z',
    },
    status: 'FAIL',
    startedAt: '2024-08-03T09:00:00.000Z',
    completedAt: '2024-08-03T09:05:00.000Z',
    assumptions: [
      {
        id: 'f6a7b8c9-d0e1-4f2a-3b4c-d5e6f7a8b9cc',
        branchName: 'feature/optional-email-signup',
        sourceFile: 'src/users/model.ts',
        statement: 'User.email is optional — a user may exist without an email address',
        concept: 'user-email-nullability',
        value: 'string | undefined',
        sourceAgent: 'intent',
        evidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/users/model.ts',
            lineStart: 8,
            lineEnd: 8,
            snippet: '  email?: string;',
            branchName: 'feature/optional-email-signup',
            metadata: { symbolKind: 'PropertySignature', symbolName: 'email' },
          },
        ],
        confidence: 'HIGH',
        numericConfidence: 0.97,
        relatedAssumptionIds: ['a7b8c9d0-e1f2-4a3b-4c5d-e6f7a8b9c0dd'],
        extractedAt: '2024-08-03T09:01:00.000Z',
      },
      {
        id: 'a7b8c9d0-e1f2-4a3b-4c5d-e6f7a8b9c0dd',
        branchName: 'feature/welcome-email',
        sourceFile: 'src/notifications/welcome-email.ts',
        statement: 'buildWelcomeEmail assumes user.email is always a defined string',
        concept: 'user-email-nullability',
        value: 'string (required)',
        sourceAgent: 'dependency',
        evidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/notifications/welcome-email.ts',
            lineStart: 16,
            lineEnd: 16,
            snippet: '    to: user.email,',
            branchName: 'feature/welcome-email',
            metadata: { symbolKind: 'FunctionDeclaration', symbolName: 'buildWelcomeEmail' },
          },
        ],
        confidence: 'HIGH',
        numericConfidence: 0.95,
        relatedAssumptionIds: ['f6a7b8c9-d0e1-4f2a-3b4c-d5e6f7a8b9cc'],
        extractedAt: '2024-08-03T09:02:00.000Z',
      },
      {
        id: 'b8c9d0e1-f2a3-4b4c-5d6e-f7a8b9c0d1ee',
        branchName: 'feature/optional-email-signup',
        sourceFile: 'src/users/register.ts',
        statement: 'buildUser only sets email when input.email is not undefined',
        concept: 'user-email-nullability',
        value: 'conditionally present',
        sourceAgent: 'intent',
        evidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/users/register.ts',
            lineStart: 12,
            lineEnd: 12,
            snippet: '    ...(input.email !== undefined ? { email: input.email } : {}),',
            branchName: 'feature/optional-email-signup',
            metadata: { symbolKind: 'FunctionDeclaration', symbolName: 'buildUser' },
          },
        ],
        confidence: 'HIGH',
        numericConfidence: 0.93,
        relatedAssumptionIds: [
          'f6a7b8c9-d0e1-4f2a-3b4c-d5e6f7a8b9cc',
          'a7b8c9d0-e1f2-4a3b-4c5d-e6f7a8b9c0dd',
        ],
        extractedAt: '2024-08-03T09:01:30.000Z',
      },
    ],
    conflicts: [
      {
        id: 'c9d0e1f2-a3b4-4c5d-6e7f-a8b9c0d1e2ff',
        title: 'User.email nullability: optional in model, required by notification service',
        description:
          'feature/optional-email-signup made User.email optional (src/users/model.ts:8) to ' +
          'support username-only registration. feature/welcome-email accesses user.email ' +
          'directly as the recipient address with no undefined guard ' +
          '(src/notifications/welcome-email.ts:16). After merge a user who registers without ' +
          'an email triggers the welcome-email flow, which sends to the address "undefined" or ' +
          'throws at runtime. The requirement itself is contradictory — AC-2 and AC-3 cannot ' +
          'both be satisfied without an explicit email-present guard in the notification path.',
        severity: 'HIGH',
        category: 'DEPENDENCY',
        affectedAssumptionIds: [
          'f6a7b8c9-d0e1-4f2a-3b4c-d5e6f7a8b9cc',
          'a7b8c9d0-e1f2-4a3b-4c5d-e6f7a8b9c0dd',
          'b8c9d0e1-f2a3-4b4c-5d6e-f7a8b9c0d1ee',
        ],
        affectedFiles: [
          'src/notifications/welcome-email.ts',
          'src/users/model.ts',
          'src/users/register.ts',
        ],
        conflictEvidence: [
          {
            source: 'SOURCE_CODE',
            filePath: 'src/notifications/welcome-email.ts',
            lineStart: 16,
            lineEnd: 18,
            snippet:
              '  return {\n' +
              '    to: user.email,  // undefined when email not provided\n' +
              "    subject: 'Welcome to the platform!',",
            branchName: 'feature/welcome-email',
            metadata: {},
          },
          {
            source: 'SOURCE_CODE',
            filePath: 'src/users/model.ts',
            lineStart: 7,
            lineEnd: 9,
            snippet:
              '  /** Optional: users may register without an email address */\n' +
              '  email?: string;\n' +
              '  createdAt: string;',
            branchName: 'feature/optional-email-signup',
            metadata: {},
          },
        ],
        proposedResolution: null,
        resolvedAt: null,
      },
    ],
    summary: {
      assumptionsFound: 3,
      conflictsFound: 1,
      conflictsResolved: 0,
      filesChanged: 3,
      requirementCoverage: 33,
      conflictsBySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
    },
    errorMessage: null,
  },
};
