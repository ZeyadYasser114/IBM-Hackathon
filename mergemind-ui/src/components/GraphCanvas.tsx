import type { ConflictGraph } from '@/types/semantic';

interface GraphCanvasProps {
  graph: ConflictGraph;
  onConflictClick: (conflictId: string) => void;
  highlightConflictId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure SVG conflict graph — no external library dependency.
// Layout uses a fixed column-based approach that maps directly to the
// REQUIREMENT → ASSUMPTIONS → FILES → CONFLICT conceptual hierarchy.
// ─────────────────────────────────────────────────────────────────────────────

// Node layout positions (hand-tuned for the demo fixture)
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  'req-1':       { x: 400, y: 50  },
  'chg-auth':    { x: 200, y: 160 },
  'chg-billing': { x: 600, y: 160 },
  'asmp-001':    { x: 180, y: 280 },
  'asmp-002':    { x: 620, y: 280 },
  'file-auth':   { x: 140, y: 400 },
  'file-billing':{ x: 660, y: 400 },
  'conf-001':    { x: 400, y: 500 },
};

const NODE_WIDTH  = 180;
const NODE_HEIGHT = 42;

const KIND_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  REQUIREMENT: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.5)', text: '#93c5fd' },
  CHANGE:      { bg: 'rgba(63,185,80,0.10)',  border: 'rgba(63,185,80,0.4)',  text: '#86efac' },
  ASSUMPTION:  { bg: 'rgba(227,179,65,0.12)', border: 'rgba(227,179,65,0.5)', text: '#fde68a' },
  FILE:        { bg: 'rgba(22,27,34,0.9)',    border: '#30363d',               text: '#8b949e' },
  CONFLICT:    { bg: 'rgba(248,81,73,0.15)',  border: 'rgba(248,81,73,0.6)', text: '#fca5a5' },
};

export function GraphCanvas({ graph, onConflictClick, highlightConflictId }: GraphCanvasProps) {
  return (
    <div style={{ width: '100%', overflow: 'hidden', borderRadius: 'var(--radius-lg)' }}>
      <svg
        viewBox="0 0 800 580"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Semantic conflict graph"
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#484f58" />
          </marker>
          <marker id="arrowhead-conflict" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="rgba(248,81,73,0.7)" />
          </marker>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Edges ── */}
        {graph.edges.map((edge, idx) => {
          const from = NODE_POSITIONS[edge.from];
          const to   = NODE_POSITIONS[edge.to];
          if (!from || !to) return null;

          const isConflictEdge =
            graph.nodes.find((n) => n.id === edge.to)?.kind === 'CONFLICT' ||
            graph.nodes.find((n) => n.id === edge.from)?.kind === 'CONFLICT';

          const x1 = from.x;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y - NODE_HEIGHT / 2 + 4;

          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <g key={idx}>
              <path
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                stroke={isConflictEdge ? 'rgba(248,81,73,0.5)' : '#30363d'}
                strokeWidth={isConflictEdge ? 1.5 : 1}
                fill="none"
                strokeDasharray={isConflictEdge ? '5 3' : undefined}
                markerEnd={isConflictEdge ? 'url(#arrowhead-conflict)' : 'url(#arrowhead)'}
              />
              {edge.label && (
                <text
                  x={midX}
                  y={midY - 4}
                  textAnchor="middle"
                  fill="#484f58"
                  fontSize="10"
                  fontFamily="-apple-system, system-ui, sans-serif"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Nodes ── */}
        {graph.nodes.map((node) => {
          const pos = NODE_POSITIONS[node.id];
          if (!pos) return null;

          const style = KIND_STYLES[node.kind] ?? KIND_STYLES.FILE;
          const isConflict  = node.kind === 'CONFLICT';
          const isHighlight = isConflict && node.id === highlightConflictId;
          const x = pos.x - NODE_WIDTH / 2;
          const y = pos.y - NODE_HEIGHT / 2;

          return (
            <g
              key={node.id}
              onClick={isConflict ? () => onConflictClick(node.id) : undefined}
              style={{ cursor: isConflict ? 'pointer' : 'default' }}
              filter={isConflict && isHighlight ? 'url(#glow-red)' : undefined}
            >
              <rect
                x={x} y={y}
                width={NODE_WIDTH} height={NODE_HEIGHT}
                rx="8"
                fill={style.bg}
                stroke={isConflict ? 'rgba(248,81,73,0.7)' : style.border}
                strokeWidth={isConflict ? 1.5 : 1}
              />

              {/* Severity dot for CONFLICT */}
              {isConflict && (
                <circle cx={x + 12} cy={pos.y} r={4} fill="var(--high)" />
              )}

              {/* Kind label (top-left micro text) */}
              <text
                x={isConflict ? x + 22 : x + 10}
                y={y + 14}
                fill={style.text}
                fontSize="9"
                fontWeight="700"
                fontFamily="-apple-system, system-ui, sans-serif"
                letterSpacing="0.05em"
                opacity="0.7"
              >
                {node.kind}
              </text>

              {/* Node label */}
              <text
                x={isConflict ? x + 22 : x + 10}
                y={y + 28}
                fill={style.text}
                fontSize="11.5"
                fontWeight="600"
                fontFamily="-apple-system, system-ui, sans-serif"
              >
                {node.label.length > 22 ? node.label.slice(0, 22) + '…' : node.label}
              </text>

              {/* Click hint for conflict nodes */}
              {isConflict && (
                <text
                  x={x + NODE_WIDTH - 8}
                  y={y + 26}
                  textAnchor="end"
                  fill="rgba(248,81,73,0.6)"
                  fontSize="10"
                  fontFamily="-apple-system, system-ui, sans-serif"
                >
                  inspect →
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
