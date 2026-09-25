# Task 5 — Starter-Branch Reliability & Integration Gates for MergeMind

## Summary

Finished the reliability/integration task after Bob exhausted his budget mid-way: repaired one regression he introduced, added the missing API test suite, and delivered every remaining quality gate — deterministic test factories, env validation, CI, and a single `pnpm check` command. No semantic engine, graph UI, Bob orchestration, or resolution workflow was implemented.

```
packages/domain/
├── src/testing/
│   ├── factories.ts        ← deterministic makers for all 11 domain models
│   └── factories.test.ts   ← every default passes its Zod schema (16 tests)
packages/git-ingest/
├── src/testing/
│   └── builders.ts         ← makeChangedFile, makeCodeEvidence, MockGitRunner
├── tsconfig.examples.json  ← throwaway-safe example build (gitignored output)
└── examples/
    └── ingest-example.ts   ← fixed run instructions + honest binary counts
packages/api/
├── jest.config.js          ← new (was missing — no tests could run)
└── src/index.test.ts       ← 5 tRPC smoke tests (health + start→poll→PASS)
apps/web/src/lib/
└── env.ts                  ← zod-validated PORT / VERCEL_URL + getBaseUrl()
.github/workflows/
└── ci.yml                  ← install → build → typecheck → lint → format → test
.env.example                ← safe placeholders only, no secrets
.prettierignore             ← dist, .next, lockfile, generated files, markdown
```

---

## Regression Repaired

| | |
|---|---|
| **File** | `packages/analysis/jest.config.js`, `packages/verification/jest.config.js` |
| **Breakage** | Bob's rewrite dropped the `@mergemind/domain → src` module mapping, forcing tests onto potentially stale `dist/` output |
| **Fix** | Restored the two mapping lines; nothing else touched |
| **Proof** | `git diff` shows only the two restored lines vs HEAD |

## API Smoke Tests [`packages/api/src/index.test.ts`](../packages/api/src/index.test.ts)

| | |
|---|---|
| **Why** | `@mergemind/api` had a `test` script but zero test files — `pnpm test` exited 1 with "no tests found", red-gating the whole workspace |
| **Coverage** | `health.check` returns ok + version; `verify.start` returns PENDING id; poll completes to PASS via the stub pipeline; unknown id returns null; empty title is rejected |
| **Style** | Calls the tRPC router directly (`createCaller`) — no HTTP server, no network |

## Domain Factories [`packages/domain/src/testing/factories.ts`](../packages/domain/src/testing/factories.ts)

| | |
|---|---|
| **Import** | `import { makeAssumption } from '@mergemind/domain/testing'` (new `./testing` export) |
| **Guarantee** | Fixed UUIDs/dates/SHAs — byte-identical output every run; every default passes its Zod schema (proven by `factories.test.ts`) |
| **Override** | Any field overridable: `makeConflictFinding({ severity: 'CRITICAL' })` |
| **Covers** | FeatureRequest, RepositorySource, BranchRef, ChangedFile, CodeEvidence, Assumption, DependencyReference, ConflictFinding, VerificationResult + Summary, ChangePassportDraft + RiskItem, AgentProgress |

## Ingest Builders [`packages/git-ingest/src/testing/builders.ts`](../packages/git-ingest/src/testing/builders.ts)

| | |
|---|---|
| **Import** | `import { makeChangedFile, MockGitRunner } from '@mergemind/git-ingest/testing'` (new `./testing` export) |
| **MockGitRunner** | Scripted `git` responses keyed by argv; unexpected calls throw with the exact command and the registered list — missing stubs fail loudly |
| **Extras** | `SIMPLE_PATCH` diff constant, `makeBranchRef`, `makeCodeEvidence` |

## Env Validation [`apps/web/src/lib/env.ts`](../apps/web/src/lib/env.ts)

| | |
|---|---|
| **Rule** | All `process.env` reads go through zod-validated `env`; invalid `PORT` throws at startup with the exact fix |
| **Wiring** | `TRPCProvider` now imports `getBaseUrl()` from `@/lib/env` — no behaviour change |
| **Example** | Root `.env.example` (`PORT=3000`, commented `VERCEL_URL`) — placeholders only, never secrets |
| **Ignore** | `.gitignore` now covers `.env` (`.env.example` stays tracked) |

## CI & Single Check Command

| | |
|---|---|
| **Workflow** | `.github/workflows/ci.yml` — Node 20, frozen lockfile, then build → typecheck → lint → format:check → test on push/PR |
| **Local** | `pnpm check` runs the identical gate sequence; `pnpm format` fixes style |
| **Baseline** | Normalised formatting repo-wide (code/config only — markdown and generated files ignored) so CI starts green |

---

## Pre-Push Contract for Teammates

```bash
pnpm check
```

Expected success output: `build`, `typecheck`, `lint`, `format:check` each end with `Done` / no warnings, and every package reports `Tests: N passed, N total` (current totals: domain 79, verification 5, fixtures 53, git-ingest 242, analysis 4, api 5 — **388/388**). Use the `testing` factories/builders and `getScenario()` ids instead of hand-rolling fixtures.

---

## Known Integration Risks That Remain

- **Format normalisation touched many committed files** — teammates with in-flight edits should rebase early to avoid conflicts.
- **API tests resolve workspace deps via built `dist/`** (no `src` mapping like analysis/verification) — run `pnpm build` before `pnpm test` after pulling.
- **`pnpm clean` uses `rm -rf`** and fails in Windows CMD — do not rely on it; delete `dist/` manually if a stale-output issue is suspected.
- **No secrets plumbing yet** — the first branch needing a Bob API key must add server-only env handling (`env.ts` is client-safe by design and must stay that way).

---

## Validation

- **TypeScript:** zero errors (`tsc --noEmit` per package + web)
- **Tests:** 388/388 passing (domain 79, verification 5, fixtures 53, git-ingest 242, analysis 4, api 5)
- **Lint:** zero warnings/errors (eslint + `next lint`)
- **Format:** `prettier --check .` clean
- **Example:** `pnpm --filter @mergemind/git-ingest example` prints 4 files + 4 evidence records end to end
- **No teammate feature logic included** — factories, builders, fixtures, and env helpers only; stubs and extension points untouched
