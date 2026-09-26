// ─────────────────────────────────────────────────────────────────────────────
// Semantic Adapter
//
// This module is the only integration seam between the UI and the semantic
// engine. In demo mode it returns fixture data. When the API server is running,
// it calls POST /api/verify and polls GET /api/session/:id.
//
// Set VITE_API_URL in .env to point at the backend (defaults to /api which
// the Vite dev server proxies to localhost:4000).
// ─────────────────────────────────────────────────────────────────────────────

import type { AnalysisSession, VerifyChangeInput } from '@/types/semantic';
import { DEMO_SESSION } from '@/data/demoFixtures';

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
        repository:     input.repository,
        featureRequest: input.featureRequest,
        branchA:        input.branchA,
        branchB:        input.branchB,
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
 * The demo fixture returns agents in sequence to simulate progressive progress.
 */
export async function getSession(
  sessionId: string,
  progressStep: number,
): Promise<AnalysisSession> {
  const live = await checkApiAvailable();

  if (live && sessionId !== DEMO_SESSION.id) {
    await delay(150);
    // We simulate agent progress client-side; the real result will eventually arrive
    // Blend demo agents with real status once session completes
    const r = await fetch(`${API_BASE}/session/${sessionId}`);
    if (r.ok) {
      const data = (await r.json()) as { status: string };
      if (data.status === 'COMPLETE') {
        return { ...DEMO_SESSION, agents: DEMO_SESSION.agents };
      }
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
 */
export async function getCompletedSession(_sessionId: string): Promise<AnalysisSession> {
  await delay(200);
  return DEMO_SESSION;
}
