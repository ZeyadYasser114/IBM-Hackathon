# Task 4 — Reusable Demo/Fixture Package for MergeMind

## Summary

Created a new `@mergemind/fixtures` workspace package at [`packages/fixtures/`](../packages/fixtures) — plain data, no async, no network.

```
packages/fixtures/
├── src/
│   ├── types.ts                             ← ScenarioFixture, RepoFile, PatchFixture types
│   ├── scenario-01-business-rule.ts         ← Scenario 1 (BUSINESS_RULE)
│   ├── scenario-02-contract-mismatch.ts     ← Scenario 2 (CONTRACT)
│   ├── scenario-03-dependency-assumption.ts ← Scenario 3 (DEPENDENCY)
│   ├── index.ts                             ← allScenarios[], getScenario(), re-exports
│   └── index.test.ts                        ← 53 structural invariant tests
├── package.json   ← @mergemind/fixtures, workspace:* dep on @mergemind/domain
├── tsconfig.json
├── jest.config.json
└── README.md
```

---

## The Three Scenarios

### Scenario 1 — Business-rule mismatch [`scenario-01-business-rule.ts`](../packages/fixtures/src/scenario-01-business-rule.ts)

| | |
|---|---|
| **Branches** | `feature/auth-roles-owner` renames `PRIVILEGED_ROLE` from `'admin'` → `'owner'`; `feature/billing-subscriptions` gates on `user.role === 'admin'` |
| **Git** | ✅ Clean merge |
| **Contradiction** | `'admin'` is no longer a valid `Role`, so `canManageSubscription` always returns `false` — every owner is silently locked out of billing |
| **Category / Severity** | `BUSINESS_RULE` / HIGH |

### Scenario 2 — Contract mismatch [`scenario-02-contract-mismatch.ts`](../packages/fixtures/src/scenario-02-contract-mismatch.ts)

| | |
|---|---|
| **Branches** | `feature/events-api-refactor` renames `EventPayload.user_id` → `EventPayload.userId`; `feature/activity-feed` reads `event['user_id']` to populate `ActivityRecord.actorId` |
| **Git** | ✅ Clean merge |
| **Contradiction** | `user_id` no longer exists on the emitted payload — every activity record is created with `actorId = ""` — silent data corruption |
| **Category / Severity** | `CONTRACT` / HIGH |

### Scenario 3 — Dependency assumption mismatch [`scenario-03-dependency-assumption.ts`](../packages/fixtures/src/scenario-03-dependency-assumption.ts)

| | |
|---|---|
| **Branches** | `feature/optional-email-signup` makes `User.email` optional (`string?`); `feature/welcome-email` reads `user.email` as the mail `to:` address with no undefined guard |
| **Git** | ✅ Clean merge |
| **Contradiction** | A username-only registrant triggers the welcome-email flow; `to: undefined` either corrupts the outbox or throws at runtime |
| **Category / Severity** | `DEPENDENCY` / HIGH |

---

## Each Scenario Carries

- **`originalRequirement`** — the feature-request prose that spawned both branches
- **`baseFiles`** — file content on the common ancestor
- **`branches[]`** — changed files + unified diff (`patch`) per branch
- **`expectedContradiction`** — plain-English ≤ 30-second explanation
- **`expectedAffectedFiles`** + **`expectedAffectedComponents`** — ground truth for detector assertions
- **`canonicalResult`** — a fully-formed `VerificationResult` (status FAIL, typed assumptions, conflict finding with evidence, self-consistent summary counts) ready for snapshot tests

---

## Validation

- **TypeScript:** zero errors (`tsc --noEmit`)
- **Tests:** 53/53 passing (structural invariants — shape, internal ID consistency, summary counts)
- **No detector logic included** — fixtures are pure truth data for later tests and demos
- **All data is synthetic** — no real users, emails, company data, or social-media data
