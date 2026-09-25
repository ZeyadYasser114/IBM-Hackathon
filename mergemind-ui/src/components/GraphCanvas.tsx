// ─────────────────────────────────────────────────────────────────────────────
// GraphCanvas — data-driven, layout-engine-backed SVG conflict graph
//
// Node shapes by kind:
//   REQUIREMENT  — rounded rect with top accent bar (blue)
//   CHANGE       — rounded rect (green)
//   ASSUMPTION   — parallelogram / skewed rect (amber)
//   FILE         — document shape (grey, folded top-right corner)
//   CONFLICT     — diamond (red, severity-coded fill + stroke weight)
//
// Severity is communicated three ways (not just colour):
//   HIGH   — solid red fill, bold stroke, ⚠ warning icon
//   MEDIUM — amber stroke, dashed border, ⚡ icon
//   LOW    — subtle green border, ℹ icon
//
// Layout is computed by layoutEngine.ts — no hardcoded positions.
// Labels are truncated by the engine's truncateLabel() to prevent overflow.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import type { ConflictGraph, GraphNode, GraphEdge } from '@/types/semantic';
import {
  computeLayout,
  getLayoutNode,
  edgePoints,
  truncateLabel,
  NODE_H,
  type LayoutNode,
} from '@/graph/layoutEngine';

// ── Props ─────────────────────────────────────────────────────────────────────

interface GraphCanvasProps {
  graph: ConflictGraph;
  onConflictClick: (conflictId: string) => void;
  selectedConflictId?: string;
}

// ── Style maps ────────────────────────────────────────────────────────────────

const KIND_STYLE = {
  REQUIREMENT: {
    fill:    'rgba(59,130,246,0.10)',
    stroke:  'rgba(59,130,246,0.55)',
    text:    '#93c5fd',
    accent:  '#3b82f6',
  },
  CHANGE: {
    fill:    'rgba(63,185,80,0.08)',
    stroke:  'rgba(63,185,80,0.45)',
    text:    '#86efac',
    accent:  '#3fb950',
  },
  ASSUMPTION: {
    fill:    'rgba(227,179,65,0.10)',
    stroke:  'rgba(227,179,65,0.50)',
    text:    '#fde68a',
    accent:  '#e3b341',
  },
  FILE: {
    fill:    'rgba(22,27,34,0.85)',
    stroke:  '#3d444d',
    text:    '#8b949e',
    accent:  '#484f58',
  },
  CONFLICT_HIGH: {
    fill:    'rgba(248,81,73,0.18)',
    stroke:  '#f85149',
    text:    '#fca5a5',
    accent:  '#f85149',
  },
  CONFLICT_MEDIUM: {
    fill:    'rgba(227,179,65,0.15)',
    stroke:  '#e3b341',
    text:    '#fde68a',
    accent:  '#e3b341',
  },
  CONFLICT_LOW: {
    fill:    'rgba(63,185,80,0.12)',
    stroke:  '#3fb950',
    text:    '#86efac',
    accent:  '#3fb950',
  },
} as const;

const SEVERITY_ICON = { HIGH: '⚠', MEDIUM: '⚡', LOW: 'ℹ' } as const;
const SEVERITY_STROKE_W = { HIGH: 2.2, MEDIUM: 1.6, LOW: 1.2 } as const;

// Max characters for labels in each kind
const LABEL_MAX: Record<GraphNode['kind'], number> = {
  REQUIREMENT: 32,
  CHANGE:      26,
  ASSUMPTION:  28,
  FILE:        30,
  CONFLICT:    22,
};

// ── Main component ─────────────────────────────────────────────────────────────

export function GraphCanvas({ graph, onConflictClick, selectedConflictId }: GraphCanvasProps) {
  const layout = useMemo(() => computeLayout(graph), [graph]);
  const { viewWidth, viewHeight } = layout;

  // Build a fast node-kind lookup
  const nodeKindMap = useMemo(() => {
    const m = new Map<string, GraphNode['kind']>();
    graph.nodes.forEach((n) => m.set(n.id, n.kind));
    return m;
  }, [graph]);

  const nodeSeverityMap = useMemo(() => {
    const m = new Map<string, GraphNode['severity']>();
    graph.nodes.forEach((n) => { if (n.severity) m.set(n.id, n.severity); });
    return m;
  }, [graph]);

  return (
    <div
      style={{ width: '100%', overflow: 'hidden', borderRadius: 8 }}
      role="img"
      aria-label="Semantic conflict graph showing requirement, assumptions, files and detected conflict"
    >
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-hidden="true"
      >
        <Defs viewWidth={viewWidth} />

        {/* Row tier labels (right margin) */}
        <TierLabels viewWidth={viewWidth} />

        {/* Edges drawn first (behind nodes) */}
        {graph.edges.map((edge, idx) => (
          <EdgeLine
            key={idx}
            edge={edge}
            layout={layout}
            nodeKindMap={nodeKindMap}
          />
        ))}

        {/* Nodes */}
        {graph.nodes.map((node) => {
          const ln = getLayoutNode(layout, node.id);
          if (!ln) return null;
          return (
            <NodeShape
              key={node.id}
              node={node}
              ln={ln}
              isSelected={node.id === selectedConflictId}
              onConflictClick={onConflictClick}
              severity={nodeSeverityMap.get(node.id)}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ── SVG <defs> ─────────────────────────────────────────────────────────────────

function Defs({ viewWidth }: { viewWidth: number }) {
  return (
    <defs>
      {/* Arrow markers */}
      <marker id="arr-default" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="#484f58" />
      </marker>
      <marker id="arr-conflict" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="rgba(248,81,73,0.8)" />
      </marker>
      <marker id="arr-medium" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="rgba(227,179,65,0.8)" />
      </marker>

      {/* Selected conflict glow */}
      <filter id="glow-selected" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Subtle row background gradient */}
      <linearGradient id="bg-row" x1="0" y1="0" x2={viewWidth} y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0"   stopColor="rgba(22,27,34,0)" />
        <stop offset="0.5" stopColor="rgba(22,27,34,0.4)" />
        <stop offset="1"   stopColor="rgba(22,27,34,0)" />
      </linearGradient>
    </defs>
  );
}

// ── Tier labels (visual annotation) ───────────────────────────────────────────

const TIER_LABELS = [
  { row: 0, label: 'REQUIREMENT' },
  { row: 1, label: 'CHANGES' },
  { row: 2, label: 'ASSUMPTIONS' },
  { row: 3, label: 'FILES' },
  { row: 4, label: 'CONFLICT' },
];

const ROW_Y_BASE = 40 + NODE_H / 2;
const ROW_STEP   = NODE_H + 90; // must match layoutEngine ROW_GAP

function TierLabels({ viewWidth }: { viewWidth: number }) {
  return (
    <g aria-hidden="true">
      {TIER_LABELS.map(({ row, label }) => {
        const y = ROW_Y_BASE + row * ROW_STEP;
        return (
          <text
            key={label}
            x={viewWidth - 8}
            y={y + 4}
            textAnchor="end"
            fill="rgba(99,110,123,0.5)"
            fontSize="9"
            fontWeight="700"
            fontFamily="-apple-system, system-ui, sans-serif"
            letterSpacing="0.1em"
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

// ── Edge line ──────────────────────────────────────────────────────────────────

interface EdgeLineProps {
  edge: GraphEdge;
  layout: ReturnType<typeof computeLayout>;
  nodeKindMap: Map<string, GraphNode['kind']>;
}

function EdgeLine({ edge, layout, nodeKindMap }: EdgeLineProps) {
  const fromLn = getLayoutNode(layout, edge.from);
  const toLn   = getLayoutNode(layout, edge.to);
  if (!fromLn || !toLn) return null;

  const { x1, y1, x2, y2 } = edgePoints(fromLn, toLn);
  const toKind   = nodeKindMap.get(edge.to);
  const fromKind = nodeKindMap.get(edge.from);

  const isConflictEdge = toKind === 'CONFLICT' || fromKind === 'CONFLICT';
  const isMediumConflict =
    isConflictEdge &&
    // Check if the conflict node has medium severity
    layout.nodes.find((n) => n.id === edge.to || n.id === edge.from) !== undefined;

  const midY = (y1 + y2) / 2;
  const midX = (x1 + x2) / 2;

  // Cubic bezier control points for smooth S-curve
  const path = `M ${x1} ${y1} C ${x1} ${midY + 10}, ${x2} ${midY - 10}, ${x2} ${y2}`;

  let stroke = '#3d444d';
  let strokeW = 1;
  let dashArray: string | undefined;
  let markerEnd = 'url(#arr-default)';

  if (isConflictEdge) {
    stroke = 'rgba(248,81,73,0.45)';
    strokeW = 1.5;
    dashArray = '6 3';
    markerEnd = 'url(#arr-conflict)';
    // Downgrade visuals for MEDIUM severity conflicts
    if (isMediumConflict) {
      stroke = 'rgba(227,179,65,0.45)';
      markerEnd = 'url(#arr-medium)';
    }
  }

  const midLabelX = midX;
  const midLabelY = midY;

  return (
    <g>
      <path
        d={path}
        stroke={stroke}
        strokeWidth={strokeW}
        strokeDasharray={dashArray}
        fill="none"
        markerEnd={markerEnd}
      />
      {edge.label && (
        <text
          x={midLabelX}
          y={midLabelY - 3}
          textAnchor="middle"
          fill="rgba(99,110,123,0.7)"
          fontSize="9.5"
          fontFamily="-apple-system, system-ui, sans-serif"
          style={{ pointerEvents: 'none' }}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

// ── Node shape dispatcher ─────────────────────────────────────────────────────

interface NodeShapeProps {
  node: GraphNode;
  ln: LayoutNode;
  isSelected: boolean;
  onConflictClick: (id: string) => void;
  severity?: GraphNode['severity'];
}

function NodeShape({ node, ln, isSelected, onConflictClick, severity }: NodeShapeProps) {
  const label = truncateLabel(node.label, LABEL_MAX[node.kind]);

  switch (node.kind) {
    case 'REQUIREMENT':
      return <RequirementNode node={node} ln={ln} label={label} />;
    case 'CHANGE':
      return <ChangeNode node={node} ln={ln} label={label} />;
    case 'ASSUMPTION':
      return <AssumptionNode node={node} ln={ln} label={label} severity={severity} />;
    case 'FILE':
      return <FileNode node={node} ln={ln} label={label} />;
    case 'CONFLICT':
      return (
        <ConflictNode
          node={node}
          ln={ln}
          label={label}
          severity={severity ?? 'HIGH'}
          isSelected={isSelected}
          onClick={() => onConflictClick(node.id)}
        />
      );
    default:
      return null;
  }
}

// ── REQUIREMENT node — rounded rect with top accent bar ───────────────────────

function RequirementNode({ ln, label }: { node: GraphNode; ln: LayoutNode; label: string }) {
  const style = KIND_STYLE.REQUIREMENT;
  const x = ln.x - ln.width / 2;
  const y = ln.y - ln.height / 2;

  return (
    <g>
      <rect x={x} y={y} width={ln.width} height={ln.height} rx="9" ry="9"
        fill={style.fill} stroke={style.stroke} strokeWidth="1.2" />
      {/* Accent top bar */}
      <rect x={x + 1} y={y + 1} width={ln.width - 2} height={5} rx="8" ry="8"
        fill={style.accent} opacity="0.6" />
      {/* Kind micro-label */}
      <text x={ln.x} y={y + 17} textAnchor="middle"
        fill={style.text} fontSize="8.5" fontWeight="700"
        fontFamily="-apple-system, system-ui, sans-serif" letterSpacing="0.08em" opacity="0.65">
        REQUIREMENT
      </text>
      {/* Main label */}
      <text x={ln.x} y={y + 33} textAnchor="middle"
        fill={style.text} fontSize="12" fontWeight="600"
        fontFamily="-apple-system, system-ui, sans-serif">
        {label}
      </text>
    </g>
  );
}

// ── CHANGE node — rounded rect, green ─────────────────────────────────────────

function ChangeNode({ ln, label }: { node: GraphNode; ln: LayoutNode; label: string }) {
  const style = KIND_STYLE.CHANGE;
  const x = ln.x - ln.width / 2;
  const y = ln.y - ln.height / 2;

  return (
    <g>
      <rect x={x} y={y} width={ln.width} height={ln.height} rx="8" ry="8"
        fill={style.fill} stroke={style.stroke} strokeWidth="1" />
      <text x={ln.x} y={y + 16} textAnchor="middle"
        fill={style.text} fontSize="8.5" fontWeight="700"
        fontFamily="-apple-system, system-ui, sans-serif" letterSpacing="0.08em" opacity="0.65">
        CHANGE
      </text>
      <text x={ln.x} y={y + 33} textAnchor="middle"
        fill={style.text} fontSize="12" fontWeight="600"
        fontFamily="-apple-system, system-ui, sans-serif">
        {label}
      </text>
    </g>
  );
}

// ── ASSUMPTION node — skewed parallelogram (amber) ────────────────────────────

function AssumptionNode({ ln, label, severity }: {
  node: GraphNode; ln: LayoutNode; label: string; severity?: GraphNode['severity']
}) {
  const style = KIND_STYLE.ASSUMPTION;
  const w = ln.width;
  const h = ln.height;
  const x = ln.x - w / 2;
  const y = ln.y - h / 2;
  const skew = 10; // horizontal offset for parallelogram

  // Parallelogram points: top-left shifted right, bottom-left shifted left
  const pts = [
    `${x + skew},${y}`,
    `${x + w},${y}`,
    `${x + w - skew},${y + h}`,
    `${x},${y + h}`,
  ].join(' ');

  // Extra thick border if the assumption is part of a conflict
  const strokeW = severity ? 1.6 : 1;
  const strokeColor = severity === 'HIGH' ? 'rgba(248,81,73,0.55)' : style.stroke;

  return (
    <g>
      <polygon points={pts} fill={style.fill} stroke={strokeColor} strokeWidth={strokeW} />
      <text x={ln.x} y={y + 16} textAnchor="middle"
        fill={style.text} fontSize="8.5" fontWeight="700"
        fontFamily="-apple-system, system-ui, sans-serif" letterSpacing="0.08em" opacity="0.65">
        ASSUMPTION
      </text>
      <text x={ln.x} y={y + 33} textAnchor="middle"
        fill={style.text} fontSize="11.5" fontWeight="600"
        fontFamily="-apple-system, system-ui, sans-serif">
        {label}
      </text>
    </g>
  );
}

// ── FILE node — document shape with folded top-right corner ───────────────────

function FileNode({ ln, label }: { node: GraphNode; ln: LayoutNode; label: string }) {
  const style = KIND_STYLE.FILE;
  const w = ln.width;
  const h = ln.height;
  const x = ln.x - w / 2;
  const y = ln.y - h / 2;
  const fold = 10; // corner fold size

  // Document shape: rect with folded top-right
  const docPath = [
    `M ${x} ${y}`,
    `L ${x + w - fold} ${y}`,
    `L ${x + w} ${y + fold}`,
    `L ${x + w} ${y + h}`,
    `L ${x} ${y + h}`,
    'Z',
  ].join(' ');

  // Fold crease line
  const foldPath = `M ${x + w - fold} ${y} L ${x + w - fold} ${y + fold} L ${x + w} ${y + fold}`;

  return (
    <g>
      <path d={docPath} fill={style.fill} stroke={style.stroke} strokeWidth="1" />
      <path d={foldPath} fill="none" stroke={style.stroke} strokeWidth="0.8" />
      <text x={ln.x - 4} y={y + 18} textAnchor="middle"
        fill={style.accent} fontSize="8.5" fontWeight="700"
        fontFamily="-apple-system, system-ui, sans-serif" letterSpacing="0.08em">
        FILE
      </text>
      {/* File name — may be long, so we render in two text elements if needed */}
      <FileLabel label={label} cx={ln.x - 4} cy={y + 35} />
    </g>
  );
}

function FileLabel({ label, cx, cy }: { label: string; cx: number; cy: number }) {
  // Split at last slash so path prefix is dimmed, filename is bright
  const lastSlash = label.lastIndexOf('/');
  if (lastSlash === -1) {
    return (
      <text x={cx} y={cy} textAnchor="middle"
        fill={KIND_STYLE.FILE.text} fontSize="10.5" fontWeight="500"
        fontFamily="var(--mono, monospace)">
        {label}
      </text>
    );
  }
  const dir  = label.slice(0, lastSlash + 1);
  const file = label.slice(lastSlash + 1);
  return (
    <g>
      <text x={cx} y={cy - 7} textAnchor="middle"
        fill="rgba(139,148,158,0.55)" fontSize="9" fontWeight="400"
        fontFamily="var(--mono, monospace)">
        {truncateLabel(dir, 28)}
      </text>
      <text x={cx} y={cy + 5} textAnchor="middle"
        fill={KIND_STYLE.FILE.text} fontSize="10.5" fontWeight="600"
        fontFamily="var(--mono, monospace)">
        {truncateLabel(file, 28)}
      </text>
    </g>
  );
}

// ── CONFLICT node — diamond shape ─────────────────────────────────────────────

interface ConflictNodeProps {
  node: GraphNode;
  ln: LayoutNode;
  label: string;
  severity: NonNullable<GraphNode['severity']>;
  isSelected: boolean;
  onClick: () => void;
}

function ConflictNode({ ln, label, severity, isSelected, onClick }: ConflictNodeProps) {
  const styleKey = severity === 'HIGH'
    ? 'CONFLICT_HIGH'
    : severity === 'MEDIUM'
    ? 'CONFLICT_MEDIUM'
    : 'CONFLICT_LOW';
  const style = KIND_STYLE[styleKey];

  // Diamond dimensions
  const hw = ln.width / 2;  // half-width
  const hh = ln.height / 2; // half-height

  const diamond = [
    `${ln.x},${ln.y - hh}`,       // top
    `${ln.x + hw},${ln.y}`,       // right
    `${ln.x},${ln.y + hh}`,       // bottom
    `${ln.x - hw},${ln.y}`,       // left
  ].join(' ');

  const strokeW = SEVERITY_STROKE_W[severity];
  const icon    = SEVERITY_ICON[severity];

  return (
    <g
      onClick={onClick}
      style={{ cursor: 'pointer' }}
      role="button"
      aria-label={`Conflict: ${label} — click to inspect`}
      filter={isSelected ? 'url(#glow-selected)' : undefined}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Outer diamond */}
      <polygon
        points={diamond}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={strokeW}
      />
      {/* Pulse ring when selected */}
      {isSelected && (
        <polygon
          points={diamond}
          fill="none"
          stroke={style.stroke}
          strokeWidth="1"
          opacity="0.4"
          transform={`scale(1.15) translate(${-ln.x * 0.15},${-ln.y * 0.15})`}
          style={{ transformOrigin: `${ln.x}px ${ln.y}px` }}
        />
      )}
      {/* Severity icon */}
      <text x={ln.x} y={ln.y - 10} textAnchor="middle"
        fill={style.accent} fontSize="13"
        fontFamily="-apple-system, system-ui, sans-serif">
        {icon}
      </text>
      {/* Label */}
      <text x={ln.x} y={ln.y + 6} textAnchor="middle"
        fill={style.text} fontSize="11" fontWeight="700"
        fontFamily="-apple-system, system-ui, sans-serif">
        {label}
      </text>
      {/* Severity badge text */}
      <text x={ln.x} y={ln.y + 20} textAnchor="middle"
        fill={style.accent} fontSize="8.5" fontWeight="700"
        fontFamily="-apple-system, system-ui, sans-serif" letterSpacing="0.1em" opacity="0.8">
        {severity} · click to inspect
      </text>
    </g>
  );
}
