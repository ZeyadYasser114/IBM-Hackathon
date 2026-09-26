// ─────────────────────────────────────────────────────────────────────────────
// Demo Script — typed step definitions for the judge demo flow
//
// The demo walks through 10 story beats in a deterministic sequence.
// Timing constants are tuned so the full run fits in ~2:30 of narration.
// ─────────────────────────────────────────────────────────────────────────────

export type DemoStepId =
  | 'verify'        // Step 1 — pre-filled Verify Change form
  | 'git-clean'     // Step 2 — show the Git precondition (still on Verify screen)
  | 'analysis'      // Step 3 — Bob agent animation
  | 'graph'         // Step 4 — Conflict Graph revealed
  | 'highlight'     // Step 5 — conflict node highlighted
  | 'detail'        // Step 6 — Conflict Detail evidence
  | 'resolution'    // Step 7 — Bob resolution accepted
  | 'tests'         // Step 8 — 43/43 tests passing shown
  | 'passport'      // Step 9 — Change Passport PASS
  | 'done';         // Step 10 — end state with restart CTA

export interface DemoStep {
  id:       DemoStepId;
  index:    number;        // 0-based
  label:    string;        // shown in DemoBar
  route:    string;        // React Router path to navigate to
  /** How long (ms) this step remains before auto-advancing. 0 = manual only. */
  autoDurationMs: number;
}

// ── Step definitions ──────────────────────────────────────────────────────────

export const DEMO_STEPS: DemoStep[] = [
  {
    id: 'verify',
    index: 0,
    label: '1. Select change',
    route: '/demo/verify',
    autoDurationMs: 0, // user presses "Verify with Bob"
  },
  {
    id: 'git-clean',
    index: 1,
    label: '2. Git shows clean',
    route: '/demo/verify',
    autoDurationMs: 0, // same screen, highlight advances manually
  },
  {
    id: 'analysis',
    index: 2,
    label: '3. Bob analysis',
    route: '/demo/analysis',
    autoDurationMs: 0, // auto-advances when all agents complete
  },
  {
    id: 'graph',
    index: 3,
    label: '4. Conflict graph',
    route: '/demo/graph',
    autoDurationMs: 0, // manual click to proceed
  },
  {
    id: 'highlight',
    index: 4,
    label: '5. Highlight conflict',
    route: '/demo/graph',
    autoDurationMs: 0, // same screen — conflict is highlighted, user clicks it
  },
  {
    id: 'detail',
    index: 5,
    label: '6. Evidence',
    route: '/demo/detail',
    autoDurationMs: 0, // manual
  },
  {
    id: 'resolution',
    index: 6,
    label: '7. Resolution',
    route: '/demo/detail',
    autoDurationMs: 0, // user accepts resolution on same screen
  },
  {
    id: 'tests',
    index: 7,
    label: '8. 43/43 tests',
    route: '/demo/passport',
    autoDurationMs: 0, // passport auto-shows PASS with 43/43
  },
  {
    id: 'passport',
    index: 8,
    label: '9. Passport',
    route: '/demo/passport',
    autoDurationMs: 0, // manual
  },
  {
    id: 'done',
    index: 9,
    label: '10. Done',
    route: '/demo/passport',
    autoDurationMs: 0,
  },
];

// Lookup helpers
export const DEMO_STEP_BY_ID = Object.fromEntries(
  DEMO_STEPS.map((s) => [s.id, s])
) as Record<DemoStepId, DemoStep>;

export const DEMO_STEP_BY_INDEX = (idx: number): DemoStep =>
  DEMO_STEPS[Math.min(Math.max(idx, 0), DEMO_STEPS.length - 1)]!;

// ── Demo-specific fixture pins ────────────────────────────────────────────────
// These keep demo routing deterministic — the demo always uses scenario 0
// and conflict s1-conf regardless of any page-level state.

export const DEMO_SCENARIO_IDX   = 0;
export const DEMO_CONFLICT_ID    = 's1-conf';
export const DEMO_AGENT_INTERVAL = 800; // ms per agent (faster than default 1200)
