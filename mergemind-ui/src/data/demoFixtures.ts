// ─────────────────────────────────────────────────────────────────────────────
// Demo Fixture: Organization Billing — owner vs admin conflict
//
// Requirement: Only organization owners can manage subscriptions.
// Auth change:    privileged role = "owner"
// Billing change: privileged role = "admin"
// Expected:       1 HIGH-severity business-rule conflict
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalysisSession,
  Assumption,
  Conflict,
  AgentRun,
  ConflictGraph,
  ChangePassport,
} from '@/types/semantic';

// ── Assumptions ───────────────────────────────────────────────────────────────

const assumptionAuth: Assumption = {
  id: 'asmp-001',
  statement: 'The privileged organization role is "owner"',
  sourceFile: 'auth/roles.ts',
  sourceLine: '14-18',
  dependsOn: 'User.role',
  producedBy: 'Change Agent',
};

const assumptionBilling: Assumption = {
  id: 'asmp-002',
  statement: 'The privileged organization role is "admin"',
  sourceFile: 'billing/permissions.ts',
  sourceLine: '31-35',
  dependsOn: 'User.role',
  producedBy: 'Change Agent',
};
// These assumptions are produced by other agents and available for the real engine to surface.
// Kept as named exports so the adapter can reference them.
export const assumptionIntent: Assumption = {
  id: 'asmp-003',
  statement: 'Only "owner" role can invoke manageSubscription()',
  sourceFile: 'PRD / feature-request',
  sourceLine: '—',
  dependsOn: 'User.role',
  producedBy: 'Intent Agent',
};

export const assumptionContract: Assumption = {
  id: 'asmp-004',
  statement: 'SubscriptionService.authorize() accepts role string parameter',
  sourceFile: 'billing/subscription-service.ts',
  sourceLine: '58',
  dependsOn: 'SubscriptionService.authorize',
  producedBy: 'Contract Agent',
};


// ── Conflicts ─────────────────────────────────────────────────────────────────

const conflictOwnerAdmin: Conflict = {
  id: 'conf-001',
  kind: 'BUSINESS_RULE',
  severity: 'HIGH',
  title: 'Authorization role mismatch: owner vs admin',
  description:
    'The requirement states that only organization owners may manage subscriptions. ' +
    'The authentication layer correctly assigns the privileged role as "owner". ' +
    'However, the billing permission check gates access on role === "admin". ' +
    'No user with role "owner" will ever pass this check, making subscription management ' +
    'completely inaccessible despite a clean Git merge and 42/42 passing tests.',
  requirementText: 'Only organization owners may manage subscriptions.',
  assumptionA: assumptionAuth,
  assumptionB: assumptionBilling,
  affectedFiles: ['auth/roles.ts', 'billing/permissions.ts'],
  resolved: false,
  proposedResolution:
    'Update billing/permissions.ts line 32 to check `user.role === "owner"`. ' +
    'Add regression test: "admin cannot manage organization subscription".',
};

export const DEMO_CONFLICTS: Conflict[] = [conflictOwnerAdmin];

// ── Conflict Graph ─────────────────────────────────────────────────────────────

export const DEMO_GRAPH: ConflictGraph = {
  nodes: [
    { id: 'req-1', kind: 'REQUIREMENT', label: 'Only owners manage subscriptions' },
    { id: 'chg-auth', kind: 'CHANGE', label: 'Authentication update' },
    { id: 'chg-billing', kind: 'CHANGE', label: 'Billing update' },
    { id: 'asmp-001', kind: 'ASSUMPTION', label: 'privileged role = "owner"', severity: 'HIGH' },
    { id: 'asmp-002', kind: 'ASSUMPTION', label: 'privileged role = "admin"', severity: 'HIGH' },
    { id: 'file-auth', kind: 'FILE', label: 'auth/roles.ts' },
    { id: 'file-billing', kind: 'FILE', label: 'billing/permissions.ts' },
    { id: 'conf-001', kind: 'CONFLICT', label: 'Role mismatch', severity: 'HIGH' },
  ],
  edges: [
    { from: 'req-1', to: 'chg-auth', label: 'drives' },
    { from: 'req-1', to: 'chg-billing', label: 'drives' },
    { from: 'chg-auth', to: 'asmp-001', label: 'produces' },
    { from: 'chg-billing', to: 'asmp-002', label: 'produces' },
    { from: 'asmp-001', to: 'file-auth', label: 'in' },
    { from: 'asmp-002', to: 'file-billing', label: 'in' },
    { from: 'asmp-001', to: 'conf-001', label: 'conflicts' },
    { from: 'asmp-002', to: 'conf-001', label: 'conflicts' },
  ],
  conflicts: [conflictOwnerAdmin],
};

// ── Agent runs ────────────────────────────────────────────────────────────────

export const DEMO_AGENTS: AgentRun[] = [
  {
    id: 'agent-intent',
    name: 'Intent Agent',
    description: 'Extracts requirements and business rules from the feature request',
    status: 'COMPLETE',
    elapsedMs: 2100,
    finding: 'Rule identified: only "owner" role may manage subscriptions',
  },
  {
    id: 'agent-change',
    name: 'Change Agent',
    description: 'Analyzes modified code and determines introduced behaviour',
    status: 'COMPLETE',
    elapsedMs: 3400,
    finding: 'Auth: role="owner" assigned · Billing: role="admin" checked — MISMATCH',
  },
  {
    id: 'agent-contract',
    name: 'Contract Agent',
    description: 'Inspects API signatures, schemas, and data contracts',
    status: 'COMPLETE',
    elapsedMs: 2800,
    finding: 'SubscriptionService.authorize(role) interface intact — no breaking change',
  },
  {
    id: 'agent-dependency',
    name: 'Dependency Agent',
    description: 'Traces which modules depend on changed assumptions',
    status: 'COMPLETE',
    elapsedMs: 1900,
    finding: '7 call-sites depend on User.role; 2 checked against hardcoded string',
  },
  {
    id: 'agent-adversary',
    name: 'Adversary Agent',
    description: 'Challenges internal consistency — seeks disagreements across agents',
    status: 'COMPLETE',
    elapsedMs: 4200,
    finding: 'HIGH conflict: auth and billing disagree on the meaning of "privileged role"',
  },
];

// ── Change Passport ───────────────────────────────────────────────────────────

export const DEMO_PASSPORT: ChangePassport = {
  id: 'passport-20240115-001',
  generatedAt: '2024-01-15T14:32:00Z',
  feature: 'Organization Billing',
  intent: 'Only organization owners may manage subscriptions.',
  filesChanged: 12,
  components: ['Authentication', 'Billing', 'Database', 'API'],
  assumptionsFound: 8,
  assumptionsVerified: 7,
  conflictsFound: 1,
  conflictsResolved: 0,
  testsTotal: 42,
  testsPassing: 42,
  requirementCoverage: 87,
  remainingRisk:
    'Billing authorization role mismatch unresolved — subscription management inaccessible for "owner" role.',
  status: 'FAIL',
  conflicts: [conflictOwnerAdmin],
};

// ── Full session ──────────────────────────────────────────────────────────────

export const DEMO_SESSION: AnalysisSession = {
  id: 'session-demo-001',
  input: {
    repository: 'acme-org/platform',
    featureRequest: 'Add organization billing. Only organization owners can manage subscriptions.',
    branchA: 'feature/auth-roles',
    branchB: 'feature/billing-permissions',
  },
  agents: DEMO_AGENTS,
  graph: DEMO_GRAPH,
  passport: DEMO_PASSPORT,
};

// ── Resolved variant (post-fix passport) ─────────────────────────────────────

export const DEMO_PASSPORT_RESOLVED: ChangePassport = {
  ...DEMO_PASSPORT,
  id: 'passport-20240115-002',
  conflictsResolved: 1,
  testsTotal: 43,
  testsPassing: 43,
  requirementCoverage: 94,
  remainingRisk: 'Webhook retry behaviour not verified.',
  status: 'PASS',
  conflicts: [{ ...conflictOwnerAdmin, resolved: true }],
};
