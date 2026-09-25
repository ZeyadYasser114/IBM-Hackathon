// ─────────────────────────────────────────────────────────────────────────────
// MergeMind — Core semantic types
// These are the stable interfaces the UI builds against.
// The real semantic engine will satisfy the same shapes.
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type ConflictKind = 'BUSINESS_RULE' | 'CONTRACT' | 'DEPENDENCY';
export type VerificationStatus = 'PASS' | 'FAIL' | 'PENDING';
export type AgentStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR';

// ── Assumption ────────────────────────────────────────────────────────────────

export interface Assumption {
  id: string;
  /** Human-readable claim this change makes */
  statement: string;
  /** File path relative to repo root */
  sourceFile: string;
  /** Line range, e.g. "12-18" */
  sourceLine: string;
  /** Which shared variable / concept this assumption touches */
  dependsOn: string;
  /** Which analysis agent produced this assumption */
  producedBy: string;
}

// ── Conflict ──────────────────────────────────────────────────────────────────

export interface Conflict {
  id: string;
  kind: ConflictKind;
  severity: Severity;
  title: string;
  description: string;
  /** The original requirement text this conflict violates */
  requirementText: string;
  assumptionA: Assumption;
  assumptionB: Assumption;
  /** Files directly involved */
  affectedFiles: string[];
  /** Whether a resolution has been accepted */
  resolved: boolean;
  /** Bob-proposed resolution summary */
  proposedResolution?: string;
}

// ── Conflict Graph ────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  kind: 'REQUIREMENT' | 'CHANGE' | 'ASSUMPTION' | 'FILE' | 'CONFLICT';
  label: string;
  severity?: Severity;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ConflictGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  conflicts: Conflict[];
}

// ── Agent run ─────────────────────────────────────────────────────────────────

export interface AgentRun {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  /** Elapsed ms (undefined while pending) */
  elapsedMs?: number;
  /** Short finding summary (available when COMPLETE) */
  finding?: string;
}

// ── Verify Change input ───────────────────────────────────────────────────────

export interface VerifyChangeInput {
  repository: string;
  featureRequest: string;
  branchA: string;
  branchB: string;
}

// ── Change Passport ───────────────────────────────────────────────────────────

export interface ChangePassport {
  id: string;
  generatedAt: string; // ISO-8601
  feature: string;
  intent: string;
  filesChanged: number;
  components: string[];
  assumptionsFound: number;
  assumptionsVerified: number;
  conflictsFound: number;
  conflictsResolved: number;
  testsTotal: number;
  testsPassing: number;
  requirementCoverage: number; // 0-100
  remainingRisk: string;
  status: VerificationStatus;
  conflicts: Conflict[];
}

// ── Analysis session ──────────────────────────────────────────────────────────

export interface AnalysisSession {
  id: string;
  input: VerifyChangeInput;
  agents: AgentRun[];
  graph: ConflictGraph;
  passport: ChangePassport;
}
