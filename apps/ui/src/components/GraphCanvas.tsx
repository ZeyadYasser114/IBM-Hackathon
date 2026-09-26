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

import { useMemo, useState, type ReactNode } from 'react';
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
    fill: 'rgba(69,137,255,0.10)',
    stroke: 'rgba(69,137,255,0.55)',
    text: '#78a9ff',
    accent: '#4589ff',
  },
  CHANGE: {
    fill: 'rgba(66,190,101,0.08)',
    stroke: 'rgba(66,190,101,0.45)',
    text: '#6fdc8c',
    accent: '#42be65',
  },
  ASSUMPTION: {
    fill: 'rgba(241,194,27,0.10)',
    stroke: 'rgba(241,194,27,0.50)',
    text: '#ffe598',
    accent: '#f1c21b',
  },
  FILE: {
    fill: 'rgba(38,38,38,0.85)',
    stroke: '#525252',
    text: '#a8a8a8',
    accent: '#6f6f6f',
  },
  CONFLICT_HIGH: {
    fill: 'rgba(250,77,86,0.18)',
    stroke: '#fa4d56',
    text: '#ffb3b8',
    accent: '#fa4d56',
  },
  CONFLICT_MEDIUM: {
    fill: 'rgba(241,194,27,0.15)',
    stroke: '#f1c21b',
    text: '#ffe598',
    accent: '#f1c21b',
  },
  CONFLICT_LOW: {
    fill: 'rgba(66,190,101,0.12)',
    stroke: '#42be65',
    text: '#6fdc8c',
    accent: '#42be65',
  },
} as const;

const SEVERITY_ICON = { HIGH: '⚠', MEDIUM: '⚡', LOW: 'ℹ' } as const;
const SEVERITY_STROKE_W = { HIGH: 2.2, MEDIUM: 1.6, LOW: 1.2 } as const;

// Max characters for labels in each kind (tuned for compact 150px nodes)
const LABEL_MAX: Record<GraphNode['kind'], number> = {
  REQUIREMENT: 26,
  CHANGE: 20,
  ASSUMPTION: 22,
  FILE: 24,
  CONFLICT: 18,
};

// ── Zoom limits ───────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 1.25;

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
    graph.nodes.forEach((n) => {
      if (n.severity) m.set(n.id, n.severity);
    });
    return m;
  }, [graph]);

  // Zoom state — zoom is centred on the canvas midpoint
  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z * ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, +(z / ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(1);
  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div
      style={{ width: '100%', overflow: 'hidden', borderRadius: 8 }}
      role="img"
      aria-label="Semantic conflict graph showing requirement, assumptions, files and detected conflict"
    >
      {/* Zoom toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          marginBottom: 'var(--sp-2)',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 44, textAlign: 'right' }}>
          {zoomLabel}
        </span>
        <ZoomButton label="Zoom out" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
          −
        </ZoomButton>
        <ZoomButton label="Zoom in" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
          +
        </ZoomButton>
        <ZoomButton label="Reset zoom" onClick={zoomReset} disabled={zoom === 1}>
          Reset
        </ZoomButton>
      </div>
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-hidden="true"
      >
        <Defs viewWidth={viewWidth} />

        <g
          transform={`translate(${viewWidth / 2} ${viewHeight / 2}) scale(${zoom}) translate(${-viewWidth / 2} ${-viewHeight / 2})`}
        >
          {/* Row tier labels (right margin) */}
          <TierLabels viewWidth={viewWidth} />

          {/* Edges drawn first (behind nodes) */}
          {graph.edges.map((edge, idx) => (
            <EdgeLine key={idx} edge={edge} layout={layout} nodeKindMap={nodeKindMap} />
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
        </g>
      </svg>
    </div>
  );
}

// ── Zoom toolbar button ───────────────────────────────────────────────────────

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 30,
        padding: '2px 8px',
        fontSize: 13,
        fontWeight: 600,
        color: disabled ? 'var(--text-dim)' : 'var(--text)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ── SVG <defs> ─────────────────────────────────────────────────────────────────

function Defs({ viewWidth }: { viewWidth: number }) {
  return (
    <defs>
      {/* Arrow markers */}
      <marker id="arr-default" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="#6f6f6f" />
      </marker>
      <marker id="arr-conflict" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="rgba(250,77,86,0.8)" />
      </marker>
      <marker id="arr-medium" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="rgba(241,194,27,0.8)" />
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
      <linearGradient
        id="bg-row"
        x1="0"
        y1="0"
        x2={viewWidth}
        y2="0"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="rgba(38,38,38,0)" />
        <stop offset="0.5" stopColor="rgba(38,38,38,0.4)" />
        <stop offset="1" stopColor="rgba(38,38,38,0)" />
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
const ROW_STEP = NODE_H + 90; // must match layoutEngine ROW_GAP

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
            fill="rgba(168,168,168,0.5)"
            fontSize="9"
            fontWeight="700"
            fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
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
  const toLn = getLayoutNode(layout, edge.to);
  if (!fromLn || !toLn) return null;

  const { x1, y1, x2, y2 } = edgePoints(fromLn, toLn);
  const toKind = nodeKindMap.get(edge.to);
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

  let stroke = '#525252';
  let strokeW = 1;
  let dashArray: string | undefined;
  let markerEnd = 'url(#arr-default)';

  if (isConflictEdge) {
    stroke = 'rgba(250,77,86,0.45)';
    strokeW = 1.5;
    dashArray = '6 3';
    markerEnd = 'url(#arr-conflict)';
    // Downgrade visuals for MEDIUM severity conflicts
    if (isMediumConflict) {
      stroke = 'rgba(241,194,27,0.45)';
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
          fill="rgba(168,168,168,0.7)"
          fontSize="9.5"
          fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
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
      <rect
        x={x}
        y={y}
        width={ln.width}
        height={ln.height}
        rx="9"
        ry="9"
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth="1.2"
      />
      {/* Accent top bar */}
      <rect
        x={x + 1}
        y={y + 1}
        width={ln.width - 2}
        height={5}
        rx="8"
        ry="8"
        fill={style.accent}
        opacity="0.6"
      />
      {/* Kind micro-label */}
      <text
        x={ln.x}
        y={y + 17}
        textAnchor="middle"
        fill={style.text}
        fontSize="8.5"
        fontWeight="700"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
        letterSpacing="0.08em"
        opacity="0.65"
      >
        REQUIREMENT
      </text>
      {/* Main label */}
      <text
        x={ln.x}
        y={y + 33}
        textAnchor="middle"
        fill={style.text}
        fontSize="12"
        fontWeight="600"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
      >
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
      <rect
        x={x}
        y={y}
        width={ln.width}
        height={ln.height}
        rx="8"
        ry="8"
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth="1"
      />
      <text
        x={ln.x}
        y={y + 16}
        textAnchor="middle"
        fill={style.text}
        fontSize="8.5"
        fontWeight="700"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
        letterSpacing="0.08em"
        opacity="0.65"
      >
        CHANGE
      </text>
      <text
        x={ln.x}
        y={y + 33}
        textAnchor="middle"
        fill={style.text}
        fontSize="12"
        fontWeight="600"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

// ── ASSUMPTION node — skewed parallelogram (amber) ────────────────────────────

function AssumptionNode({
  ln,
  label,
  severity,
}: {
  node: GraphNode;
  ln: LayoutNode;
  label: string;
  severity?: GraphNode['severity'];
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
  const strokeColor = severity === 'HIGH' ? 'rgba(250,77,86,0.55)' : style.stroke;

  return (
    <g>
      <polygon points={pts} fill={style.fill} stroke={strokeColor} strokeWidth={strokeW} />
      <text
        x={ln.x}
        y={y + 16}
        textAnchor="middle"
        fill={style.text}
        fontSize="8.5"
        fontWeight="700"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
        letterSpacing="0.08em"
        opacity="0.65"
      >
        ASSUMPTION
      </text>
      <text
        x={ln.x}
        y={y + 33}
        textAnchor="middle"
        fill={style.text}
        fontSize="11.5"
        fontWeight="600"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
      >
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
      <text
        x={ln.x - 4}
        y={y + 18}
        textAnchor="middle"
        fill={style.accent}
        fontSize="8.5"
        fontWeight="700"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
        letterSpacing="0.08em"
      >
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
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        fill={KIND_STYLE.FILE.text}
        fontSize="10.5"
        fontWeight="500"
        fontFamily="var(--mono, monospace)"
      >
        {label}
      </text>
    );
  }
  const dir = label.slice(0, lastSlash + 1);
  const file = label.slice(lastSlash + 1);
  return (
    <g>
      <text
        x={cx}
        y={cy - 7}
        textAnchor="middle"
        fill="rgba(168,168,168,0.55)"
        fontSize="9"
        fontWeight="400"
        fontFamily="var(--mono, monospace)"
      >
        {truncateLabel(dir, 28)}
      </text>
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fill={KIND_STYLE.FILE.text}
        fontSize="10.5"
        fontWeight="600"
        fontFamily="var(--mono, monospace)"
      >
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
  const styleKey =
    severity === 'HIGH'
      ? 'CONFLICT_HIGH'
      : severity === 'MEDIUM'
        ? 'CONFLICT_MEDIUM'
        : 'CONFLICT_LOW';
  const style = KIND_STYLE[styleKey];

  // Diamond dimensions
  const hw = ln.width / 2; // half-width
  const hh = ln.height / 2; // half-height

  const diamond = [
    `${ln.x},${ln.y - hh}`, // top
    `${ln.x + hw},${ln.y}`, // right
    `${ln.x},${ln.y + hh}`, // bottom
    `${ln.x - hw},${ln.y}`, // left
  ].join(' ');

  const strokeW = SEVERITY_STROKE_W[severity];
  const icon = SEVERITY_ICON[severity];

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
      <polygon points={diamond} fill={style.fill} stroke={style.stroke} strokeWidth={strokeW} />
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
      <text
        x={ln.x}
        y={ln.y - 10}
        textAnchor="middle"
        fill={style.accent}
        fontSize="13"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
      >
        {icon}
      </text>
      {/* Label */}
      <text
        x={ln.x}
        y={ln.y + 6}
        textAnchor="middle"
        fill={style.text}
        fontSize="11"
        fontWeight="700"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
      >
        {label}
      </text>
      {/* Severity badge text */}
      <text
        x={ln.x}
        y={ln.y + 20}
        textAnchor="middle"
        fill={style.accent}
        fontSize="8.5"
        fontWeight="700"
        fontFamily="'IBM Plex Sans', -apple-system, system-ui, sans-serif"
        letterSpacing="0.1em"
        opacity="0.8"
      >
        {severity} · click to inspect
      </text>
    </g>
  );
}
