/**
 * @mergemind/domain
 *
 * All shared domain types for the MergeMind platform.
 * These types are the contracts between every layer (git-ingest, analysis,
 * verification, api, web). Change them carefully — every package depends on them.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 date-time string */
export type ISODateString = string;

/** Unique identifier (UUID v4) */
export type Id = string;

// ---------------------------------------------------------------------------
// Repository / Git Ingestion
// ---------------------------------------------------------------------------

export type BranchRef = {
  /** Short branch name, e.g. "feature/add-billing" */
  name: string;
  /** Full Git SHA (40 hex chars) */
  sha: string;
};

export type FileDiff = {
  /** Repo-relative path, e.g. "src/auth/roles.ts" */
  path: string;
  /** Raw unified diff text */
  patch: string;
  /** Lines added */
  additions: number;
  /** Lines removed */
  deletions: number;
};

export type RepositoryContext = {
  /** Human-readable name of the repository */
  name: string;
  /**
   * Root path (local) or HTTPS URL (remote).
   * Extension point: git-ingest resolves this to actual diffs.
   */
  location: string;
  /** Base branch being merged into (typically "main") */
  baseBranch: BranchRef;
  /** Feature branches carrying the changes to be verified */
  featureBranches: BranchRef[];
  /** All file-level diffs across feature branches */
  diffs: FileDiff[];
};

// ---------------------------------------------------------------------------
// Requirement / Intent
// ---------------------------------------------------------------------------

export type FeatureRequirement = {
  id: Id;
  /** Free-text description of what the developer asked for */
  description: string;
  /**
   * Business rules extracted from the description.
   * Extension point: Intent Agent populates this field.
   */
  rules: string[];
};

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

/**
 * A structured assumption extracted from a branch's changes.
 * Extension point: each analysis agent produces Assumption records.
 */
export type Assumption = {
  id: Id;
  /** Which branch introduced this assumption */
  branchName: string;
  /** Repo-relative file path where the assumption originates */
  sourceFile: string;
  /**
   * Human-readable statement of the assumption.
   * Example: "The privileged organization role is 'owner'"
   */
  statement: string;
  /**
   * The shared concept this assumption is about.
   * Used for grouping during conflict detection.
   * Example: "privileged-role", "user-id-field-name"
   */
  concept: string;
  /** Raw value or expression extracted from code. Example: "'owner'", "'admin'" */
  value: string;
  /** Which agent produced this assumption */
  sourceAgent: AgentType;
};

// ---------------------------------------------------------------------------
// Conflict Detection
// ---------------------------------------------------------------------------

export type ConflictSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type ConflictClass =
  | 'business-rule'  // Two agents interpret a requirement differently
  | 'contract'       // One component changes something another depends on
  | 'dependency';    // One change invalidates an assumption elsewhere

/**
 * A semantic conflict between two or more assumptions.
 * Extension point: verification package populates this from Assumption arrays.
 */
export type SemanticConflict = {
  id: Id;
  /** Short title for display */
  title: string;
  /** Full explanation of why these assumptions conflict */
  description: string;
  severity: ConflictSeverity;
  conflictClass: ConflictClass;
  /** The assumptions that are in conflict */
  assumptionIds: Id[];
  /** All source files involved */
  affectedFiles: string[];
  /**
   * Bob-proposed fix text.
   * Extension point: AI orchestration layer populates this.
   */
  proposedResolution: string | null;
};

// ---------------------------------------------------------------------------
// Verification Result
// ---------------------------------------------------------------------------

export type VerificationStatus = 'PASS' | 'FAIL' | 'PENDING' | 'IN_PROGRESS';

/**
 * The top-level output of a MergeMind verification run.
 * Extension point: api layer assembles this from all sub-results.
 */
export type VerificationResult = {
  id: Id;
  requirementId: Id;
  repositoryName: string;
  status: VerificationStatus;
  startedAt: ISODateString;
  completedAt: ISODateString | null;
  assumptions: Assumption[];
  conflicts: SemanticConflict[];
  /** Summary counts — derived fields for fast display */
  summary: VerificationSummary;
};

export type VerificationSummary = {
  assumptionsFound: number;
  conflictsFound: number;
  conflictsResolved: number;
  filesChanged: number;
  /** Overall requirement coverage percentage 0–100 */
  requirementCoverage: number;
};

// ---------------------------------------------------------------------------
// Change Passport
// ---------------------------------------------------------------------------

/**
 * Permanent, machine-readable record of what was verified.
 * Extension point: Change Passport branch generates this from VerificationResult.
 */
export type ChangePassport = {
  id: Id;
  verificationId: Id;
  feature: string;
  intent: string;
  generatedAt: ISODateString;
  result: VerificationResult;
  /** Risk items that remain unresolved after verification */
  remainingRisks: string[];
};

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

/**
 * The specialized Bob subagents in the analysis pipeline.
 * Extension point: analysis package maps each AgentType to a Bob task.
 */
export type AgentType = 'intent' | 'contract' | 'dependency' | 'adversary' | 'change';

export type AgentStatus = 'idle' | 'running' | 'complete' | 'failed';

export type AgentProgress = {
  agentType: AgentType;
  status: AgentStatus;
  startedAt: ISODateString | null;
  completedAt: ISODateString | null;
  /** Brief status message shown in the UI progress panel */
  message: string;
};

// ---------------------------------------------------------------------------
// API request / response shapes
// ---------------------------------------------------------------------------

export type VerifyRequest = {
  requirement: FeatureRequirement;
  repository: RepositoryContext;
};

export type VerifyResponse = {
  verificationId: Id;
  status: VerificationStatus;
};

export type HealthResponse = {
  status: 'ok';
  version: string;
  timestamp: ISODateString;
};
