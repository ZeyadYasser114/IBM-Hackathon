// ─────────────────────────────────────────────────────────────────────────────
// Layout Engine tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeLayout, getLayoutNode, truncateLabel, NODE_W, NODE_H } from '@/graph/layoutEngine';
import type { ConflictGraph } from '@/types/semantic';

// ── Minimal graphs for testing ────────────────────────────────────────────────

function makeMinimalGraph(): ConflictGraph {
  return {
    nodes: [
      { id: 'req',   kind: 'REQUIREMENT', label: 'A requirement' },
      { id: 'chg',   kind: 'CHANGE',      label: 'A change' },
      { id: 'asmp',  kind: 'ASSUMPTION',  label: 'An assumption', severity: 'HIGH' },
      { id: 'file',  kind: 'FILE',        label: 'src/foo.ts' },
      { id: 'conf',  kind: 'CONFLICT',    label: 'A conflict', severity: 'HIGH' },
    ],
    edges: [
      { from: 'req',  to: 'chg',  label: 'drives' },
      { from: 'chg',  to: 'asmp', label: 'produces' },
      { from: 'asmp', to: 'file', label: 'in' },
      { from: 'asmp', to: 'conf', label: 'conflicts' },
    ],
    conflicts: [],
  };
}

function makeTwoChangeGraph(): ConflictGraph {
  return {
    nodes: [
      { id: 'req',    kind: 'REQUIREMENT', label: 'Req' },
      { id: 'chg-a',  kind: 'CHANGE',      label: 'Change A' },
      { id: 'chg-b',  kind: 'CHANGE',      label: 'Change B' },
      { id: 'asmp-a', kind: 'ASSUMPTION',  label: 'Assumption A', severity: 'HIGH' },
      { id: 'asmp-b', kind: 'ASSUMPTION',  label: 'Assumption B', severity: 'HIGH' },
      { id: 'file-a', kind: 'FILE',        label: 'a.ts' },
      { id: 'file-b', kind: 'FILE',        label: 'b.ts' },
      { id: 'conf',   kind: 'CONFLICT',    label: 'Conflict', severity: 'HIGH' },
    ],
    edges: [],
    conflicts: [],
  };
}

// ── computeLayout ─────────────────────────────────────────────────────────────

describe('computeLayout', () => {
  it('produces a layout node for every graph node', () => {
    const g = makeMinimalGraph();
    const layout = computeLayout(g);
    expect(layout.nodes).toHaveLength(g.nodes.length);
    for (const node of g.nodes) {
      expect(getLayoutNode(layout, node.id)).toBeDefined();
    }
  });

  it('viewWidth is at least 600', () => {
    const layout = computeLayout(makeMinimalGraph());
    expect(layout.viewWidth).toBeGreaterThanOrEqual(600);
  });

  it('viewHeight grows with the number of rows', () => {
    const oneRow: ConflictGraph = {
      nodes: [{ id: 'r', kind: 'REQUIREMENT', label: 'Req' }],
      edges: [],
      conflicts: [],
    };
    const fiveRow = makeMinimalGraph(); // has all 5 row kinds
    const h1 = computeLayout(oneRow).viewHeight;
    const h5 = computeLayout(fiveRow).viewHeight;
    expect(h5).toBeGreaterThan(h1);
  });

  it('REQUIREMENT node is placed on row 0 (smallest y)', () => {
    const layout = computeLayout(makeTwoChangeGraph());
    const reqNode  = getLayoutNode(layout, 'req')!;
    const confNode = getLayoutNode(layout, 'conf')!;
    expect(reqNode.y).toBeLessThan(confNode.y);
  });

  it('CONFLICT node is placed on the last row (largest y)', () => {
    const layout = computeLayout(makeTwoChangeGraph());
    const confNode = getLayoutNode(layout, 'conf')!;
    for (const ln of layout.nodes) {
      if (ln.id !== 'conf') {
        expect(confNode.y).toBeGreaterThanOrEqual(ln.y);
      }
    }
  });

  it('single node in a row is placed at horizontal centre', () => {
    const layout = computeLayout(makeMinimalGraph());
    const reqNode = getLayoutNode(layout, 'req')!;
    expect(reqNode.x).toBeCloseTo(layout.viewWidth / 2, 0);
  });

  it('two sibling nodes are placed symmetrically around centre', () => {
    const layout = computeLayout(makeTwoChangeGraph());
    const chgA = getLayoutNode(layout, 'chg-a')!;
    const chgB = getLayoutNode(layout, 'chg-b')!;
    const mid  = (chgA.x + chgB.x) / 2;
    expect(mid).toBeCloseTo(layout.viewWidth / 2, 0);
  });

  it('no two nodes in the same row occupy the same x position', () => {
    const layout = computeLayout(makeTwoChangeGraph());
    const rows = new Map<number, number[]>();
    for (const ln of layout.nodes) {
      if (!rows.has(ln.row)) rows.set(ln.row, []);
      rows.get(ln.row)!.push(ln.x);
    }
    for (const xs of rows.values()) {
      const unique = new Set(xs.map((x) => Math.round(x)));
      expect(unique.size).toBe(xs.length);
    }
  });

  it('layout node width equals NODE_W for non-CONFLICT nodes', () => {
    const layout = computeLayout(makeMinimalGraph());
    const req = getLayoutNode(layout, 'req')!;
    expect(req.width).toBe(NODE_W);
  });

  it('CONFLICT node height is larger than NODE_H (diamond bounding box)', () => {
    const layout = computeLayout(makeMinimalGraph());
    const conf = getLayoutNode(layout, 'conf')!;
    // CONFLICT uses CONFLICT_NODE_R * 2 = 68, NODE_H = 52
    expect(conf.height).toBeGreaterThan(NODE_H);
  });

  it('is stable: calling computeLayout twice returns identical positions', () => {
    const g = makeTwoChangeGraph();
    const l1 = computeLayout(g);
    const l2 = computeLayout(g);
    for (let i = 0; i < l1.nodes.length; i++) {
      expect(l1.nodes[i].x).toBe(l2.nodes[i].x);
      expect(l1.nodes[i].y).toBe(l2.nodes[i].y);
    }
  });
});

// ── truncateLabel ─────────────────────────────────────────────────────────────

describe('truncateLabel', () => {
  it('returns the string unchanged when within limit', () => {
    expect(truncateLabel('short', 10)).toBe('short');
    expect(truncateLabel('exactly ten', 11)).toBe('exactly ten');
  });

  it('truncates and appends ellipsis when over limit', () => {
    const result = truncateLabel('this is a very long label string', 15);
    expect(result).toHaveLength(15);
    expect(result.endsWith('…')).toBe(true);
  });

  it('preserves the full string at exact maxChars boundary', () => {
    const s = 'abcde';
    expect(truncateLabel(s, 5)).toBe('abcde');
  });

  it('truncates correctly at limit 1', () => {
    const result = truncateLabel('hello', 1);
    expect(result).toBe('…');
  });
});

// ── getLayoutNode ──────────────────────────────────────────────────────────────

describe('getLayoutNode', () => {
  it('returns undefined for a missing id', () => {
    const layout = computeLayout(makeMinimalGraph());
    expect(getLayoutNode(layout, 'does-not-exist')).toBeUndefined();
  });

  it('returns the correct node for a known id', () => {
    const layout = computeLayout(makeMinimalGraph());
    const ln = getLayoutNode(layout, 'req');
    expect(ln).toBeDefined();
    expect(ln!.id).toBe('req');
  });
});
