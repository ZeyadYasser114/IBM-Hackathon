/**
 * Demo repository — auth/roles.ts
 *
 * This file represents the state after the auth agent's change.
 * The privileged role has been changed from 'admin' to 'owner'.
 *
 * SEMANTIC CONFLICT SOURCE:
 * The billing agent (billing/permissions.ts) still checks for 'admin'.
 */
export type Role = 'owner' | 'member';

// Auth agent updated this from 'admin' to 'owner'
const PRIVILEGED_ROLE: Role = 'owner';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export function isPrivileged(role: Role): boolean {
  return role === PRIVILEGED_ROLE;
}
