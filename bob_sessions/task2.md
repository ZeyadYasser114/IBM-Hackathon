# Task 2 — Shared Domain Contract Layer for MergeMind

**Date:** 2024-08-01  
**Status:** ✅ Complete — 156/156 tests passing across all 5 packages

---

## Objective

Build the shared domain contract layer for MergeMind so all future branches can communicate through the same types without depending on each other's internal implementations.

---

## What Was Built

### Package: `@mergemind/domain`

All contracts live in `packages/domain/src/` and are exported from a single entry point (`@mergemind/domain`) with Zod validation schemas available via a deep export (`@mergemind/domain/schemas`).

---

### Enums — `src/enums.ts`

All discriminant unions follow the `const object + union type` pattern so they work as both runtime values (`EvidenceSource.SOURCE_CODE`) and TypeScript types.

| Export | Values |
|---|---|
| `EvidenceSource` | `SOURCE_CODE` · `TEST` · `COMMENT` · `CONFIG` · `SCHEMA` · `INFERRED` · `FILE_CHANGE` (new) |
| `ConfidenceLevel` | `HIGH` · `MEDIUM` · `LOW` (with documented numeric thresholds: ≥0.90 / 0.60–0.89 / <0.60) |
| `ConflictSeverity` | `CRITICAL` · `HIGH` · `MEDIUM` · `LOW` |
| `ConflictCategory` | `BUSINESS_RULE` · `CONTRACT` · `DEPENDENCY` · `DATA_SCHEMA` · `TEST_EXPECTATION` · `LOGIC` (new) · `SECURITY` (new) · `CONFIGURATION` (new) |
| `VerificationStatus` | `PENDING` · `IN_PROGRESS` · `PASS` · `FAIL` · `CANCELLED` · `ERROR` |
| `AgentType` | `intent` · `contract` · `dependency` · `adversary` · `change` |
| `AgentStatus` | `idle` · `running` · `complete` · `failed` |
| `ChangeKind` (new) | `ADDED` · `MODIFIED` · `DELETED` · `RENAMED` |

---

### Domain Models — `src/models/`

| File | Type(s) | Key design notes |
|---|---|---|
| `feature-request.ts` | `FeatureRequest`, `AcceptanceCriterion` | `acceptanceCriteria[]` for per-criterion coverage tracking; `tags[]`, `submittedBy` for routing/audit |
| `repository-source.ts` | `RepositorySource`, `BranchRef` | `id` + `cloneUrl` + `provider`; `featureBranches` requires ≥ 1 entry; `resolvedAt` pins the snapshot in time |
| `changed-file.ts` | `ChangedFile` | Uses `ChangeKind`; `previousPath` only present when `kind === 'RENAMED'`; `language` is a nullable best-effort hint |
| `code-evidence.ts` | `CodeEvidence` | Citation model — every claim cites its evidence; `lineStart`/`lineEnd` co-null invariant; `metadata: Record<string,string>` escape hatch for source-specific data |
| `assumption.ts` | `Assumption` | `concept` is kebab-case for cross-branch grouping; both `confidence` label + `numericConfidence` score stored; `evidence[]` ordered strongest-first |
| `dependency-reference.ts` | `DependencyReference`, `DependencyEndpoint`, `DependencyKind` | Directional `from → to` edge; `isCrossModule` flag; open `DependencyKind` union covers IMPORT · FUNCTION_CALL · TYPE_EXTENDS · SHARED_STATE · EVENT · DATA_REFERENCE · OTHER |
| `conflict-finding.ts` | `ConflictFinding` | `proposedResolution`/`resolvedAt` are co-null (both set or both null); `conflictEvidence` is separate from individual assumption evidence |
| `verification-result.ts` | `VerificationResult`, `VerificationSummary` | `schemaVersion` for forward-compat; `featureRequest` + `repositorySource` embedded (self-describing artifact); `conflictsBySeverity` always has all four keys |
| `change-passport-draft.ts` | `ChangePassportDraft`, `RiskItem` | `approvedBy`/`approvedAt` co-null; `verificationResultId` must match embedded result `id`; snapshot semantics (later edits don't back-propagate) |
| `agent-progress.ts` | `AgentProgress` | Compatibility shim for the analysis pipeline's live progress events |

---

### Zod Validation Schemas — `src/schemas/index.ts`

Imported via `@mergemind/domain/schemas`. Use at system boundaries (API endpoints, file I/O, message queues).

**Cross-field refinements enforced:**

- **`CodeEvidenceSchema`** — `lineEnd ≥ lineStart`; both null or both non-null
- **`ChangedFileSchema`** — `previousPath` required when `kind === 'RENAMED'`
- **`AssumptionSchema`** — `concept` must be lowercase kebab-case; `numericConfidence` in `[0, 1]`
- **`ConflictFindingSchema`** — `proposedResolution`/`resolvedAt` co-null; `affectedAssumptionIds` must have ≥ 1 entry
- **`VerificationSummarySchema`** — `conflictsResolved ≤ conflictsFound`; `requirementCoverage` in `[0, 100]`
- **`VerificationResultSchema`** — `completedAt` must be null for `PENDING`/`IN_PROGRESS`; `errorMessage` required when `status === 'ERROR'`
- **`ChangePassportDraftSchema`** — `approvedBy`/`approvedAt` co-null; `verificationResultId` must equal embedded `verificationResult.id`

---

### Backward-Compatible Legacy Aliases — `src/index.ts`

Existing packages continue to compile without modification. All aliases are `@deprecated` in JSDoc.

| Legacy name | New name |
|---|---|
| `FeatureRequirement` | `FeatureRequest` |
| `RepositoryContext` | `RepositorySource` |
| `FileDiff` | `ChangedFile` |
| `SemanticConflict` | `ConflictFinding` |

---

### Schema Tests — `src/index.test.ts`

**126 tests** across all schemas, covering:

- Valid acceptance for every schema (including edge cases: empty arrays, null fields, INFERRED evidence with null lines)
- Enum guard rejection (unknown `source`, `kind`, `category`, `severity`, `status`, `sourceAgent`)
- Cross-field refinement rejection (`lineEnd < lineStart`, `RENAMED` without `previousPath`, `PENDING` with `completedAt` set, `ERROR` with null `errorMessage`, `conflictsResolved > conflictsFound`, mismatched `verificationResultId`)
- All 3 new `ConflictCategory` values (`LOGIC`, `SECURITY`, `CONFIGURATION`) explicitly tested

---

### Canonical JSON Fixture — `fixtures/canonical-verification-result.json`

Complete `VerificationResult` for the `auth/owner` vs `billing/admin` role-mismatch demo scenario:

- `status: FAIL`
- 3 assumptions across 2 feature branches (`feature/auth-roles-owner`, `feature/billing-subscriptions`)
- 1 `HIGH / BUSINESS_RULE` unresolved conflict
- `requirementCoverage: 50` (1 of 2 acceptance criteria covered)
- `conflictsBySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 }`
- All UUIDs valid v4, all SHAs 40 lowercase hex, all dates ISO-8601 UTC
- **Verified by parsing live against `VerificationResultSchema` → PASS**

---

## Other Packages Updated

All existing packages were migrated to use the new types. No breaking changes were introduced.

| Package | Change |
|---|---|
| `@mergemind/analysis` | `AgentRunner.run()` signature updated from `FeatureRequirement`/`RepositoryContext` to `FeatureRequest`/`RepositorySource`; test fixtures updated to full `FeatureRequest` + `RepositorySource` shape |
| `@mergemind/verification` | `runVerification()` input restructured to accept `featureRequest` + `repositorySource` directly; `VerificationResult` now fully schema-compliant (includes `schemaVersion`, `errorMessage`, `conflictsBySeverity`); coverage heuristic updated to use `acceptanceCriteria` |
| `@mergemind/git-ingest` | Updated to emit `RepositorySource` + `ChangedFile[]` from `createRepositoryContext()`; `ChangeKind` inferred from diff markers; `language` field populated by extension |
| `@mergemind/api` | tRPC input schemas updated to `FeatureRequest`/`RepositorySource`/`ChangedFile` shapes; `runAnalysis` uses new `RepositoryDescriptor` + `createRepositoryContext()` API |

---

## Final Test Results

```
packages/domain      126 / 126 tests  PASS
packages/git-ingest   12 /  12 tests  PASS
packages/verification 10 /  10 tests  PASS
packages/analysis      8 /   8 tests  PASS
─────────────────────────────────────────
Total                156 / 156 tests  PASS
```
