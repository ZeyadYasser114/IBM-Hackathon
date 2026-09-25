// ─────────────────────────────────────────────────────────────────────────────
// Semantic Adapter
//
// This module is the only integration seam between the UI and the semantic
// engine. Today it returns demo fixtures. When Awsemy's engine is merged,
// replace the implementations below — the UI does not need to change.
// ─────────────────────────────────────────────────────────────────────────────

import type { AnalysisSession, VerifyChangeInput } from '@/types/semantic';
import { DEMO_SESSION } from '@/data/demoFixtures';

// Simulated network delay so the Analysis screen looks real.
const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/**
 * Start a new analysis session for the given input.
 * Returns a session ID that can be polled via getSession().
 */
export async function startAnalysis(_input: VerifyChangeInput): Promise<string> {
  await delay(300);
  return DEMO_SESSION.id;
}

/**
 * Poll a session by ID.
 * The demo fixture returns agents in sequence to simulate progressive progress.
 */
export async function getSession(
  _sessionId: string,
  progressStep: number,
): Promise<AnalysisSession> {
  await delay(200);

  // Simulate agents completing one by one
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
