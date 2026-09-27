/**
 * index.test.ts — smoke tests for @mergemind/api
 *
 * Exercises the tRPC router directly (no HTTP server):
 *   1. health.check returns an ok status with version info.
 *   2. verify.start accepts a minimal run and returns a PENDING id.
 *   3. verify.result resolves to a completed PASS result for empty input
 *      (no changes → no assumptions → no conflicts).
 *   4. verify.result returns null for unknown ids.
 *   5. Killer example (owner vs admin) resolves to CONFLICTS_FOUND/HIGH.
 *   6. Negative control (owner vs owner) resolves to PASS with 0 conflicts.
 *
 * These are wiring tests proving the service-layer plumbing
 * (validation → ingest → deterministic engine → store → poll) works end to end.
 */

import { appRouter } from './index.js';

const caller = appRouter.createCaller({});

const FEATURE_REQUEST = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'Add organization billing',
  description: 'Only organization owners can manage subscriptions.',
  acceptanceCriteria: [
    { key: 'AC-1', description: 'Only organization owners can manage subscriptions.' },
  ],
  rules: ['Only organization owners can manage subscriptions.'],
  tags: ['billing'],
  createdAt: '2024-08-01T12:00:00.000Z',
  submittedBy: 'alice@example.com',
};

const REPOSITORY_SOURCE = {
  id: '223e4567-e89b-42d3-a456-426614174001',
  name: 'demo-repo',
  cloneUrl: 'https://github.com/acme/demo-repo',
  provider: 'github',
  baseBranch: { name: 'main', sha: 'a'.repeat(40) },
  featureBranches: [{ name: 'feature/auth', sha: 'b'.repeat(40) }],
  resolvedAt: '2024-08-01T12:00:00.000Z',
};

/** Poll verify.result until a result appears or the timeout elapses. */
async function pollResult(verificationId: string, timeoutMs = 5000) {
  const started = Date.now();
  for (;;) {
    const result = await caller.verify.result({ verificationId });
    if (result !== null) return result;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for verification result ${verificationId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('health.check', () => {
  it('returns ok status with version and timestamp', async () => {
    const health = await caller.health.check();
    expect(health.status).toBe('ok');
    expect(typeof health.version).toBe('string');
    expect(typeof health.timestamp).toBe('string');
  });
});

describe('verify.start / verify.result', () => {
  it('accepts a run and returns a PENDING verification id', async () => {
    const started = await caller.verify.start({
      featureRequest: FEATURE_REQUEST,
      repositorySource: REPOSITORY_SOURCE,
      changedFiles: [],
    });
    expect(started.status).toBe('PENDING');
    expect(typeof started.verificationId).toBe('string');
    expect(started.verificationId.length).toBeGreaterThan(0);
  });

  it('completes to a PASS result for empty input', async () => {
    const started = await caller.verify.start({
      featureRequest: FEATURE_REQUEST,
      repositorySource: REPOSITORY_SOURCE,
      changedFiles: [],
    });
    const result = await pollResult(started.verificationId);
    expect(result.id).toBe(started.verificationId);
    expect(result.status).toBe('PASS');
    // The requirement text itself yields one business-rule assumption; with no
    // changes there is nothing for it to conflict with.
    expect(result.summary.assumptionsFound).toBe(1);
    expect(result.summary.conflictsFound).toBe(0);
    expect(result.errorMessage).toBeNull();
  });

  it('detects the killer example (owner vs admin) as HIGH conflict', async () => {
    const kickRepository = {
      ...REPOSITORY_SOURCE,
      featureBranches: [
        { name: 'feature/auth-roles', sha: 'b'.repeat(40) },
        { name: 'feature/billing-permissions', sha: 'c'.repeat(40) },
      ],
    };
    const started = await caller.verify.start({
      featureRequest: {
        ...FEATURE_REQUEST,
        description: 'Add organization billing. Only organization owners can manage subscriptions.',
        rules: ['Only organization owners can manage subscriptions.'],
      },
      repositorySource: kickRepository,
      changedFiles: [
        {
          path: 'auth/roles.ts',
          kind: 'MODIFIED',
          patch: `export const ORG_PRIVILEGED_ROLE = 'owner';\nUser.role = ORG_PRIVILEGED_ROLE;`,
          additions: 1,
          deletions: 1,
          branchName: 'feature/auth-roles',
          language: 'typescript',
        },
        {
          path: 'billing/permissions.ts',
          kind: 'MODIFIED',
          patch: `if (user.role === 'admin') {\n  return manageSubscription();\n}`,
          additions: 2,
          deletions: 1,
          branchName: 'feature/billing-permissions',
          language: 'typescript',
        },
      ],
    });
    const result = await pollResult(started.verificationId);
    expect(result.status).toBe('FAIL');
    expect(result.summary.conflictsFound).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.severity).toBe('HIGH');
    expect(result.conflicts[0]?.category).toBe('BUSINESS_RULE');
    expect(result.conflicts[0]?.affectedFiles).toContain('auth/roles.ts');
    expect(result.conflicts[0]?.affectedFiles).toContain('billing/permissions.ts');
  });

  it('passes the negative control (owner vs owner) with 0 conflicts', async () => {
    const started = await caller.verify.start({
      featureRequest: {
        ...FEATURE_REQUEST,
        description: 'Add organization billing. Only organization owners can manage subscriptions.',
        rules: ['Only organization owners can manage subscriptions.'],
      },
      repositorySource: {
        ...REPOSITORY_SOURCE,
        featureBranches: [
          { name: 'feature/auth-roles', sha: 'b'.repeat(40) },
          { name: 'feature/billing-permissions', sha: 'c'.repeat(40) },
        ],
      },
      changedFiles: [
        {
          path: 'auth/roles.ts',
          kind: 'MODIFIED',
          patch: `User.role = 'owner';`,
          additions: 1,
          deletions: 0,
          branchName: 'feature/auth-roles',
          language: 'typescript',
        },
        {
          path: 'billing/permissions.ts',
          kind: 'MODIFIED',
          patch: `if (user.role === 'owner') {\n  return manageSubscription();\n}`,
          additions: 2,
          deletions: 1,
          branchName: 'feature/billing-permissions',
          language: 'typescript',
        },
      ],
    });
    const result = await pollResult(started.verificationId);
    expect(result.status).toBe('PASS');
    expect(result.summary.conflictsFound).toBe(0);
  });

  it('returns null for an unknown verification id', async () => {
    const result = await caller.verify.result({ verificationId: 'no-such-id' });
    expect(result).toBeNull();
  });

  it('rejects a start request with an empty feature-request title', async () => {
    await expect(
      caller.verify.start({
        featureRequest: { ...FEATURE_REQUEST, title: '' },
        repositorySource: REPOSITORY_SOURCE,
        changedFiles: [],
      }),
    ).rejects.toThrow();
  });
});
