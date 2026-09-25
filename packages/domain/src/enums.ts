/**
 * enums.ts
 *
 * All discriminant unions and enum-like constants used throughout MergeMind.
 * Defined as `const` object + union type pairs so they work equally well as
 * runtime values (switch statements, serialized strings) and TypeScript types.
 *
 * Convention:
 *   const FOO_VALUES = { ... } as const;
 *   export type Foo = (typeof FOO_VALUES)[keyof typeof FOO_VALUES];
 *   export const Foo = FOO_VALUES;   ← allows Foo.HIGH at runtime
 */

// ---------------------------------------------------------------------------
// Evidence & Confidence
// ---------------------------------------------------------------------------

const EVIDENCE_SOURCE_VALUES = {
  /** The evidence was found in production source code (AST or text match) */
  SOURCE_CODE: 'SOURCE_CODE',
  /** The evidence was found in a test file */
  TEST: 'TEST',
  /** The evidence was found in inline or doc comments */
  COMMENT: 'COMMENT',
  /** The evidence was found in a configuration file (env, yaml, json, toml …) */
  CONFIG: 'CONFIG',
  /** The evidence was found in a schema or database migration file */
  SCHEMA: 'SCHEMA',
  /**
   * The evidence was inferred by an AI agent; no verbatim match exists.
   * When serialized, the originating model/agent should be captured in the
   * parent CodeEvidence.metadata field.
   */
  INFERRED: 'INFERRED',
  /**
   * The evidence is derived from the file-change diff itself (added/removed lines).
   * Useful when the line context is more relevant than the file type.
   */
  FILE_CHANGE: 'FILE_CHANGE',
} as const;

export type EvidenceSource = (typeof EVIDENCE_SOURCE_VALUES)[keyof typeof EVIDENCE_SOURCE_VALUES];
export const EvidenceSource = EVIDENCE_SOURCE_VALUES;

// ---------------------------------------------------------------------------

const CONFIDENCE_LEVEL_VALUES = {
  /**
   * Very high certainty — backed by multiple independent code evidences.
   * Numeric threshold: ≥ 0.90
   */
  HIGH: 'HIGH',
  /**
   * Reasonable certainty — at least one direct code reference.
   * Numeric threshold: 0.60–0.89
   */
  MEDIUM: 'MEDIUM',
  /**
   * Weak signal — heuristic or purely inferential.
   * Numeric threshold: < 0.60
   */
  LOW: 'LOW',
} as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVEL_VALUES)[keyof typeof CONFIDENCE_LEVEL_VALUES];
export const ConfidenceLevel = CONFIDENCE_LEVEL_VALUES;

// ---------------------------------------------------------------------------
// Conflict classification
// ---------------------------------------------------------------------------

const CONFLICT_SEVERITY_VALUES = {
  /** Must be resolved before merge — very likely causes runtime failures */
  CRITICAL: 'CRITICAL',
  /** Strong risk of incorrect behaviour under normal usage */
  HIGH: 'HIGH',
  /** Potential inconsistency that may surface in edge cases */
  MEDIUM: 'MEDIUM',
  /** Cosmetic or low-impact divergence */
  LOW: 'LOW',
} as const;

export type ConflictSeverity = (typeof CONFLICT_SEVERITY_VALUES)[keyof typeof CONFLICT_SEVERITY_VALUES];
export const ConflictSeverity = CONFLICT_SEVERITY_VALUES;

// ---------------------------------------------------------------------------

const CONFLICT_CATEGORY_VALUES = {
  /**
   * Two branches encode different interpretations of a shared business rule.
   * Example: one branch checks `role === 'owner'`, another `role === 'admin'`.
   */
  BUSINESS_RULE: 'BUSINESS_RULE',
  /**
   * A branch changes the public contract (interface / type / API shape) that
   * another branch also consumes or implements.
   */
  CONTRACT: 'CONTRACT',
  /**
   * A branch's change invalidates a runtime assumption that another branch
   * depends on (ordering, nullability, field existence).
   */
  DEPENDENCY: 'DEPENDENCY',
  /**
   * Two branches modify the same data schema in incompatible ways
   * (column rename, type change, constraint addition).
   */
  DATA_SCHEMA: 'DATA_SCHEMA',
  /**
   * A behaviour change in one branch conflicts with an existing test in another.
   */
  TEST_EXPECTATION: 'TEST_EXPECTATION',
  /**
   * Two branches apply different or contradictory conditional logic
   * (branching, guard clauses, fallback values).
   */
  LOGIC: 'LOGIC',
  /**
   * One branch introduces or removes a security control that another branch
   * relies on or assumes to be absent.
   */
  SECURITY: 'SECURITY',
  /**
   * Two branches change the same configuration key with incompatible values
   * or semantics (feature flags, environment variables, timeouts).
   */
  CONFIGURATION: 'CONFIGURATION',
} as const;

export type ConflictCategory = (typeof CONFLICT_CATEGORY_VALUES)[keyof typeof CONFLICT_CATEGORY_VALUES];
export const ConflictCategory = CONFLICT_CATEGORY_VALUES;

// ---------------------------------------------------------------------------
// Verification lifecycle
// ---------------------------------------------------------------------------

const VERIFICATION_STATUS_VALUES = {
  /** Run has been accepted but not yet started */
  PENDING: 'PENDING',
  /** Analysis pipeline is actively running */
  IN_PROGRESS: 'IN_PROGRESS',
  /** All checks passed — no unresolved conflicts */
  PASS: 'PASS',
  /** One or more unresolved conflicts remain */
  FAIL: 'FAIL',
  /** Run was cancelled by a user or a timeout policy */
  CANCELLED: 'CANCELLED',
  /** An internal error prevented the run from completing */
  ERROR: 'ERROR',
} as const;

export type VerificationStatus =
  (typeof VERIFICATION_STATUS_VALUES)[keyof typeof VERIFICATION_STATUS_VALUES];
export const VerificationStatus = VERIFICATION_STATUS_VALUES;

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

const AGENT_TYPE_VALUES = {
  /**
   * Extracts the developer's original intent and business rules
   * from the feature request description.
   */
  INTENT: 'intent',
  /**
   * Inspects interface, type, and API boundary changes across branches.
   */
  CONTRACT: 'contract',
  /**
   * Traces runtime dependency chains: imports, shared state, event flows.
   */
  DEPENDENCY: 'dependency',
  /**
   * Looks for adversarial edge cases: security bypasses, data corruption paths.
   */
  ADVERSARY: 'adversary',
  /**
   * Assembles the Change Passport summary from all other agents' outputs.
   */
  CHANGE: 'change',
} as const;

export type AgentType = (typeof AGENT_TYPE_VALUES)[keyof typeof AGENT_TYPE_VALUES];
export const AgentType = AGENT_TYPE_VALUES;

// ---------------------------------------------------------------------------

const AGENT_STATUS_VALUES = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETE: 'complete',
  FAILED: 'failed',
} as const;

export type AgentStatus = (typeof AGENT_STATUS_VALUES)[keyof typeof AGENT_STATUS_VALUES];
export const AgentStatus = AGENT_STATUS_VALUES;

// ---------------------------------------------------------------------------
// Change file status (git)
// ---------------------------------------------------------------------------

const CHANGE_KIND_VALUES = {
  /** File was added in this branch and does not exist on the base branch */
  ADDED: 'ADDED',
  /** File was modified — exists on both base and feature branch */
  MODIFIED: 'MODIFIED',
  /** File was deleted in this branch */
  DELETED: 'DELETED',
  /** File was renamed (may also carry content changes) */
  RENAMED: 'RENAMED',
} as const;

export type ChangeKind = (typeof CHANGE_KIND_VALUES)[keyof typeof CHANGE_KIND_VALUES];
export const ChangeKind = CHANGE_KIND_VALUES;
