/**
 * @mergemind/domain
 *
 * Single entry point for all shared domain contracts.
 *
 * Everything every package needs is exported from here:
 *   import type { FeatureRequest, VerificationResult } from '@mergemind/domain';
 *   import { ConflictSeverity, VerificationStatus } from '@mergemind/domain';
 *
 * Validation schemas live in a separate deep export to keep zod out of
 * consumers that only need types:
 *   import { VerificationResultSchema } from '@mergemind/domain/schemas';
 *
 * Change discipline: every field change here breaks every package.
 * - Add optional fields freely.
 * - Never remove or rename exported names without a major version bump.
 * - Deprecate by JSDoc @deprecated before removal.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type { Id, ISODateString, SemVer } from './primitives.js';

// ---------------------------------------------------------------------------
// Enums (runtime values + types)
//
// Each name is exported once: the single `export` carries both the runtime
// value and the type meaning, so no separate `export type` block is needed
// (a second export of the same name is a TS2300 duplicate identifier).
// ---------------------------------------------------------------------------

export {
  EvidenceSource,
  ConfidenceLevel,
  ConflictSeverity,
  ConflictCategory,
  VerificationStatus,
  AgentType,
  AgentStatus,
  ChangeKind,
} from './enums.js';

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

export type {
  AcceptanceCriterion,
  FeatureRequest,
} from './models/feature-request.js';

export type {
  BranchRef,
  RepositorySource,
} from './models/repository-source.js';

export type { ChangedFile } from './models/changed-file.js';

export type { CodeEvidence } from './models/code-evidence.js';

export type { Assumption } from './models/assumption.js';

export type {
  DependencyKind,
  DependencyEndpoint,
  DependencyReference,
} from './models/dependency-reference.js';

export type { ConflictFinding } from './models/conflict-finding.js';

export type {
  VerificationSummary,
  VerificationResult,
} from './models/verification-result.js';

export type {
  RiskItem,
  ChangePassportDraft,
} from './models/change-passport-draft.js';

// ---------------------------------------------------------------------------
// Legacy exports — kept for backward compatibility with packages written
// against the original index.ts.  Do not use these in new code.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `FeatureRequest` instead.
 * `FeatureRequirement` is retained so existing packages compile without change.
 */
export type {
  FeatureRequest as FeatureRequirement,
} from './models/feature-request.js';

/**
 * @deprecated Use `RepositorySource` instead.
 * `RepositoryContext` is retained so existing packages compile without change.
 * The legacy shape is narrower — consider migrating to `RepositorySource`.
 */
export type {
  RepositorySource as RepositoryContext,
} from './models/repository-source.js';

/**
 * @deprecated Use `ChangedFile` instead.
 * `FileDiff` is retained so existing packages compile without change.
 */
export type {
  ChangedFile as FileDiff,
} from './models/changed-file.js';

/**
 * @deprecated Use `ConflictFinding` instead.
 * `SemanticConflict` is retained so existing packages compile without change.
 */
export type {
  ConflictFinding as SemanticConflict,
} from './models/conflict-finding.js';

/**
 * @deprecated Use `VerificationResult` from models.
 * Re-exported at the top level for compatibility.
 */
export type {
  VerificationResult as VerificationResultLegacy,
} from './models/verification-result.js';

// Agent progress — used by existing analysis package
export type {
  AgentProgress,
} from './models/agent-progress.js';
