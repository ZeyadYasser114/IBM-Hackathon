/**
 * Demo repository — billing/permissions.ts
 *
 * This file represents the state after the billing agent's change.
 * The billing agent checks user.role === 'admin' — but the auth agent
 * changed the privileged role to 'owner'.
 *
 * SEMANTIC CONFLICT TARGET:
 * This check will always be false after the auth agent's change.
 * Git sees no conflict. MergeMind detects: HIGH severity business-rule conflict.
 */
import type { User } from '../auth/roles.js';

// Billing agent wrote 'admin' — should have used 'owner' per the requirement
export function canManageSubscription(user: User): boolean {
  return user.role === 'admin';
}

export function manageSubscription(user: User): void {
  if (!canManageSubscription(user)) {
    throw new Error('Unauthorized: only organization owners can manage subscriptions');
  }
  // Subscription management logic goes here
}
