// ─────────────────────────────────────────────────────────────────────────────
// Semantic Adapter
//
// Integration seam between the UI and the semantic engine / API server.
// Live-first: when the API server is reachable, sessions carry REAL analysis
// results (mapped 1:1 from engine ConflictReports — nothing is invented).
// When the API is unreachable, or while analysis is still running, the UI
// falls back to fixture data so the demo flow always works.
//
// Set VITE_API_URL in .env to point at the backend (defaults to /api which
// the Vite dev server proxies to localhost:4000).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalysisSession,
  AgentRun,
  Assumption,
  ChangePassport,
  Conflict,
  ConflictGraph,
  EvidenceExcerpt,
  GraphEdge,
  GraphNode,
  VerifyChangeInput,
} from '@/types/semantic';
import { DEMO_SESSION, DEMO_AGENTS } from '@/data/demoFixtures';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

// Simulated network delay so the Analysis screen looks real.
const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// Whether the API server is available — checked lazily.
let apiAvailable: boolean | null = null;

async function checkApiAvailable(): Promise<boolean> {
  if (apiAvailable !== null) return apiAvailable;
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(800) });
    apiAvailable = r.ok;
  } catch {
    apiAvailable = false;
  }
  return apiAvailable;
}

// ── Live API payload shapes ───────────────────────────────────────────────────

interface ApiEvidenceSide {
  sourceLabel: string;
  statement: string;
  canonicalPredicate: string;
  evidenceText: string;
  filePath?: string;
}

interface ApiReport {
  id: string;
  title: string;
  conflictType: 'BUSINESS_RULE' | 'CONTRACT' | 'DEPENDENCY';
  affectedEntity: string;
  assumptionA: ApiEvidenceSide;
  assumptionB: ApiEvidenceSide;
  whyIncompatible: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  affectedFiles: string[];
  verificationHint: string;
}

interface ApiSession {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR';
  startedAt: string;
  completedAt: string | null;
  input: VerifyChangeInput;
  result?: {
    status: string;
    summary: string;
    assumptionsFound: number;
    conflictsFound: number;
    reports: ApiReport[];
  };
}

// ── Ordinal → numeric mappings (display necessity: UI badges need 0–100) ──────
// Engine confidence is ordinal (HIGH/MEDIUM/LOW); these are fixed representative
// values for that ordinal, not measured percentages.

const CONFIDENCE_SCORE = { HIGH: 90, MEDIUM: 65, LOW: 40 } as const;

function mapSeverity(s: ApiReport['severity']): Conflict['severity'] {
  return s === 'INFO' ? 'LOW' : s;
}

function mapSideToAssumption(
  side: ApiEvidenceSide,
  reportId: string,
  which: 'a' | 'b',
  affectedEntity: string,
): Assumption {
  return {
    id: `${reportId}::${which}`,
    statement: side.statement,
    // UI type explicitly permits '—' when a location is not traceable.
    sourceFile: side.filePath ?? '—',
    sourceLine: '—',
    dependsOn: affectedEntity,
    producedBy: side.sourceLabel,
  };
}

function mapSideToExcerpts(side: ApiEvidenceSide): EvidenceExcerpt[] {
  return [
    {
      file: side.filePath,
      location: side.sourceLabel,
      snippet: side.evidenceText,
      source: side.sourceLabel,
    },
  ];
}

export function mapReportToConflict(report: ApiReport, requirementText: string): Conflict {
  return {
    id: report.id,
    kind: report.conflictType,
    severity: mapSeverity(report.severity),
    confidence: CONFIDENCE_SCORE[report.confidence],
    title: report.title,
    description: report.whyIncompatible,
    requirementText,
    affectedContract: report.affectedEntity,
    assumptionA: mapSideToAssumption(report.assumptionA, report.id, 'a', report.affectedEntity),
    assumptionB: mapSideToAssumption(report.assumptionB, report.id, 'b', report.affectedEntity),
    affectedFiles: [...report.affectedFiles],
    evidenceExcerpts: [
      ...mapSideToExcerpts(report.assumptionA),
      ...mapSideToExcerpts(report.assumptionB),
    ],
    verificationHint: report.verificationHint,
    resolved: false,
  };
}

// ── Live session assembly ─────────────────────────────────────────────────────
// Every node/edge/count below derives from the API payload. Fields the engine
// does not measure (tests, coverage) stay null — never fabricated.

function buildLiveGraph(api: ApiSession, conflicts: Conflict[]): ConflictGraph {
  const nodes: GraphNode[] = [
    { id: 'req-0', kind: 'REQUIREMENT', label: 'Requirement' },
    { id: 'change-a', kind: 'CHANGE', label: api.input.branchA },
    { id: 'change-b', kind: 'CHANGE', label: api.input.branchB },
  ];
  const edges: GraphEdge[] = [
    { from: 'req-0', to: 'change-a', label: 'frames' },
    { from: 'req-0', to: 'change-b', label: 'frames' },
  ];

  for (const c of conflicts) {
    for (const a of [c.assumptionA, c.assumptionB]) {
      nodes.push({ id: a.id, kind: 'ASSUMPTION', label: a.statement });
      edges.push({ from: a.id, to: c.id, label: 'contradicts' });
    }
    nodes.push({ id: c.id, kind: 'CONFLICT', label: c.affectedContract, severity: c.severity });
    for (const f of c.affectedFiles) {
      const fid = `file:${f}`;
      if (!nodes.some((n) => n.id === fid)) {
        nodes.push({ id: fid, kind: 'FILE', label: f });
      }
      edges.push({ from: fid, to: c.id, label: 'evidences' });
    }
  }

  return { nodes, edges, conflicts };
}

function buildLivePassport(
  api: ApiSession,
  conflicts: Conflict[],
  status: ChangePassport['status'],
): ChangePassport {
  const result = api.result!;
  return {
    id: `live-${api.id.slice(0, 8)}`,
    generatedAt: api.completedAt ?? new Date().toISOString(),
    sessionId: api.id,
    feature: api.input.repository,
    intent: api.input.featureRequest,
    repository: api.input.repository,
    branches: [api.input.branchA, api.input.branchB],
    filesChanged: null,
    components: [...new Set(conflicts.flatMap((c) => c.affectedFiles))],
    assumptionsFound: result.assumptionsFound,
    assumptionsVerified: null,
    conflictsFound: result.conflictsFound,
    conflictsResolved: 0,
    testsTotal: null,
    testsPassing: null,
    requirementCoverage: null,
    remainingRisk: result.conflictsFound > 0 ? result.summary : null,
    status,
    conflicts,
  };
}

function buildLiveAgents(api: ApiSession): AgentRun[] {
  const r = api.result!;
  const finding = `${r.assumptionsFound} assumptions extracted · ${r.conflictsFound} conflicts found`;
  return DEMO_AGENTS.map((a) => ({ ...a, status: 'COMPLETE' as const, finding }));
}

/** Assemble a full AnalysisSession from a COMPLETE API payload. Returns null otherwise. */
export function buildLiveSession(api: ApiSession): AnalysisSession | null {
  if (api.status !== 'COMPLETE' || !api.result) return null;
  const conflicts = api.result.reports.map((r) => mapReportToConflict(r, api.input.featureRequest));
  const status: ChangePassport['status'] =
    api.result.status === 'CONFLICTS_FOUND' ? 'FAIL' : 'PASS';
  return {
    id: api.id,
    input: {
      repository: api.input.repository,
      featureRequest: api.input.featureRequest,
      branchA: api.input.branchA,
      branchB: api.input.branchB,
    },
    agents: buildLiveAgents(api),
    graph: buildLiveGraph(api, conflicts),
    passport: buildLivePassport(api, conflicts, status),
  };
}

async function fetchApiSession(sessionId: string): Promise<ApiSession | null> {
  try {
    const r = await fetch(`${API_BASE}/session/${sessionId}`);
    if (!r.ok) return null;
    return (await r.json()) as ApiSession;
  } catch {
    return null;
  }
}

/** Fetch a COMPLETE live session mapped to UI types. Null when unavailable/incomplete. */
export async function fetchLiveSession(sessionId: string): Promise<AnalysisSession | null> {
  if (!(await checkApiAvailable())) return null;
  const api = await fetchApiSession(sessionId);
  if (!api) return null;
  return buildLiveSession(api);
}

// ── Public adapter API ────────────────────────────────────────────────────────

/**
 * Start a new analysis session for the given input.
 * Returns a session ID that can be polled via getSession().
 */
export async function startAnalysis(input: VerifyChangeInput): Promise<string> {
  const live = await checkApiAvailable();

  if (live) {
    const r = await fetch(`${API_BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repository: input.repository,
        featureRequest: input.featureRequest,
        branchA: input.branchA,
        branchB: input.branchB,
        ...(input.codeA !== undefined ? { codeA: input.codeA } : {}),
        ...(input.codeB !== undefined ? { codeB: input.codeB } : {}),
      }),
    });
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    const data = (await r.json()) as { sessionId: string };
    return data.sessionId;
  }

  // Fall back to demo fixture
  await delay(300);
  return DEMO_SESSION.id;
}

/**
 * Poll a session by ID.
 * Live COMPLETE sessions return real analysis; otherwise progressive fixture.
 */
export async function getSession(
  sessionId: string,
  progressStep: number,
): Promise<AnalysisSession> {
  const live = await checkApiAvailable();

  if (live && sessionId !== DEMO_SESSION.id) {
    await delay(150);
    const api = await fetchApiSession(sessionId);
    if (api) {
      const liveSession = buildLiveSession(api);
      // Real result available — show it (agents stay complete, findings are real).
      if (liveSession) return liveSession;
    }
    // While running, show progressive fixture
  }

  // Demo fixture fallback — simulate agents completing one by one
  await delay(200);
  const agents = DEMO_SESSION.agents.map((agent, idx) => ({
    ...agent,
    status:
      idx < progressStep
        ? ('COMPLETE' as const)
        : idx === progressStep
          ? ('RUNNING' as const)
          : ('PENDING' as const),
  }));
  return { ...DEMO_SESSION, agents };
}

/**
 * Return the fully-resolved session (all agents complete).
 * Prefers live API data; falls back to the demo fixture.
 */
export async function getCompletedSession(sessionId: string): Promise<AnalysisSession> {
  const live = await fetchLiveSession(sessionId);
  if (live) return live;
  await delay(200);
  return DEMO_SESSION;
}
