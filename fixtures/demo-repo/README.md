# Demo Repository — `fixtures/demo-repo`

This directory contains the **controlled demonstration repository** that MergeMind uses during
the hackathon demo. It is **not a production codebase** — it is a minimal, deliberately-broken
scenario that illustrates a HIGH severity semantic conflict.

## The Scenario

A developer asked:
> Add organization billing. Only organization owners can manage subscriptions.

Two AI coding agents ran in parallel:

| Agent | File | Change |
|---|---|---|
| Auth agent | `src/auth/roles.ts` | Changed `PRIVILEGED_ROLE` from `'admin'` → `'owner'` |
| Billing agent | `src/billing/permissions.ts` | Checks `user.role === 'admin'` |

**Git:** ✅ Clean merge — no conflicts  
**Tests:** ✅ All pass (no test covers the cross-component assumption)  
**MergeMind:** ⚠️ HIGH severity business-rule conflict

## Expected MergeMind Output

```
SEMANTIC CONFLICT DETECTED

Requirement:    Only organization owners may manage subscriptions.
Auth assumes:   privileged-role = 'owner'   (src/auth/roles.ts)
Billing assumes: privileged-role = 'admin'  (src/billing/permissions.ts)

Conflict class: business-rule
Severity:       HIGH
```

## Files

```
src/
  auth/
    roles.ts              ← auth agent's change (PRIVILEGED_ROLE = 'owner')
  billing/
    permissions.ts        ← billing agent's change (checks 'admin') — THE BUG
    permissions.test.ts   ← existing tests (all pass, bug undetected)
```

## Extension Points

- **Conflict detection branch:** Use `permissions.test.ts` as the golden test.
  After implementing real conflict detection, the `BUG` test case should be updated
  to `expect(canManageSubscription(owner)).toBe(true)` — with MergeMind's proposed fix applied.
- **Resolution branch:** MergeMind should propose changing `permissions.ts` line 15 from
  `user.role === 'admin'` to `user.role === 'owner'`, and adding a new test:
  `it('returns true for organization owner', () => { expect(canManageSubscription(owner)).toBe(true); })`.
