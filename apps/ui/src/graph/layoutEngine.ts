// ─────────────────────────────────────────────────────────────────────────────
// Graph Layout Engine
//
// Computes stable (x, y) positions for every node in a ConflictGraph.
// Uses a fixed ROW-TIER model that maps conceptual hierarchy:
//
//   ROW 0  REQUIREMENT      (always 1 node, centred)
//   ROW 1  CHANGE           (one per branch, fanned out symmetrically)
//   ROW 2  ASSUMPTION       (one per change, aligned below parent)
//   ROW 3  FILE             (one per assumption, aligned below parent)
//   ROW 4  CONFLICT         (centred, one node per detected conflict)
//
// This layout is stable for 1–5 conflicts because CONFLICT nodes are
// always on the last row and spaced independently.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConflictGraph, GraphNode } from '@/types/semantic';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
}

export interface ComputedLayout {
  nodes: LayoutNode[];
  /** Total SVG viewport dimensions */
  viewWidth: number;
  viewHeight: number;
}

// ── Sizing constants ──────────────────────────────────────────────────────────

export const NODE_W   = 200;  // base node width
export const NODE_H   = 52;   // base node height
const ROW_GAP         = 90;   // vertical gap between row centres
const CONFLICT_NODE_R = 34;   // radius of the conflict diamond bounding box
const H_PAD           = 60;   // horizontal padding on each side

// ── Row tier assignment ───────────────────────────────────────────────────────

const KIND_ROW: Record<GraphNode['kind'], number> = {
  REQUIREMENT: 0,
  CHANGE:      1,
  ASSUMPTION:  2,
  FILE:        3,
  CONFLICT:    4,
};

// ── Main layout function ──────────────────────────────────────────────────────

export function computeLayout(graph: ConflictGraph): ComputedLayout {
  // Group nodes by row tier
  const byRow: Map<number, GraphNode[]> = new Map();
  for (const node of graph.nodes) {
    const row = KIND_ROW[node.kind] ?? 2;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row)!.push(node);
  }

  // Sort rows to determine total height
  const rows = Array.from(byRow.keys()).sort((a, b) => a - b);
  const maxRow = rows[rows.length - 1] ?? 0;

  // Calculate minimum canvas width to accommodate the widest row
  const maxNodesInRow = Math.max(...rows.map((r) => byRow.get(r)!.length));
  const minWidth = Math.max(600, maxNodesInRow * (NODE_W + 40) + H_PAD * 2);

  const viewWidth  = minWidth;
  const viewHeight = maxRow * (NODE_H + ROW_GAP) + NODE_H + 60; // +60 bottom padding

  const layoutNodes: LayoutNode[] = [];

  for (const row of rows) {
    const nodesInRow = byRow.get(row)!;
    const count = nodesInRow.length;
    const y = 40 + row * (NODE_H + ROW_GAP) + NODE_H / 2;

    // Evenly space nodes across the canvas width
    nodesInRow.forEach((node, idx) => {
      let x: number;
      if (count === 1) {
        x = viewWidth / 2;
      } else {
        const usable = viewWidth - H_PAD * 2;
        const step = usable / (count - 1);
        x = H_PAD + idx * step;
      }

      const isConflict = node.kind === 'CONFLICT';
      layoutNodes.push({
        id:     node.id,
        x,
        y,
        width:  isConflict ? CONFLICT_NODE_R * 2 + 40 : NODE_W,
        height: isConflict ? CONFLICT_NODE_R * 2 : NODE_H,
        row,
      });
    });
  }

  return { nodes: layoutNodes, viewWidth, viewHeight };
}

/** Lookup helper — returns the layout node for a given graph node id */
export function getLayoutNode(layout: ComputedLayout, id: string): LayoutNode | undefined {
  return layout.nodes.find((n) => n.id === id);
}

/**
 * Given two layout nodes, return the nearest edge attachment points.
 * Uses simplified top/bottom midpoints (adequate for top-down flow).
 */
export function edgePoints(
  from: LayoutNode,
  to: LayoutNode,
): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = from.x;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y - to.height / 2;
  return { x1, y1, x2, y2 };
}

/**
 * Truncate text to fit within a pixel budget.
 * Uses an approximate character-per-pixel ratio.
 */
export function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}
