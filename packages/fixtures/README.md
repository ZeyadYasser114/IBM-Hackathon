# `@mergemind/fixtures`

Deterministic, self-contained fixture data for MergeMind semantic-conflict demos and tests.

> **Scope** — this package contains only *truth data*. It never calls conflict-detection logic.
> Add `@mergemind/fixtures` as a `devDependency` in any package that wants to drive tests
> against the canonical ground-truth outputs.

---

## Why this package exists

MergeMind's analysis pipeline needs ground-truth scenarios to:

- Write detector unit tests without depending on live GitHub repos or unfinished teammates' code.
- Run a consistent hackathon demo regardless of which features are complete.
- Validate that a detector's output matches the expected `VerificationResult` shape.

Each scenario is a plain TypeScript object — no I/O, no async, no network.

---

## Scenarios

### Scenario 1 — Business-rule mismatch (`scenario-01-business-rule`)

| | |
|---|---|
| **Requirement** | Add organisation billing. Only organisation owners may manage subscriptions. |
| **Branch A** | `feature/auth-roles-owner` — renames `PRIVILEGED_ROLE` from `'admin'` → `'owner'` in `src/auth/roles.ts` |
| **Branch B** | `feature/billing-subscriptions` — adds `canManageSubscription` which checks `user.role === 'admin'` |
| **Git** | ✅ Clean merge (different files) |
| **Contradiction** | After merge `'admin'` is no longer a valid `Role` value, so `canManageSubscription` **always returns `false`** — every owner is silently locked out |
| **Category** | `BUSINESS_RULE` / HIGH |

---

### Scenario 2 — Contract mismatch (`scenario-02-contract-mismatch`)

| | |
|---|---|
| **Requirement** | Implement an activity-feed service that records actions performed by users. The event payload must include the acting user's identifier. |
| **Branch A** | `feature/events-api-refactor` — renames `EventPayload.user_id` → `EventPayload.userId` for camelCase consistency |
| **Branch B** | `feature/activity-feed` — builds the consumer, reads `event['user_id']` to populate `ActivityRecord.actorId` |
| **Git** | ✅ Clean merge (different files) |
| **Contradiction** | After merge every activity record is created with `actorId = ""` because `user_id` no longer exists on the emitted payload — silent data corruption |
| **Category** | `CONTRACT` / HIGH |

---

### Scenario 3 — Dependency assumption mismatch (`scenario-03-dependency-assumption`)

| | |
|---|---|
| **Requirement** | Allow users to sign up with only a username and password (email optional). The notification service must send welcome emails to new users. |
| **Branch A** | `feature/optional-email-signup` — changes `User.email` from `string` to `string \| undefined` (optional field) |
| **Branch B** | `feature/welcome-email` — adds `buildWelcomeEmail` which reads `user.email` directly as the `to` address, no undefined guard |
| **Git** | ✅ Clean merge (different files) |
| **Contradiction** | A user who registers without an email triggers the welcome-email flow, which passes `undefined` as the recipient address — either sends to the literal string `"undefined"` or throws at runtime |
| **Category** | `DEPENDENCY` / HIGH |

---

## Installation

```bash
pnpm add --save-dev @mergemind/fixtures
```

The package is part of the `mergemind` pnpm workspace; no publish step is required for internal
packages.

---

## Usage in tests

### Jest / Vitest — data-driven loop over all scenarios

```ts
import { allScenarios } from '@mergemind/fixtures';

describe.each(allScenarios)('scenario $id', (scenario) => {
  it('detector finds at least one conflict', async () => {
    const result = await myDetector.run(scenario);
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
  });
});
```

### Look up a single scenario by id

```ts
import { getScenario } from '@mergemind/fixtures';

const s = getScenario('scenario-02-contract-mismatch');

// s.canonicalResult is the expected VerificationResult
// s.branches[0].patch is the unified diff for Branch A
// s.expectedContradiction is the human-readable description
```

### Access raw file content or diffs

```ts
import { scenario03DependencyAssumption as s } from '@mergemind/fixtures';

// Files on the base branch
const baseModel = s.baseFiles.find((f) => f.path === 'src/users/model.ts');
console.log(baseModel?.content);

// Changed files on each branch
for (const branch of s.branches) {
  console.log(`--- ${branch.name} ---`);
  console.log(branch.patch);
}
```

### Compare detector output to the canonical ground truth

```ts
import { scenario01BusinessRule } from '@mergemind/fixtures';
import type { VerificationResult } from '@mergemind/domain';

const expected: VerificationResult = scenario01BusinessRule.canonicalResult;
const actual: VerificationResult   = await runDetector(scenario01BusinessRule);

expect(actual.conflicts[0]?.category).toBe(expected.conflicts[0]?.category);
expect(actual.conflicts[0]?.severity).toBe(expected.conflicts[0]?.severity);
```

---

## Package structure

```
packages/fixtures/
├── src/
│   ├── types.ts                        # ScenarioFixture, RepoFile, PatchFixture types
│   ├── scenario-01-business-rule.ts    # Scenario 1: owner vs admin (BUSINESS_RULE)
│   ├── scenario-02-contract-mismatch.ts# Scenario 2: userId vs user_id (CONTRACT)
│   ├── scenario-03-dependency-assumption.ts # Scenario 3: email nullability (DEPENDENCY)
│   ├── index.ts                        # Public exports + allScenarios + getScenario()
│   └── index.test.ts                   # Smoke tests (structural invariants only)
├── package.json
├── tsconfig.json
└── jest.config.json
```

---

## ScenarioFixture shape

```ts
type ScenarioFixture = {
  id: string;                       // kebab-case slug, e.g. "scenario-01-business-rule"
  title: string;                    // one-line human title
  originalRequirement: string;      // the feature request that spawned both branches
  conflictCategory: 'BUSINESS_RULE' | 'CONTRACT' | 'DEPENDENCY';
  baseFiles: RepoFile[];            // files on the common ancestor (main)
  branches: {
    name: string;                   // branch name, e.g. "feature/auth-roles-owner"
    changedFiles: RepoFile[];       // files as they look after the branch's changes
    patch: string;                  // unified diff (git diff output)
  }[];
  expectedContradiction: string;    // plain-English description of the conflict
  expectedAffectedFiles: string[];  // repo-relative paths the detector should flag
  expectedAffectedComponents: string[]; // component/service names involved
  canonicalResult: VerificationResult;  // full expected domain output
};
```

---

## Data provenance

All fixture data is **entirely synthetic**. It contains:

- No real user data, email addresses, or personal information.
- No client, company-confidential, or social-media data.
- No real repository URLs (all use the placeholder `acme-demo` GitHub org).
- Deterministic UUIDs (fixed strings, not generated at runtime) for reproducible snapshot tests.

The fictional company name used throughout is **Acme** — a generic placeholder with no
association to any real organisation.

---

## Adding a new scenario

1. Create `packages/fixtures/src/scenario-NN-<slug>.ts` following the existing template.
2. Export the constant from `packages/fixtures/src/index.ts`.
3. Add it to the `allScenarios` array.
4. Add a union member to the `getScenario` overload.
5. Run `pnpm --filter @mergemind/fixtures test` to verify structural invariants pass.
