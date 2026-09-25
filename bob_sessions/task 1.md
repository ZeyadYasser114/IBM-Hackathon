# Task 1 — Architecture Review: MergeMind Hackathon Foundation

## 1. What is already good

**Monorepo topology is correct and clean.**
The `pnpm` workspace with `packages/*` + `apps/*` is the right split. Every package has a single, focused responsibility and the dependency graph is strictly acyclic:

```
domain  ←  git-ingest  ←  analysis  ←┐
   ↑                                  api  ←  web
   └──────────  verification  ←───────┘
```

No cycles, no cross-package side-effects. Teammates working in different packages will not stomp on each other.

**`@mergemind/domain` is a proper contract package.**
All shared types (`FeatureRequirement`, `Assumption`, `SemanticConflict`, `VerificationResult`, `AgentProgress`, `BranchRef`, etc.) live in one place with zero runtime dependencies. Any branch can import it as a read-only reference. This is the most important structural decision in the repo and it's done correctly.

**Stub-first strategy is exactly right for a 48-hour build.**
Every feature extension point (`AgentRunner`, `ConflictDetector`, `IngestAdapter`) has a working no-op implementation. The app runs end-to-end from the demo fixture today, and any branch can replace exactly one stub without touching other packages.

**tRPC end-to-end type safety is properly wired.**
`packages/api/src/index.ts` → `apps/web/src/lib/trpc.ts` → `apps/web/src/components/TRPCProvider.tsx` is the right three-layer setup. Adding a new procedure in `api` automatically surfaces as a typed hook in React — no manual API glue.

**The demo fixture is exactly scoped.**
`apps/web/src/fixtures/demo-scenario.ts` encodes the canonical auth/billing role conflict scenario with real diffs. Every team can use it as a test input without needing a live repo.

**Health probe is functional from day one.**
`GET /health` calls the real tRPC caller and returns structured JSON — teammates can verify the app is up with a single `curl`.

**Tests cover the real contracts, not just types.**
`packages/verification/src/index.test.ts` injects a mock `ConflictDetector` and asserts `FAIL` status — this is the exact seam the conflict-detection branch will implement against. `packages/git-ingest/src/index.test.ts` tests the diff parser with the actual fixture diff text.

**TypeScript config is strict and consistent.**
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `strict: true` in `tsconfig.base.json` will catch the class of bugs (undefined role values, optional field access) that are the most likely failure mode for this domain.

---

## 2. What should be changed

**Critical — `@mergemind/analysis` has a wrong dependency.**
`packages/analysis/package.json` lists `@mergemind/git-ingest` as a dependency, but `packages/analysis/src/index.ts` never imports from it. Analysis operates on a `RepositoryContext` value that git-ingest already produced — it should not depend on the ingestion package at all. This creates an unnecessary coupling that will produce merge conflicts if the git-ingest branch refactors its exports.

**Significant — test import paths are wrong.**
Both `packages/analysis/src/index.test.ts:1` and `packages/verification/src/index.test.ts:1` import using `'../src/index.js'` — the test file *is already in* `src/`, making this a `src/src/` double-nesting that will fail at runtime. The correct import is `'./index.js'`.

**Significant — `next.config.mjs` is incomplete.**
`transpilePackages` only lists `@mergemind/api` and `@mergemind/domain`. When the analysis-branch or verification-branch code lands (or if Next.js server components reference those packages directly), builds will fail with ESM interop errors. All five `@mergemind/*` workspace packages should be listed.

**Minor — `verify.start` is fire-and-forget with no error recovery.**
`packages/api/src/index.ts:123` calls `void runAnalysis(...)` and the `resultStore` is never populated if `runAnalysis` throws. The result entry simply never appears. For a 48-hour demo this is fine, but it will silently confuse anyone polling `verify.result` when an error occurs. A minimal `try/catch` that stores a `FAIL` status would make debugging much faster.

---

## 3. Recommended architecture / structure

The current structure is correct. No reorganisation is needed. The two dependency fixes applied:

```
packages/
  domain/          ← types only, no deps            ✅ correct
  git-ingest/      ← depends on domain only          ✅ correct
  analysis/        ← depends on domain only          ⚠ remove git-ingest dep
  verification/    ← depends on domain only          ✅ correct
  api/             ← depends on all four packages    ✅ correct
apps/
  web/             ← depends on api + domain         ✅ correct
```

The five-screen UI flow maps cleanly to the API surface that already exists:
- **Screen 1** → `verify.start` mutation (exists)
- **Screen 2** → `AgentProgress[]` returned in result or via polling (structure exists)
- **Screen 3/4** → `VerificationResult.conflicts[]` with `SemanticConflict` shape (exists in domain)
- **Screen 5** → `VerificationResult` + `ChangePassport` type (exists in domain)

---

## 4. Extension points for other branches

| Branch concern | Extension point | Where |
|---|---|---|
| AI agent orchestration | Implement `AgentRunner` interface, pass to `AnalysisPipeline.create([...])` | `packages/analysis/src/index.ts:39` |
| Semantic conflict detection | Implement `ConflictDetector`, pass as `input.detector` to `runVerification()` | `packages/verification/src/index.ts:39` |
| Real Git / GitHub ingestion | Implement `IngestAdapter`, pass to `createRepositoryContext()` | `packages/git-ingest/src/index.ts:24` |
| New API procedures | Add sub-router, merge into `appRouter` | `packages/api/src/index.ts:140` |
| Auth / request context | Implement `createContext`, pass to `fetchRequestHandler` | `apps/web/src/app/api/trpc/[trpc]/route.ts:16` |
| Screen 2 live progress | Wire `AgentProgress` callbacks to SSE or WebSocket | `packages/api` — `runAnalysis` already calls the `onProgress` callback |
| Change Passport generation | `ChangePassport` type is defined, no generator yet | `packages/domain/src/index.ts:177` |
| UI design system | All styles are inline or CSS variables in `globals.css` — drop-in Tailwind or any component library | `apps/web/src/app/globals.css` |

---

## Action items before branching

1. Remove `@mergemind/git-ingest` from `packages/analysis/package.json` dependencies — analysis does not import it.
2. Fix test imports in `packages/analysis/src/index.test.ts` and `packages/verification/src/index.test.ts` from `'../src/index.js'` → `'./index.js'`.
3. Add all five workspace packages to `transpilePackages` in `apps/web/next.config.mjs`.
