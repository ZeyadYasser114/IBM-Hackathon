// ─────────────────────────────────────────────────────────────────────────────
// Graph Scenarios fixture integrity tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  GRAPH_SCENARIOS,
  SCENARIO_OWNER_ADMIN,
  SCENARIO_USER_ID,
  SCENARIO_EMAIL_OPTIONAL,
} from '@/graph/graphScenarios';
import { computeLayout, getLayoutNode } from '@/graph/layoutEngine';

// ── Registry ──────────────────────────────────────────────────────────────────

describe('GRAPH_SCENARIOS registry', () => {
  it('contains exactly 3 scenarios', () => {
    expect(GRAPH_SCENARIOS).toHaveLength(3);
  });

  it('all scenario ids are unique', () => {
    const ids = GRAPH_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each scenario has at least one conflict in its graph', () => {
    for (const s of GRAPH_SCENARIOS) {
      expect(s.graph.conflicts.length).toBeGreaterThan(0);
    }
  });

  it('each scenario graph has a REQUIREMENT node', () => {
    for (const s of GRAPH_SCENARIOS) {
      const has = s.graph.nodes.some((n) => n.kind === 'REQUIREMENT');
      expect(has).toBe(true);
    }
  });

  it('each scenario graph has at least one CONFLICT node', () => {
    for (const s of GRAPH_SCENARIOS) {
      const has = s.graph.nodes.some((n) => n.kind === 'CONFLICT');
      expect(has).toBe(true);
    }
  });

  it('each scenario has exactly 3 git verdict items', () => {
    for (const s of GRAPH_SCENARIOS) {
      expect(s.gitVerdict).toHaveLength(3);
    }
  });

  it('git verdict items are all passing (true)', () => {
    for (const s of GRAPH_SCENARIOS) {
      for (const item of s.gitVerdict) {
        expect(item.pass).toBe(true);
      }
    }
  });

  it('mm verdict items are all failing (false)', () => {
    for (const s of GRAPH_SCENARIOS) {
      for (const item of s.mmVerdict) {
        expect(item.pass).toBe(false);
      }
    }
  });

  it('all edge from/to IDs reference existing node IDs', () => {
    for (const s of GRAPH_SCENARIOS) {
      const nodeIds = new Set(s.graph.nodes.map((n) => n.id));
      for (const edge of s.graph.edges) {
        expect(nodeIds.has(edge.from)).toBe(true);
        expect(nodeIds.has(edge.to)).toBe(true);
      }
    }
  });
});

// ── Scenario 1 — Owner vs Admin ───────────────────────────────────────────────

describe('SCENARIO_OWNER_ADMIN', () => {
  it('has severity HIGH', () => {
    expect(SCENARIO_OWNER_ADMIN.conflicts[0]?.severity).toBe('HIGH');
  });

  it('is a BUSINESS_RULE conflict', () => {
    expect(SCENARIO_OWNER_ADMIN.conflicts[0]?.kind).toBe('BUSINESS_RULE');
  });

  it('includes auth/roles.ts and billing/permissions.ts as affected files', () => {
    const files = SCENARIO_OWNER_ADMIN.conflicts[0]?.affectedFiles ?? [];
    expect(files).toContain('auth/roles.ts');
    expect(files).toContain('billing/permissions.ts');
  });

  it('assumption A references "owner"', () => {
    const stmt = SCENARIO_OWNER_ADMIN.conflicts[0]?.assumptionA.statement ?? '';
    expect(stmt.toLowerCase()).toContain('owner');
  });

  it('assumption B references "admin"', () => {
    const stmt = SCENARIO_OWNER_ADMIN.conflicts[0]?.assumptionB.statement ?? '';
    expect(stmt.toLowerCase()).toContain('admin');
  });

  it('lays out without missing nodes', () => {
    const layout = computeLayout(SCENARIO_OWNER_ADMIN);
    for (const node of SCENARIO_OWNER_ADMIN.nodes) {
      expect(getLayoutNode(layout, node.id)).toBeDefined();
    }
  });
});

// ── Scenario 2 — userId vs user_id ───────────────────────────────────────────

describe('SCENARIO_USER_ID', () => {
  it('has severity MEDIUM', () => {
    expect(SCENARIO_USER_ID.conflicts[0]?.severity).toBe('MEDIUM');
  });

  it('is a CONTRACT conflict', () => {
    expect(SCENARIO_USER_ID.conflicts[0]?.kind).toBe('CONTRACT');
  });

  it('assumption A contains camelCase field name', () => {
    const stmt = SCENARIO_USER_ID.conflicts[0]?.assumptionA.statement ?? '';
    expect(stmt).toContain('userId');
  });

  it('assumption B contains snake_case field name', () => {
    const stmt = SCENARIO_USER_ID.conflicts[0]?.assumptionB.statement ?? '';
    expect(stmt).toContain('user_id');
  });

  it('lays out without missing nodes', () => {
    const layout = computeLayout(SCENARIO_USER_ID);
    for (const node of SCENARIO_USER_ID.nodes) {
      expect(getLayoutNode(layout, node.id)).toBeDefined();
    }
  });
});

// ── Scenario 3 — Optional email ───────────────────────────────────────────────

describe('SCENARIO_EMAIL_OPTIONAL', () => {
  it('has severity MEDIUM', () => {
    expect(SCENARIO_EMAIL_OPTIONAL.conflicts[0]?.severity).toBe('MEDIUM');
  });

  it('is a DEPENDENCY conflict', () => {
    expect(SCENARIO_EMAIL_OPTIONAL.conflicts[0]?.kind).toBe('DEPENDENCY');
  });

  it('assumption A mentions nullable/optional email', () => {
    const stmt = SCENARIO_EMAIL_OPTIONAL.conflicts[0]?.assumptionA.statement.toLowerCase() ?? '';
    expect(stmt).toMatch(/optional|nullable/);
  });

  it('assumption B assumes every user has email', () => {
    const stmt = SCENARIO_EMAIL_OPTIONAL.conflicts[0]?.assumptionB.statement.toLowerCase() ?? '';
    expect(stmt).toContain('email');
  });

  it('includes notification-service.ts as an affected file', () => {
    const files = SCENARIO_EMAIL_OPTIONAL.conflicts[0]?.affectedFiles ?? [];
    expect(files.some((f) => f.includes('notification-service'))).toBe(true);
  });

  it('lays out without missing nodes', () => {
    const layout = computeLayout(SCENARIO_EMAIL_OPTIONAL);
    for (const node of SCENARIO_EMAIL_OPTIONAL.nodes) {
      expect(getLayoutNode(layout, node.id)).toBeDefined();
    }
  });
});

// ── Cross-scenario layout stability ───────────────────────────────────────────

describe('Layout stability across all scenarios', () => {
  it('CONFLICT node is always the bottom-most node in every scenario', () => {
    for (const scenario of GRAPH_SCENARIOS) {
      const layout = computeLayout(scenario.graph);
      const conflictNodes = scenario.graph.nodes.filter((n) => n.kind === 'CONFLICT');
      const allNodes      = layout.nodes;

      for (const cn of conflictNodes) {
        const conflictLn = getLayoutNode(layout, cn.id)!;
        for (const ln of allNodes) {
          if (ln.id !== cn.id) {
            expect(conflictLn.y).toBeGreaterThanOrEqual(ln.y);
          }
        }
      }
    }
  });

  it('viewWidth is consistent across scenarios with same node count per row', () => {
    // All three demo scenarios have 2 CHANGE + 2 ASSUMPTION + 2 FILE nodes
    const widths = GRAPH_SCENARIOS.map((s) => computeLayout(s.graph).viewWidth);
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[2]);
  });
});
