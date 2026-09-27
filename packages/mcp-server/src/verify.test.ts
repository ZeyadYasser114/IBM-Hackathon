/**
 * verify.test.ts — MCP verification runner tests (no network, no stdio).
 *
 * Exercises the same code path the MCP tools call: text in, real engine
 * verdict out. The GitHub entry point is tested for input validation only
 * (invalid URLs fail before any clone is attempted).
 */

import { verifyChanges, verifyGitHubRepository } from '../src/verify.js';

const REQUIREMENT = 'Add organization billing. Only organization owners can manage subscriptions.';

describe('verifyChanges: owner vs admin', () => {
  it('detects a HIGH business-rule conflict', async () => {
    const outcome = await verifyChanges(
      'test-owner-admin',
      REQUIREMENT,
      {
        label: 'feature/auth-roles',
        content: `export const ORG_PRIVILEGED_ROLE = 'owner'; User.role = ORG_PRIVILEGED_ROLE;`,
        filePath: 'auth/roles.ts',
      },
      {
        label: 'feature/billing-permissions',
        content: `if (user.role === 'admin') { return manageSubscription(); }`,
        filePath: 'billing/permissions.ts',
      },
    );
    expect(outcome.status).toBe('CONFLICTS_FOUND');
    expect(outcome.conflictsFound).toBeGreaterThan(0);
    expect(outcome.reports.some((r) => r.conflictType === 'BUSINESS_RULE')).toBe(true);
  });
});

describe('verifyChanges: owner vs owner', () => {
  it('passes when both sides agree', async () => {
    const outcome = await verifyChanges(
      'test-owner-owner',
      REQUIREMENT,
      {
        label: 'feature/auth-roles',
        content: `User.role = 'owner';`,
        filePath: 'auth/roles.ts',
      },
      {
        label: 'feature/billing-permissions',
        content: `if (user.role === 'owner') { return manageSubscription(); }`,
        filePath: 'billing/permissions.ts',
      },
    );
    expect(outcome.status).toBe('PASS');
    expect(outcome.conflictsFound).toBe(0);
  });
});

describe('verifyChanges: validation', () => {
  it('rejects an empty requirement', async () => {
    await expect(
      verifyChanges(
        'test-empty',
        '   ',
        { label: 'a', content: 'x = 1;' },
        { label: 'b', content: 'y = 2;' },
      ),
    ).rejects.toThrow();
  });
});

describe('verifyGitHubRepository: validation', () => {
  it('rejects a non-GitHub URL before cloning', async () => {
    await expect(
      verifyGitHubRepository('test-bad-url', {
        repository: 'https://gitlab.com/acme/platform',
        baseBranch: 'main',
        changeA: 'a',
        changeB: 'b',
        featureRequest: REQUIREMENT,
      }),
    ).rejects.toThrow(/github/i);
  });
});
