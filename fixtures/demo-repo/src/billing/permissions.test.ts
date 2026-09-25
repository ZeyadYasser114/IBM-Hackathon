/**
 * Demo repository — existing tests
 *
 * These 42 tests all pass before and after the merge.
 * They do NOT catch the semantic conflict because no test covers:
 *   "organization owner can manage subscription"
 *
 * MergeMind's resolution proposes test #43 (the missing regression test).
 */
import { isPrivileged } from '../auth/roles.js';
import { canManageSubscription } from '../billing/permissions.js';
import type { User } from '../auth/roles.js';

describe('Auth — isPrivileged', () => {
  it('returns true for owner', () => {
    expect(isPrivileged('owner')).toBe(true);
  });
  it('returns false for member', () => {
    expect(isPrivileged('member')).toBe(false);
  });
});

describe('Billing — canManageSubscription', () => {
  const owner: User = { id: '1', email: 'owner@acme.com', role: 'owner' };
  const member: User = { id: '2', email: 'member@acme.com', role: 'member' };

  // This test is MISSING — MergeMind will propose adding it:
  // it('returns true for organization owner', () => {
  //   expect(canManageSubscription(owner)).toBe(true);
  // });

  it('returns false for member', () => {
    expect(canManageSubscription(member)).toBe(false);
  });

  // Demonstrates the bug: owner cannot manage subscription after merge
  it('BUG — owner returns false because billing checks for admin', () => {
    // This test documents the semantic conflict.
    // After MergeMind's fix, change this to expect(true).
    expect(canManageSubscription(owner)).toBe(false); // wrong — should be true
  });
});
