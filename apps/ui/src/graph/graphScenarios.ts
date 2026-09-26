// ─────────────────────────────────────────────────────────────────────────────
// Graph Scenarios
//
// Three named ConflictGraph fixtures for the demo:
//   1. owner-admin    — BUSINESS_RULE HIGH   (authentication vs billing role)
//   2. user-id-key    — CONTRACT     MEDIUM  (userId vs user_id field name)
//   3. email-optional — DEPENDENCY   MEDIUM  (optional email vs notification service)
//
// Each Conflict now carries confidence, evidenceExcerpts, verificationHint,
// and affectedContract so the detail screen is fully auditable.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ConflictGraph,
  Conflict,
  Assumption,
  EvidenceExcerpt,
} from '@/types/semantic';

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1 — Owner vs Admin (BUSINESS_RULE HIGH, confidence 97)
// ─────────────────────────────────────────────────────────────────────────────

const s1_asmAuth: Assumption = {
  id: 's1-asmp-auth',
  statement: 'Privileged org role is "owner"',
  sourceFile: 'auth/roles.ts',
  sourceLine: '14–18',
  dependsOn: 'User.role',
  producedBy: 'Change Agent',
};

const s1_asmBilling: Assumption = {
  id: 's1-asmp-billing',
  statement: 'Privileged org role is "admin"',
  sourceFile: 'billing/permissions.ts',
  sourceLine: '31–35',
  dependsOn: 'User.role',
  producedBy: 'Change Agent',
};

const s1_evidence: EvidenceExcerpt[] = [
  {
    file:     'feature-request.md',
    location: 'line 3 — original requirement',
    snippet:  '> Only **organization owners** may manage subscriptions.',
    source:   'Intent Agent',
  },
  {
    file:     'auth/roles.ts',
    location: 'lines 14–18 — role assignment',
    snippet:
      "export const ORG_PRIVILEGED_ROLE = 'owner';\n" +
      'User.role = ORG_PRIVILEGED_ROLE;',
    source: 'Change Agent',
  },
  {
    file:     'billing/permissions.ts',
    location: 'line 32 — permission gate',
    snippet:
      "if (user.role === 'admin') {\n" +
      '  return manageSubscription();\n' +
      '}',
    source: 'Adversary Agent',
  },
  {
    file:     'billing/permissions.ts',
    location: 'line 32 — the specific inequality',
    snippet:  "// CONFLICT: 'owner' !== 'admin'\n// No user assigned 'owner' will reach manageSubscription()",
    source:   'Adversary Agent',
  },
];

const s1_conflict: Conflict = {
  id:              's1-conf',
  kind:            'BUSINESS_RULE',
  severity:        'HIGH',
  confidence:      97,
  title:           'Authorization role mismatch: owner vs admin',
  description:
    'The requirement explicitly states that only organization owners may manage subscriptions. ' +
    'The authentication layer correctly establishes "owner" as the privileged role — ' +
    'any user promoted to org admin receives role="owner". ' +
    'However, the billing permission check on line 32 gates access with role === "admin". ' +
    'Because no user is ever assigned role "admin" through this code path, ' +
    'subscription management is completely inaccessible to everyone — ' +
    'including genuine owners. Git merged cleanly and all 42 tests pass, ' +
    'but the feature is silently broken.',
  requirementText:  'Only organization owners may manage subscriptions.',
  affectedContract: 'User.role (the string value of the privileged organization role)',
  assumptionA:      s1_asmAuth,
  assumptionB:      s1_asmBilling,
  affectedFiles:    ['auth/roles.ts', 'billing/permissions.ts'],
  evidenceExcerpts: s1_evidence,
  verificationHint:
    'Open billing/permissions.ts line 32. Confirm the guard reads `user.role === "owner"`. ' +
    'Then add a test: "user with role owner can manage subscription" and ' +
    '"user with role admin cannot manage subscription". ' +
    'Run the test suite — the first test will fail until the fix is applied.',
  resolved:          false,
  proposedResolution:
    'Change billing/permissions.ts line 32 from `user.role === "admin"` to `user.role === "owner"`. ' +
    'Add regression test: "admin cannot manage organization subscription".',
};

export const SCENARIO_OWNER_ADMIN: ConflictGraph = {
  nodes: [
    { id: 's1-req',          kind: 'REQUIREMENT', label: 'Only owners manage subscriptions' },
    { id: 's1-chg-auth',     kind: 'CHANGE',      label: 'Auth update' },
    { id: 's1-chg-billing',  kind: 'CHANGE',      label: 'Billing update' },
    { id: 's1-asmp-auth',    kind: 'ASSUMPTION',  label: 'privileged role = "owner"',  severity: 'HIGH' },
    { id: 's1-asmp-billing', kind: 'ASSUMPTION',  label: 'privileged role = "admin"',  severity: 'HIGH' },
    { id: 's1-file-auth',    kind: 'FILE',         label: 'auth/roles.ts' },
    { id: 's1-file-billing', kind: 'FILE',         label: 'billing/permissions.ts' },
    { id: 's1-conf',         kind: 'CONFLICT',     label: 'Role mismatch',              severity: 'HIGH' },
  ],
  edges: [
    { from: 's1-req',          to: 's1-chg-auth',     label: 'drives' },
    { from: 's1-req',          to: 's1-chg-billing',  label: 'drives' },
    { from: 's1-chg-auth',     to: 's1-asmp-auth',    label: 'produces' },
    { from: 's1-chg-billing',  to: 's1-asmp-billing', label: 'produces' },
    { from: 's1-asmp-auth',    to: 's1-file-auth',    label: 'in' },
    { from: 's1-asmp-billing', to: 's1-file-billing', label: 'in' },
    { from: 's1-asmp-auth',    to: 's1-conf',         label: 'conflicts ↔' },
    { from: 's1-asmp-billing', to: 's1-conf',         label: 'conflicts ↔' },
  ],
  conflicts: [s1_conflict],
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2 — userId vs user_id (CONTRACT MEDIUM, confidence 91)
// ─────────────────────────────────────────────────────────────────────────────

const s2_asmApi: Assumption = {
  id:         's2-asmp-api',
  statement:  'API response field is named "userId" (camelCase)',
  sourceFile: 'api/user-controller.ts',
  sourceLine: '88',
  dependsOn:  'UserResponse.userId',
  producedBy: 'Contract Agent',
};

const s2_asmFrontend: Assumption = {
  id:         's2-asmp-fe',
  statement:  'Frontend reads field "user_id" (snake_case)',
  sourceFile: 'frontend/src/hooks/useUser.ts',
  sourceLine: '22',
  dependsOn:  'UserResponse.user_id',
  producedBy: 'Contract Agent',
};

const s2_evidence: EvidenceExcerpt[] = [
  {
    file:     'api/user-controller.ts',
    location: 'line 88 — API serialisation',
    snippet:
      'return res.json({\n' +
      '  userId: user.id,   // camelCase — updated for convention\n' +
      '  email:  user.email,\n' +
      '});',
    source: 'Contract Agent',
  },
  {
    file:     'frontend/src/hooks/useUser.ts',
    location: 'line 22 — frontend consumption',
    snippet:
      'const userId = data.user_id;  // snake_case — not updated\n' +
      '// userId is undefined at runtime — field was renamed',
    source: 'Contract Agent',
  },
  {
    file:     'api/dto/user-response.dto.ts',
    location: 'line 14 — DTO definition',
    snippet:
      '@ApiProperty()\n' +
      'userId: string;  // camelCase — renamed from user_id in this PR',
    source: 'Contract Agent',
  },
];

const s2_conflict: Conflict = {
  id:              's2-conf',
  kind:            'CONTRACT',
  severity:        'MEDIUM',
  confidence:      91,
  title:           'Field name mismatch: userId vs user_id',
  description:
    'The API layer was updated to return camelCase field "userId" as part of a naming-convention ' +
    'standardisation PR. The frontend hook still reads "user_id" (snake_case). ' +
    'At runtime the field resolves to undefined — any component that reads user ID ' +
    'will silently receive undefined. Git detects no conflict because these files ' +
    'never share a modified line.',
  requirementText:  'Standardise user object field naming across API and frontend.',
  affectedContract: 'UserResponse.userId / user_id (the user identifier field name in the API response)',
  assumptionA:      s2_asmApi,
  assumptionB:      s2_asmFrontend,
  affectedFiles:    ['api/user-controller.ts', 'frontend/src/hooks/useUser.ts'],
  evidenceExcerpts: s2_evidence,
  verificationHint:
    'Search the frontend codebase for all usages of `data.user_id` and `response.user_id`. ' +
    'Update each to `data.userId`. Add an integration test that asserts ' +
    '`GET /users/:id` returns a field named "userId" and the frontend hook reads it correctly.',
  resolved:          false,
  proposedResolution:
    'Update frontend/src/hooks/useUser.ts line 22: `data.userId` (remove underscore). ' +
    'Grep for remaining `user_id` references in frontend/src — update all. ' +
    'Add contract test: asserting field name round-trip.',
};

export const SCENARIO_USER_ID: ConflictGraph = {
  nodes: [
    { id: 's2-req',        kind: 'REQUIREMENT', label: 'Standardise user field naming' },
    { id: 's2-chg-api',    kind: 'CHANGE',      label: 'API controller update' },
    { id: 's2-chg-fe',     kind: 'CHANGE',      label: 'Frontend hook update' },
    { id: 's2-asmp-api',   kind: 'ASSUMPTION',  label: 'field name = "userId"',   severity: 'MEDIUM' },
    { id: 's2-asmp-fe',    kind: 'ASSUMPTION',  label: 'field name = "user_id"',  severity: 'MEDIUM' },
    { id: 's2-file-api',   kind: 'FILE',         label: 'api/user-controller.ts' },
    { id: 's2-file-fe',    kind: 'FILE',         label: 'frontend/src/hooks/useUser.ts' },
    { id: 's2-conf',       kind: 'CONFLICT',     label: 'Field name contract', severity: 'MEDIUM' },
  ],
  edges: [
    { from: 's2-req',      to: 's2-chg-api',  label: 'drives' },
    { from: 's2-req',      to: 's2-chg-fe',   label: 'drives' },
    { from: 's2-chg-api',  to: 's2-asmp-api', label: 'produces' },
    { from: 's2-chg-fe',   to: 's2-asmp-fe',  label: 'produces' },
    { from: 's2-asmp-api', to: 's2-file-api', label: 'in' },
    { from: 's2-asmp-fe',  to: 's2-file-fe',  label: 'in' },
    { from: 's2-asmp-api', to: 's2-conf',     label: 'conflicts ↔' },
    { from: 's2-asmp-fe',  to: 's2-conf',     label: 'conflicts ↔' },
  ],
  conflicts: [s2_conflict],
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3 — Optional email vs notification service (DEPENDENCY MEDIUM, confidence 78)
// ─────────────────────────────────────────────────────────────────────────────

const s3_asmSchema: Assumption = {
  id:         's3-asmp-schema',
  statement:  'User.email is optional (nullable in schema)',
  sourceFile: 'db/migrations/0042_make_email_optional.sql',
  sourceLine: '7',
  dependsOn:  'User.email',
  producedBy: 'Change Agent',
};

const s3_asmNotif: Assumption = {
  id:         's3-asmp-notif',
  statement:  'Every user has a valid email for notifications',
  sourceFile: 'services/notification-service.ts',
  sourceLine: '54–60',
  dependsOn:  'User.email',
  producedBy: 'Dependency Agent',
};

const s3_evidence: EvidenceExcerpt[] = [
  {
    file:     'db/migrations/0042_make_email_optional.sql',
    location: 'line 7 — column change',
    snippet:
      'ALTER TABLE users\n' +
      '  ALTER COLUMN email DROP NOT NULL;  -- allows SSO-only users',
    source: 'Change Agent',
  },
  {
    file:     'services/notification-service.ts',
    location: 'lines 54–58 — email usage without null-check',
    snippet:
      'const address = user.email.toLowerCase(); // throws if null\n' +
      'await mailer.send({ to: address, subject });',
    source: 'Dependency Agent',
  },
  {
    // File path intentionally missing — demonstrates missing-file-path state
    location: 'SSO login flow (generated code — path not resolved)',
    snippet:  '// SSO users are created without email; notification calls may crash',
    source:   'Adversary Agent',
  },
];

const s3_conflict: Conflict = {
  id:              's3-conf',
  kind:            'DEPENDENCY',
  severity:        'MEDIUM',
  confidence:      78,
  title:           'Optional email breaks notification service assumption',
  description:
    'A database migration makes User.email nullable to support SSO-only users who authenticate ' +
    'via a third-party identity provider and may not provide an email address. ' +
    'The notification service on line 55 calls user.email.toLowerCase() without a null-check — ' +
    'this will throw a TypeError at runtime the first time an SSO user triggers any notification. ' +
    'Git sees no conflict: the migration file and the service file are in different modules ' +
    'that were never touched in the same PR.',
  requirementText:  'Support SSO-only users by making email optional in the user schema.',
  affectedContract: 'User.email (the nullable/required contract for the user email column)',
  assumptionA:      s3_asmSchema,
  assumptionB:      s3_asmNotif,
  affectedFiles: [
    'db/migrations/0042_make_email_optional.sql',
    'services/notification-service.ts',
  ],
  evidenceExcerpts: s3_evidence,
  verificationHint:
    'Search for all usages of `user.email` in services/ and jobs/ directories. ' +
    'For each, add a null-check: `if (!user.email) { skip or use fallback }`. ' +
    'Create an SSO test user (no email) and trigger each notification pathway manually. ' +
    'Confidence is 78 because the Adversary Agent could not resolve the SSO login file path — ' +
    'inspect the identity provider integration code for additional unsafe email accesses.',
  resolved:          false,
  proposedResolution:
    'Add null-check in notification-service.ts line 54: `if (!user.email) return;`. ' +
    'Add test: "notification skipped gracefully for user without email".',
};

export const SCENARIO_EMAIL_OPTIONAL: ConflictGraph = {
  nodes: [
    { id: 's3-req',          kind: 'REQUIREMENT', label: 'Support SSO-only users' },
    { id: 's3-chg-schema',   kind: 'CHANGE',      label: 'DB schema migration' },
    { id: 's3-chg-notif',    kind: 'CHANGE',      label: 'Notification service' },
    { id: 's3-asmp-schema',  kind: 'ASSUMPTION',  label: 'email is nullable',           severity: 'MEDIUM' },
    { id: 's3-asmp-notif',   kind: 'ASSUMPTION',  label: 'every user has email',        severity: 'MEDIUM' },
    { id: 's3-file-schema',  kind: 'FILE',         label: '0042_make_email_optional.sql' },
    { id: 's3-file-notif',   kind: 'FILE',         label: 'notification-service.ts' },
    { id: 's3-conf',         kind: 'CONFLICT',     label: 'Null email crash', severity: 'MEDIUM' },
  ],
  edges: [
    { from: 's3-req',         to: 's3-chg-schema',  label: 'drives' },
    { from: 's3-req',         to: 's3-chg-notif',   label: 'impacts' },
    { from: 's3-chg-schema',  to: 's3-asmp-schema', label: 'produces' },
    { from: 's3-chg-notif',   to: 's3-asmp-notif',  label: 'assumes' },
    { from: 's3-asmp-schema', to: 's3-file-schema', label: 'in' },
    { from: 's3-asmp-notif',  to: 's3-file-notif',  label: 'in' },
    { from: 's3-asmp-schema', to: 's3-conf',        label: 'conflicts ↔' },
    { from: 's3-asmp-notif',  to: 's3-conf',        label: 'conflicts ↔' },
  ],
  conflicts: [s3_conflict],
};

// ─────────────────────────────────────────────────────────────────────────────
// Named scenario registry
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphScenario {
  id: string;
  title: string;
  subtitle: string;
  conflictKind: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  graph: ConflictGraph;
  gitVerdict: { text: string; pass: boolean }[];
  mmVerdict:  { text: string; pass: boolean }[];
}

export const GRAPH_SCENARIOS: GraphScenario[] = [
  {
    id:           'owner-admin',
    title:        'Owner vs Admin',
    subtitle:     'Business-rule conflict',
    conflictKind: 'BUSINESS_RULE',
    severity:     'HIGH',
    graph:        SCENARIO_OWNER_ADMIN,
    gitVerdict: [
      { text: 'Merge: no conflicts',     pass: true },
      { text: '42/42 tests passing',     pass: true },
      { text: 'Code compiles',           pass: true },
    ],
    mmVerdict: [
      { text: 'Semantic: CONFLICT FOUND',             pass: false },
      { text: 'Subscription management inaccessible', pass: false },
      { text: 'role="owner" ≠ role="admin"',          pass: false },
    ],
  },
  {
    id:           'user-id-key',
    title:        'userId vs user_id',
    subtitle:     'Contract conflict',
    conflictKind: 'CONTRACT',
    severity:     'MEDIUM',
    graph:        SCENARIO_USER_ID,
    gitVerdict: [
      { text: 'Merge: no conflicts',    pass: true },
      { text: '38/38 tests passing',    pass: true },
      { text: 'TypeScript compiles',    pass: true },
    ],
    mmVerdict: [
      { text: 'Contract: MISMATCH FOUND',             pass: false },
      { text: 'user_id will be undefined at runtime', pass: false },
      { text: 'API ↔ frontend field name disagrees',  pass: false },
    ],
  },
  {
    id:           'email-optional',
    title:        'Optional email',
    subtitle:     'Dependency conflict',
    conflictKind: 'DEPENDENCY',
    severity:     'MEDIUM',
    graph:        SCENARIO_EMAIL_OPTIONAL,
    gitVerdict: [
      { text: 'Merge: no conflicts',    pass: true },
      { text: '55/55 tests passing',    pass: true },
      { text: 'Migration applied',      pass: true },
    ],
    mmVerdict: [
      { text: 'Dependency: NULL CRASH RISK',               pass: false },
      { text: 'Notification throws for SSO users',         pass: false },
      { text: 'email nullable ↔ email assumed present',    pass: false },
    ],
  },
];
