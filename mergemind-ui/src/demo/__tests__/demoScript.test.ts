// ─────────────────────────────────────────────────────────────────────────────
// demoScript.test.ts — invariants for the demo step machine
//
// These tests protect the judge demo from accidental regressions:
//   • step count and index coherence
//   • all routes resolve to known /demo/* paths
//   • lookup helpers are consistent
//   • fixture pins are stable
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEMO_STEPS,
  DEMO_STEP_BY_ID,
  DEMO_STEP_BY_INDEX,
  DEMO_SCENARIO_IDX,
  DEMO_CONFLICT_ID,
  DEMO_AGENT_INTERVAL,
  type DemoStepId,
} from '../demoScript';

// ── Structural invariants ─────────────────────────────────────────────────────

describe('DEMO_STEPS array', () => {
  it('has exactly 10 steps', () => {
    expect(DEMO_STEPS).toHaveLength(10);
  });

  it('each step index equals its array position', () => {
    DEMO_STEPS.forEach((step, pos) => {
      expect(step.index).toBe(pos);
    });
  });

  it('all step ids are unique', () => {
    const ids = DEMO_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all routes start with /demo/', () => {
    DEMO_STEPS.forEach((step) => {
      expect(step.route).toMatch(/^\/demo\//);
    });
  });

  it('only known routes are used', () => {
    const knownRoutes = new Set([
      '/demo/verify',
      '/demo/analysis',
      '/demo/graph',
      '/demo/detail',
      '/demo/passport',
    ]);
    DEMO_STEPS.forEach((step) => {
      expect(knownRoutes.has(step.route)).toBe(true);
    });
  });

  it('every step has a non-empty label', () => {
    DEMO_STEPS.forEach((step) => {
      expect(step.label.length).toBeGreaterThan(0);
    });
  });

  it('labels include the step number matching their 1-based position', () => {
    DEMO_STEPS.forEach((step, pos) => {
      expect(step.label).toContain(String(pos + 1));
    });
  });

  it('autoDurationMs is a non-negative number for every step', () => {
    DEMO_STEPS.forEach((step) => {
      expect(typeof step.autoDurationMs).toBe('number');
      expect(step.autoDurationMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Canonical step sequence ────────────────────────────────────────────────────

describe('Step sequence', () => {
  const EXPECTED_IDS: DemoStepId[] = [
    'verify', 'git-clean', 'analysis',
    'graph', 'highlight', 'detail',
    'resolution', 'tests', 'passport', 'done',
  ];

  it('steps are in the canonical order', () => {
    expect(DEMO_STEPS.map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  it('first step is verify', () => {
    expect(DEMO_STEPS[0]!.id).toBe('verify');
  });

  it('last step is done', () => {
    expect(DEMO_STEPS[DEMO_STEPS.length - 1]!.id).toBe('done');
  });

  it('verify and git-clean share the same route', () => {
    expect(DEMO_STEP_BY_ID['verify'].route).toBe(DEMO_STEP_BY_ID['git-clean'].route);
  });

  it('graph and highlight share the same route', () => {
    expect(DEMO_STEP_BY_ID['graph'].route).toBe(DEMO_STEP_BY_ID['highlight'].route);
  });

  it('detail and resolution share the same route', () => {
    expect(DEMO_STEP_BY_ID['detail'].route).toBe(DEMO_STEP_BY_ID['resolution'].route);
  });

  it('tests, passport, and done share the same route', () => {
    const r = DEMO_STEP_BY_ID['tests'].route;
    expect(DEMO_STEP_BY_ID['passport'].route).toBe(r);
    expect(DEMO_STEP_BY_ID['done'].route).toBe(r);
  });
});

// ── Lookup helpers ─────────────────────────────────────────────────────────────

describe('DEMO_STEP_BY_ID', () => {
  it('contains all 10 step ids as keys', () => {
    expect(Object.keys(DEMO_STEP_BY_ID)).toHaveLength(10);
  });

  it('each entry matches the step at that index', () => {
    DEMO_STEPS.forEach((step) => {
      expect(DEMO_STEP_BY_ID[step.id]).toBe(step);
    });
  });
});

describe('DEMO_STEP_BY_INDEX', () => {
  it('returns the correct step for every valid index', () => {
    DEMO_STEPS.forEach((step, idx) => {
      expect(DEMO_STEP_BY_INDEX(idx)).toBe(step);
    });
  });

  it('clamps to 0 for negative indices', () => {
    expect(DEMO_STEP_BY_INDEX(-1)).toBe(DEMO_STEPS[0]);
    expect(DEMO_STEP_BY_INDEX(-99)).toBe(DEMO_STEPS[0]);
  });

  it('clamps to last step for out-of-bounds indices', () => {
    const last = DEMO_STEPS[DEMO_STEPS.length - 1]!;
    expect(DEMO_STEP_BY_INDEX(999)).toBe(last);
    expect(DEMO_STEP_BY_INDEX(10)).toBe(last);
  });
});

// ── Fixture pins (stable for the demo) ───────────────────────────────────────

describe('Demo fixture pins', () => {
  it('DEMO_SCENARIO_IDX is 0 (first scenario = owner/admin conflict)', () => {
    expect(DEMO_SCENARIO_IDX).toBe(0);
  });

  it('DEMO_CONFLICT_ID is s1-conf', () => {
    expect(DEMO_CONFLICT_ID).toBe('s1-conf');
  });

  it('DEMO_AGENT_INTERVAL is 800ms (faster than default 1200ms)', () => {
    expect(DEMO_AGENT_INTERVAL).toBe(800);
  });

  it('DEMO_AGENT_INTERVAL is strictly less than 1200ms', () => {
    expect(DEMO_AGENT_INTERVAL).toBeLessThan(1200);
  });
});
