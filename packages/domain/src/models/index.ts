/**
 * models/index.ts
 *
 * Barrel file for all domain model types.
 * Import from '@mergemind/domain' — not from this file directly.
 */

export type { AcceptanceCriterion, FeatureRequest } from './feature-request.js';
export type { BranchRef, RepositorySource } from './repository-source.js';
export type { ChangedFile } from './changed-file.js';
export type { CodeEvidence } from './code-evidence.js';
export type { Assumption } from './assumption.js';
export type {
  DependencyKind,
  DependencyEndpoint,
  DependencyReference,
} from './dependency-reference.js';
export type { ConflictFinding } from './conflict-finding.js';
export type { VerificationSummary, VerificationResult } from './verification-result.js';
export type { RiskItem, ChangePassportDraft } from './change-passport-draft.js';
export type { AgentProgress } from './agent-progress.js';
