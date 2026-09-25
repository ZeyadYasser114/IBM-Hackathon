/**
 * types.ts
 *
 * Lightweight types used by every fixture in this package.
 * These are NOT domain types — they are the structural wrapper
 * that carries a scenario's truth data for tests and demos.
 */

import type { VerificationResult } from '@mergemind/domain';

/**
 * A single file inside a fictional repository branch, represented
 * as an in-memory record so tests do not need the filesystem.
 */
export type RepoFile = {
  /** Repository-relative path, e.g. "src/auth/roles.ts" */
  path: string;
  /** Full file content as it exists after this branch's changes */
  content: string;
};

/**
 * A unified diff string (output of `git diff`) showing exactly what
 * one branch changed relative to the base.
 */
export type PatchFixture = {
  branchName: string;
  diff: string;
};

/**
 * Self-contained description of one semantic-conflict scenario.
 * All fields are plain data — no functions, no classes.
 */
export type ScenarioFixture = {
  /** Unique slug — safe for use in file names and Jest test IDs */
  id: string;
  /** One-line human title */
  title: string;
  /**
   * The original requirement or feature-request prose that spawned
   * both parallel branches.
   */
  originalRequirement: string;
  /**
   * The category of conflict this scenario demonstrates.
   * Maps to ConflictCategory in @mergemind/domain.
   */
  conflictCategory: 'BUSINESS_RULE' | 'CONTRACT' | 'DEPENDENCY';
  /** Files as they exist on the base branch (the common ancestor) */
  baseFiles: RepoFile[];
  /** Each element is one parallel branch with its changed files */
  branches: {
    name: string;
    /** Only the files this branch touches, in their post-change state */
    changedFiles: RepoFile[];
    /** Unified diff against the base for this branch */
    patch: string;
  }[];
  /**
   * Human-readable explanation of the contradiction that a person
   * (or detector) should surface after merging both branches.
   * Must be understandable in ≤ 30 seconds.
   */
  expectedContradiction: string;
  /**
   * Repository-relative paths of the files involved in the conflict.
   * A detector should report at least these files as affected.
   */
  expectedAffectedFiles: string[];
  /**
   * Components / services / modules that are impacted by the conflict.
   */
  expectedAffectedComponents: string[];
  /**
   * A ready-to-use VerificationResult in the canonical domain format.
   * Represents the ground-truth output that a correct detector should
   * produce (or closely approximate) for this scenario.
   */
  canonicalResult: VerificationResult;
};
