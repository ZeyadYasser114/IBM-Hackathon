/**
 * testing/factories.ts
 *
 * Deterministic factory functions for every shared domain model.
 *
 * Purpose: future branches (detectors, passport, UI) can build valid test
 * objects without duplicating setup. Every factory returns fixed, schema-valid
 * values by default and accepts a partial override for the fields under test:
 *
 *   import { makeAssumption } from '@mergemind/domain/testing';
 *   const a = makeAssumption({ statement: '...' }); // everything else filled in
 *
 * Rules:
 *   - No randomness, no I/O, no Date.now() — output is byte-identical on every
 *     run so snapshot tests are stable.
 *   - Every default object passes its Zod schema in `@mergemind/domain/schemas`.
 *   - IDs are fixed valid UUIDs; tests that need uniqueness should override `id`.
 */

import type { Id } from '../primitives.js';
import type { AcceptanceCriterion, FeatureRequest } from '../models/feature-request.js';
import type { BranchRef, RepositorySource } from '../models/repository-source.js';
import type { ChangedFile } from '../models/changed-file.js';
import type { CodeEvidence } from '../models/code-evidence.js';
import type { Assumption } from '../models/assumption.js';
import type { DependencyEndpoint, DependencyReference } from '../models/dependency-reference.js';
import type { ConflictFinding } from '../models/conflict-finding.js';
import type { VerificationResult, VerificationSummary } from '../models/verification-result.js';
import type { ChangePassportDraft, RiskItem } from '../models/change-passport-draft.js';
import type { AgentProgress } from '../models/agent-progress.js';

// ---------------------------------------------------------------------------
// Fixed deterministic primitives
// ---------------------------------------------------------------------------

/** Fixed timestamp used by every factory (2024-08-01T12:00:00.000Z). */
export const FIXED_DATE = '2024-08-01T12:00:00.000Z';

/** Fixed 40-hex SHAs for branch refs. */
export const FIXED_BASE_SHA = 'a'.repeat(40);
export const FIXED_FEATURE_SHA = 'b'.repeat(40);

/** Override helper — shallow-merges caller overrides onto defaults. */
type Override<T> = Partial<T>;

// ---------------------------------------------------------------------------
// FeatureRequest
// ---------------------------------------------------------------------------

export function makeAcceptanceCriterion(
  overrides: Override<AcceptanceCriterion> = {},
): AcceptanceCriterion {
  return {
    key: 'AC-1',
    description: 'Only organization owners can manage subscriptions.',
    ...overrides,
  };
}

export function makeFeatureRequest(overrides: Override<FeatureRequest> = {}): FeatureRequest {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    title: 'Add organization billing',
    description: 'Add organization billing. Only organization owners can manage subscriptions.',
    acceptanceCriteria: [makeAcceptanceCriterion()],
    rules: ['Only organization owners can manage subscriptions.'],
    tags: ['billing'],
    createdAt: FIXED_DATE,
    submittedBy: 'alice@example.com',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RepositorySource
// ---------------------------------------------------------------------------

export function makeBranchRef(overrides: Override<BranchRef> = {}): BranchRef {
  return {
    name: 'feature/auth',
    sha: FIXED_FEATURE_SHA,
    ...overrides,
  };
}

export function makeRepositorySource(overrides: Override<RepositorySource> = {}): RepositorySource {
  return {
    id: '223e4567-e89b-42d3-a456-426614174001',
    name: 'acme/platform',
    cloneUrl: 'https://github.com/acme/platform',
    provider: 'github',
    baseBranch: { name: 'main', sha: FIXED_BASE_SHA },
    featureBranches: [makeBranchRef()],
    resolvedAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ChangedFile
// ---------------------------------------------------------------------------

export function makeChangedFile(overrides: Override<ChangedFile> = {}): ChangedFile {
  const { previousPath, ...rest } = overrides;
  const base: ChangedFile = {
    path: 'src/auth/roles.ts',
    kind: 'MODIFIED',
    patch: '@@ -1 +1 @@ ...',
    additions: 1,
    deletions: 1,
    branchName: 'feature/auth',
    language: 'typescript',
  };
  // previousPath is optional under exactOptionalPropertyTypes — only set it
  // when the caller explicitly provides it.
  if (previousPath === undefined) return { ...base, ...rest };
  return { ...base, ...rest, previousPath };
}

// ---------------------------------------------------------------------------
// CodeEvidence
// ---------------------------------------------------------------------------

export function makeCodeEvidence(overrides: Override<CodeEvidence> = {}): CodeEvidence {
  return {
    source: 'SOURCE_CODE',
    filePath: 'src/auth/roles.ts',
    lineStart: 13,
    lineEnd: 13,
    snippet: "const PRIVILEGED_ROLE: Role = 'owner';",
    branchName: 'feature/auth',
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Assumption
// ---------------------------------------------------------------------------

export function makeAssumption(overrides: Override<Assumption> = {}): Assumption {
  return {
    id: '323e4567-e89b-42d3-a456-426614174002',
    branchName: 'feature/auth',
    sourceFile: 'src/auth/roles.ts',
    statement: "The privileged organization role is 'owner'",
    concept: 'privileged-role',
    value: "'owner'",
    sourceAgent: 'intent',
    evidence: [makeCodeEvidence()],
    confidence: 'HIGH',
    numericConfidence: 0.95,
    relatedAssumptionIds: [],
    extractedAt: FIXED_DATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DependencyReference
// ---------------------------------------------------------------------------

export function makeDependencyEndpoint(
  overrides: Override<DependencyEndpoint> = {},
): DependencyEndpoint {
  return {
    filePath: 'src/billing/service.ts',
    symbolName: 'checkBillingAccess',
    branchName: 'feature/billing',
    ...overrides,
  };
}

export function makeDependencyReference(
  overrides: Override<DependencyReference> = {},
): DependencyReference {
  return {
    id: '423e4567-e89b-42d3-a456-426614174003' as Id,
    from: makeDependencyEndpoint(),
    to: makeDependencyEndpoint({
      filePath: 'src/auth/roles.ts',
      symbolName: 'checkRole',
      branchName: 'feature/auth',
    }),
    kind: 'FUNCTION_CALL',
    isCrossModule: false,
    description: 'billing calls auth to verify owner role',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ConflictFinding
// ---------------------------------------------------------------------------

export function makeConflictFinding(overrides: Override<ConflictFinding> = {}): ConflictFinding {
  return {
    id: '523e4567-e89b-42d3-a456-426614174004',
    title: 'Privileged role assumption mismatch',
    description: "feature/auth uses 'owner' but feature/billing checks 'admin'.",
    severity: 'HIGH',
    category: 'BUSINESS_RULE',
    affectedAssumptionIds: ['323e4567-e89b-42d3-a456-426614174002'],
    affectedFiles: ['src/auth/roles.ts', 'src/billing/permissions.ts'],
    conflictEvidence: [makeCodeEvidence()],
    proposedResolution: null,
    resolvedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// VerificationResult
// ---------------------------------------------------------------------------

export function makeVerificationSummary(
  overrides: Override<VerificationSummary> = {},
): VerificationSummary {
  return {
    assumptionsFound: 1,
    conflictsFound: 1,
    conflictsResolved: 0,
    filesChanged: 2,
    requirementCoverage: 100,
    conflictsBySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
    ...overrides,
  };
}

export function makeVerificationResult(
  overrides: Override<VerificationResult> = {},
): VerificationResult {
  return {
    id: '623e4567-e89b-42d3-a456-426614174005',
    schemaVersion: '1.0.0',
    featureRequest: makeFeatureRequest(),
    repositorySource: makeRepositorySource(),
    status: 'FAIL',
    startedAt: FIXED_DATE,
    completedAt: FIXED_DATE,
    assumptions: [makeAssumption()],
    conflicts: [makeConflictFinding()],
    summary: makeVerificationSummary(),
    errorMessage: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ChangePassportDraft
// ---------------------------------------------------------------------------

export function makeRiskItem(overrides: Override<RiskItem> = {}): RiskItem {
  return {
    key: 'R-1',
    description: 'Privileged role mismatch not yet resolved.',
    severity: 'HIGH',
    sourceConflictId: '523e4567-e89b-42d3-a456-426614174004',
    ...overrides,
  };
}

export function makeChangePassportDraft(
  overrides: Override<ChangePassportDraft> = {},
): ChangePassportDraft {
  const verificationResult = makeVerificationResult();
  return {
    id: '723e4567-e89b-42d3-a456-426614174006',
    schemaVersion: '1.0.0',
    verificationResultId: verificationResult.id,
    title: 'Add organization billing — v1',
    intentSummary: 'Adds org billing; owners manage subscriptions.',
    changedFiles: ['src/auth/roles.ts', 'src/billing/permissions.ts'],
    remainingRisks: [makeRiskItem()],
    notableDecisions: ['Decided to unify on the "owner" role.'],
    verificationResult,
    generatedAt: FIXED_DATE,
    approvedBy: null,
    approvedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AgentProgress
// ---------------------------------------------------------------------------

export function makeAgentProgress(overrides: Override<AgentProgress> = {}): AgentProgress {
  return {
    agentType: 'intent',
    status: 'complete',
    startedAt: FIXED_DATE,
    completedAt: FIXED_DATE,
    message: 'Done — 1 assumption found',
    ...overrides,
  };
}
