// ─────────────────────────────────────────────────────────────────────────────
// Demo Fixture: Organization Billing — owner vs admin conflict
//
// This file provides the primary "DEMO_SESSION" used by the Analysis page
// and the Change Passport. The full evidence-rich conflict objects now live
// in graphScenarios.ts (SCENARIO_OWNER_ADMIN). This file re-exports the
// scenario conflict to stay in sync and avoid duplication.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalysisSession,
  Assumption,
  AgentRun,
  ChangePassport,
} from '@/types/semantic';
import {
  SCENARIO_OWNER_ADMIN,
  SCENARIO_USER_ID,
  SCENARIO_EMAIL_OPTIONAL,
} from '@/graph/graphScenarios';

// ── Re-export for backward compatibility ──────────────────────────────────────

export const DEMO_CONFLICTS = SCENARIO_OWNER_ADMIN.conflicts;
export const DEMO_GRAPH     = SCENARIO_OWNER_ADMIN;

// ── Standalone assumptions (extra, for adapter use) ───────────────────────────

export const assumptionIntent: Assumption = {
  id:         'asmp-003',
  statement:  'Only "owner" role can invoke manageSubscription()',
  sourceFile: 'PRD / feature-request',
  sourceLine: '—',
  dependsOn:  'User.role',
  producedBy: 'Intent Agent',
};

export const assumptionContract: Assumption = {
  id:         'asmp-004',
  statement:  'SubscriptionService.authorize() accepts role string parameter',
  sourceFile: 'billing/subscription-service.ts',
  sourceLine: '58',
  dependsOn:  'SubscriptionService.authorize',
  producedBy: 'Contract Agent',
};

// ── Agent runs ────────────────────────────────────────────────────────────────

export const DEMO_AGENTS: AgentRun[] = [
  {
    id:          'agent-intent',
    name:        'Intent Agent',
    description: 'Extracts requirements and business rules from the feature request',
    status:      'COMPLETE',
    elapsedMs:   2100,
    finding:     'Rule identified: only "owner" role may manage subscriptions',
  },
  {
    id:          'agent-change',
    name:        'Change Agent',
    description: 'Analyzes modified code and determines introduced behaviour',
    status:      'COMPLETE',
    elapsedMs:   3400,
    finding:     'Auth: role="owner" assigned · Billing: role="admin" checked — MISMATCH',
  },
  {
    id:          'agent-contract',
    name:        'Contract Agent',
    description: 'Inspects API signatures, schemas, and data contracts',
    status:      'COMPLETE',
    elapsedMs:   2800,
    finding:     'SubscriptionService.authorize(role) interface intact — no breaking change',
  },
  {
    id:          'agent-dependency',
    name:        'Dependency Agent',
    description: 'Traces which modules depend on changed assumptions',
    status:      'COMPLETE',
    elapsedMs:   1900,
    finding:     '7 call-sites depend on User.role; 2 checked against hardcoded string',
  },
  {
    id:          'agent-adversary',
    name:        'Adversary Agent',
    description: 'Challenges internal consistency — seeks disagreements across agents',
    status:      'COMPLETE',
    elapsedMs:   4200,
    finding:     'HIGH conflict: auth and billing disagree on the meaning of "privileged role"',
  },
];

// ── Change Passport ───────────────────────────────────────────────────────────

export const DEMO_PASSPORT: ChangePassport = {
  id:                    'passport-20240115-001',
  generatedAt:           '2024-01-15T14:32:00Z',
  feature:               'Organization Billing',
  intent:                'Only organization owners may manage subscriptions.',
  filesChanged:          12,
  components:            ['Authentication', 'Billing', 'Database', 'API'],
  assumptionsFound:      8,
  assumptionsVerified:   7,
  conflictsFound:        1,
  conflictsResolved:     0,
  testsTotal:            42,
  testsPassing:          42,
  requirementCoverage:   87,
  remainingRisk:
    'Billing authorization role mismatch unresolved — subscription management inaccessible for "owner" role.',
  status:    'FAIL',
  conflicts: DEMO_CONFLICTS,
};

// ── Full session ──────────────────────────────────────────────────────────────

export const DEMO_SESSION: AnalysisSession = {
  id: 'session-demo-001',
  input: {
    repository:     'acme-org/platform',
    featureRequest: 'Add organization billing. Only organization owners can manage subscriptions.',
    branchA:        'feature/auth-roles',
    branchB:        'feature/billing-permissions',
  },
  agents:   DEMO_AGENTS,
  graph:    SCENARIO_OWNER_ADMIN,
  passport: DEMO_PASSPORT,
};

// ── Resolved variant (post-fix passport) ─────────────────────────────────────

export const DEMO_PASSPORT_RESOLVED: ChangePassport = {
  ...DEMO_PASSPORT,
  id:                  'passport-20240115-002',
  conflictsResolved:   1,
  testsTotal:          43,
  testsPassing:        43,
  requirementCoverage: 94,
  remainingRisk:       'Webhook retry behaviour not verified.',
  status:              'PASS',
  conflicts:           [{ ...DEMO_CONFLICTS[0]!, resolved: true }],
};

// ── All scenario conflicts indexed by scenario index ─────────────────────────

export const ALL_SCENARIO_CONFLICTS = [
  SCENARIO_OWNER_ADMIN.conflicts,
  SCENARIO_USER_ID.conflicts,
  SCENARIO_EMAIL_OPTIONAL.conflicts,
];
