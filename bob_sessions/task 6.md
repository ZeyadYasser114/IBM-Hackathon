# Task 6 — Senior-Engineer Audit Before the Starter Becomes Main

## Summary

Audited the starter branch as the handoff gate before teammates branch from or
merge into it. Reviewed coupling, folder ownership, scripts, imports, naming,
environment requirements, dead code, and merge-pain risks. Fixed four small
issues, confirmed all required contents are present and all future product
modules are still stubs, and verified everything from a fully clean state
(all `node_modules` / `dist` / `.next` deleted, then reinstall + full gates).

```
M README.md                        ← Team Integration Contract (new section)
M package.json                     ← engines: pnpm >= 11.0.0 (was >= 8)
M packages/analysis/src/index.ts   ← canonical domain names (was legacy aliases)
M packages/verification/package.json ← description: ConflictFindings
M packages/*/jest.config.js        ← silence benign ts-jest TS151002 noise (5 files)
?? .gitattributes                  ← * text=auto (CRLF/LF normalization)
```

---

## Findings and Fixes

### Accidental coupling — legacy domain aliases [`packages/analysis/src/index.ts`](../packages/analysis/src/index.ts)

| | |
|---|---|
| **Smell** | `analysis` was the last consumer importing `FeatureRequirement` / `RepositoryContext` instead of the canonical names |
| **Fix** | Mechanical rename to `FeatureRequest` / `RepositorySource`; deprecated aliases stay exported for compatibility only |
| **Rule going forward** | New code must use canonical names — aliases are Luo-compat shims, not vocabulary |

### Merge pain — line endings [`.gitattributes`](../.gitattributes)

| | |
|---|---|
| **Smell** | Git reported CRLF/LF warnings on every file; teammates on Windows + macOS + Linux would produce phantom merge conflicts |
| **Fix** | New `.gitattributes` with `* text=auto` — normalization applies going forward |
| **Cost** | One new 3-line file, zero code churn |

### Hidden environment requirement [`package.json`](../package.json)

| | |
|---|---|
| **Smell** | `engines.pnpm` said `>=8.0.0`, but lockfile v9 + `allowBuilds` require pnpm ≥ 11 — a teammate on pnpm 8/9/10 fails install with a cryptic error |
| **Fix** | Corrected to `pnpm >= 11.0.0` (validated on pnpm 12.6.0, Node 24; CI pins Node 20) |
| **Node** | `node >= 18.0.0` verified sufficient — no change |

### Warning noise hiding real failures [`packages/*/jest.config.js`](../packages/domain/jest.config.js)

| | |
|---|---|
| **Smell** | Benign ts-jest TS151002 warning printed on every suite run, training teammates to ignore stderr |
| **Fix** | Added `diagnostics.ignoreCodes: [151002]` to all 5 jest configs (fixtures package already did this — now consistent) |
| **Proof** | Final `pnpm check` output contains zero warnings |

### Deliberately NOT changed

| | |
|---|---|
| **Four fixture locations** | `packages/fixtures` (canonical), root `fixtures/` (raw snapshot), `apps/web/src/fixtures/` (UI seed), `packages/git-ingest/src/fixtures/` (parser-internal) — consolidating now would churn active feature branches; ownership is documented in the contract instead |
| **Demo fixture test file** | `fixtures/demo-repo/.../permissions.test.ts` is intentional demo content, never executed (jest roots are package dirs) |
| **No new abstractions** | Nothing added beyond the fixes above; `RealGitRunner`, zod boundary schemas, and barrel files each earned their place |

---

## Required Contents — Confirmed Present

| Requirement | Location | Status |
|---|---|---|
| Runnable baseline | `pnpm dev` → Next.js app, `GET /health`, tRPC `health.check` | ✅ Verified |
| Shared domain contracts | `packages/domain` types + `@mergemind/domain/schemas` zod validation | ✅ Verified |
| Deterministic ingestion | `packages/git-ingest` — `LocalGit` / `PastedDiff` / `InMemory` adapters, shell isolated behind `GitRunner` | ✅ Verified |
| Independent demo fixtures | `packages/fixtures` (`getScenario`, 3 scenarios, 53 tests) | ✅ Verified |
| Tests | 267 unique tests across 6 packages, src-only (no `dist/` doubles) | ✅ 267/267 |
| Quality commands | `pnpm check` = build + typecheck + lint + format:check + test; CI mirrors it | ✅ Verified |
| Setup documentation | `.env.example`, README contract below | ✅ Verified |

---

## Forbidden Modules — Confirmed Stubs Only

| Module | State in this branch |
|---|---|
| Semantic conflict detection | `ConflictDetector` interface + `StubConflictDetector` (returns `[]`) |
| Bob multi-agent orchestration | `AgentRunner` interface + 5 stub runners, parallel plumbing only |
| Conflict graph UI | Screen 1 form only — no graph rendering code exists |
| Automated resolution | No resolution router, no resolver code |
| Change Passport generation | `ChangePassportDraft` type only — zero generation logic |

---

## README — Team Integration Contract

Appended a binding **Team Integration Contract** section to [`README.md`](../README.md): teammate quick start (`pnpm install` → `pnpm check` → `pnpm dev`), module-home table (detectors / runners / adapters / graph UI / resolution / passport / test data), shared-type reuse list, stable-interface list, the `pnpm check` pre-merge rule, and an explicit list of what is deliberately not built yet.

---

## Clean-State Verification

```bash
rmdir node_modules + all dist/ + .next          # wiped everything generated
pnpm install                                    # 3.7s from store, exit 0
pnpm check                                      # build + typecheck + lint +
                                                # format:check + test — all green
```

| Gate | Result |
|---|---|
| Build (5 packages + Next.js) | ✅ Done, zero errors |
| Typecheck | ✅ Zero `error TS` |
| Lint (eslint + `next lint`) | ✅ Zero warnings/errors |
| Format (`prettier --check .`) | ✅ Clean |
| Tests | ✅ 267/267 (domain 79, fixtures 53, verification 5, git-ingest 121, analysis 4, api 5) |

Note: earlier session logs quoted "242 git-ingest / 386 total" — those counts
included stale `dist/` duplicates. 121 / 267 are the true unique totals after
`testPathIgnorePatterns` excludes compiled output. Nothing was lost.

---

## Validation

- **TypeScript:** zero errors from a clean tree (`tsc --noEmit` per package + web)
- **Tests:** 267/267 passing, zero stderr warnings
- **Install:** reproducible from empty `node_modules` via committed lockfile
- **Example:** `pnpm --filter @mergemind/git-ingest example` prints 4 files + 4 evidence records
- **No teammate feature logic included** — audit fixes only; stubs and extension points untouched
