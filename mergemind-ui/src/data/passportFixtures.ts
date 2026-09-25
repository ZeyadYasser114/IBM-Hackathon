// ─────────────────────────────────────────────────────────────────────────────
// Passport Fixtures
//
// Three Change Passport fixtures for demo and testing:
//   1. PASSPORT_PASS     — Org Billing PASS (resolved, 43/43, webhook risk note)
//   2. PASSPORT_FAIL     — Org Billing FAIL (conflict unresolved)
//   3. PASSPORT_PARTIAL  — Partial analysis (several metrics null = not measured)
//
// These are the source-of-truth for the ChangePassport page and tests.
// demoFixtures.ts re-exports PASSPORT_FAIL as DEMO_PASSPORT and
// PASSPORT_PASS as DEMO_PASSPORT_RESOLVED for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChangePassport } from '@/types/semantic';
import { SCENARIO_OWNER_ADMIN } from '@/graph/graphScenarios';

// ─────────────────────────────────────────────────────────────────────────────
// Shared conflict ref — the resolved and unresolved states of the same conflict
// ─────────────────────────────────────────────────────────────────────────────

const conflictUnresolved = SCENARIO_OWNER_ADMIN.conflicts[0]!;
const conflictResolved   = { ...conflictUnresolved, resolved: true };

// ─────────────────────────────────────────────────────────────────────────────
// 1. PASS — all conflicts resolved, 43/43 tests, 94% coverage
// ─────────────────────────────────────────────────────────────────────────────

export const PASSPORT_PASS: ChangePassport = {
  id:          'passport-20240115-002',
  generatedAt: '2024-01-15T14:47:00Z',
  sessionId:   'session-demo-001',
  feature:     'Organization Billing',
  intent:      'Only organization owners may manage subscriptions.',
  repository:  'acme-org/platform',
  branches:    ['feature/auth-roles', 'feature/billing-permissions'],

  filesChanged:        12,
  components:          ['Authentication', 'Billing', 'Database', 'API'],

  assumptionsFound:    8,
  assumptionsVerified: 8,
  conflictsFound:      1,
  conflictsResolved:   1,

  testsTotal:          43,
  testsPassing:        43,
  requirementCoverage: 94,

  remainingRisk: 'Webhook retry behaviour not verified.',
  status:        'PASS',
  conflicts:     [conflictResolved],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. FAIL — one conflict unresolved, 42/42 tests (but feature is broken)
// ─────────────────────────────────────────────────────────────────────────────

export const PASSPORT_FAIL: ChangePassport = {
  id:          'passport-20240115-001',
  generatedAt: '2024-01-15T14:32:00Z',
  sessionId:   'session-demo-001',
  feature:     'Organization Billing',
  intent:      'Only organization owners may manage subscriptions.',
  repository:  'acme-org/platform',
  branches:    ['feature/auth-roles', 'feature/billing-permissions'],

  filesChanged:        12,
  components:          ['Authentication', 'Billing', 'Database', 'API'],

  assumptionsFound:    8,
  assumptionsVerified: 7,
  conflictsFound:      1,
  conflictsResolved:   0,

  testsTotal:          42,
  testsPassing:        42,
  requirementCoverage: 87,

  remainingRisk:
    'Billing authorization role mismatch unresolved — ' +
    'subscription management is inaccessible for "owner" role.',
  status:    'FAIL',
  conflicts: [conflictUnresolved],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. PARTIAL — quick scan only; several metrics not yet measured
//    Demonstrates empty-state rendering for null fields.
// ─────────────────────────────────────────────────────────────────────────────

export const PASSPORT_PARTIAL: ChangePassport = {
  id:          'passport-partial-001',
  generatedAt: '2024-01-15T15:05:00Z',
  sessionId:   'session-demo-002',
  feature:     'User Profile Refactor',
  intent:      'Migrate user profile storage from PostgreSQL to a document store.',
  repository:  'acme-org/platform',
  branches:    ['feature/profile-migration'],

  filesChanged:        null,   // not yet determined
  components:          ['Database', 'API'],

  assumptionsFound:    null,   // analysis not run
  assumptionsVerified: null,
  conflictsFound:      null,
  conflictsResolved:   null,

  testsTotal:          null,   // test suite not yet run
  testsPassing:        null,

  requirementCoverage: null,   // coverage analysis not run

  remainingRisk: 'Analysis incomplete — not all agents have run.',
  status:        'PENDING',
  conflicts:     [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry for the demo toggle
// ─────────────────────────────────────────────────────────────────────────────

export interface PassportVariant {
  id:       string;
  label:    string;
  sublabel: string;
  passport: ChangePassport;
}

export const PASSPORT_VARIANTS: PassportVariant[] = [
  {
    id:       'pass',
    label:    'PASS — resolved',
    sublabel: 'Conflict fixed, 43/43 tests',
    passport: PASSPORT_PASS,
  },
  {
    id:       'fail',
    label:    'FAIL — unresolved',
    sublabel: 'Conflict open, 42/42 tests',
    passport: PASSPORT_FAIL,
  },
  {
    id:       'partial',
    label:    'PENDING — partial',
    sublabel: 'Analysis incomplete',
    passport: PASSPORT_PARTIAL,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// JSON serialization helper
// Produces the machine-readable passport as a stable JSON object
// (strips React-specific fields, keeps only data).
// ─────────────────────────────────────────────────────────────────────────────

export function serializePassport(passport: ChangePassport): string {
  const json = {
    schema:   'mergemind/change-passport/v1',
    passport: {
      id:                  passport.id,
      generatedAt:         passport.generatedAt,
      sessionId:           passport.sessionId ?? null,
      feature:             passport.feature,
      intent:              passport.intent,
      repository:          passport.repository ?? null,
      branches:            passport.branches   ?? null,
      filesChanged:        passport.filesChanged,
      components:          passport.components,
      assumptionsFound:    passport.assumptionsFound,
      assumptionsVerified: passport.assumptionsVerified,
      conflictsFound:      passport.conflictsFound,
      conflictsResolved:   passport.conflictsResolved,
      testsTotal:          passport.testsTotal,
      testsPassing:        passport.testsPassing,
      requirementCoverage: passport.requirementCoverage,
      remainingRisk:       passport.remainingRisk,
      status:              passport.status,
      conflicts: passport.conflicts.map((c) => ({
        id:               c.id,
        kind:             c.kind,
        severity:         c.severity,
        confidence:       c.confidence,
        title:            c.title,
        affectedContract: c.affectedContract,
        affectedFiles:    c.affectedFiles,
        resolved:         c.resolved,
      })),
    },
  };
  return JSON.stringify(json, null, 2);
}
