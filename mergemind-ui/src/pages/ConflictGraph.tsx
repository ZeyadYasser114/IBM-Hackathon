import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_GRAPH, DEMO_CONFLICTS } from '@/data/demoFixtures';
import { GraphCanvas } from '@/components/GraphCanvas';
import { SeverityBadge } from '@/components/StatusBadge';
import type { Conflict } from '@/types/semantic';

export function ConflictGraph() {
  const navigate = useNavigate();
  const [highlighted, setHighlighted] = useState<string | undefined>(undefined);

  const handleConflictClick = (conflictId: string) => {
    const conflict = DEMO_CONFLICTS.find((c) => c.id === conflictId);
    if (conflict) {
      navigate('/detail', { state: { conflictId } });
    }
  };

  return (
    <div className="fade-in">
      {/* ── Page header ── */}
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="row gap-3" style={{ marginBottom: 'var(--sp-2)' }}>
          <h2>Conflict Graph</h2>
          <span className="badge badge-fail">1 HIGH conflict</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Git reported a clean merge. Bob found a semantic conflict hidden in the code.
          Click a conflict node to inspect the assumption mismatch.
        </p>
      </div>

      {/* ── Git vs MergeMind comparison strip ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--sp-4)',
        marginBottom: 'var(--sp-6)',
      }}>
        <StatusStrip
          icon="git"
          label="Git verdict"
          items={[
            { text: 'Merge: no conflicts', pass: true },
            { text: '42/42 tests passing', pass: true },
            { text: 'Code compiles', pass: true },
          ]}
        />
        <StatusStrip
          icon="mm"
          label="MergeMind verdict"
          items={[
            { text: 'Semantic: CONFLICT FOUND', pass: false },
            { text: 'authorization inaccessible for owner', pass: false },
            { text: 'Role assumption disagrees', pass: false },
          ]}
        />
      </div>

      {/* ── Graph ── */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)', padding: 'var(--sp-4)' }}>
        <div className="row gap-3" style={{ marginBottom: 'var(--sp-4)' }}>
          <h3 style={{ fontSize: 14 }}>Semantic Conflict Map</h3>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            Click a conflict node to inspect
          </span>
        </div>
        <GraphCanvas
          graph={DEMO_GRAPH}
          onConflictClick={(id) => {
            setHighlighted(id);
            handleConflictClick(id);
          }}
          highlightConflictId={highlighted}
        />

        {/* Legend */}
        <div className="row gap-4" style={{ marginTop: 'var(--sp-4)', flexWrap: 'wrap', justifyContent: 'center' }}>
          {LEGEND.map((item) => (
            <div key={item.label} className="row gap-2" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <span style={{
                display: 'inline-block', width: 12, height: 12,
                borderRadius: 3, background: item.color, border: `1px solid ${item.border}`,
              }}/>
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Conflict list ── */}
      <div>
        <h3 style={{ marginBottom: 'var(--sp-4)', fontSize: 14 }}>Detected Conflicts</h3>
        <div className="stack gap-3">
          {DEMO_CONFLICTS.map((c) => (
            <ConflictRow
              key={c.id}
              conflict={c}
              onClick={() => navigate('/detail', { state: { conflictId: c.id } })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusStrip({ icon, label, items }: {
  icon: 'git' | 'mm';
  label: string;
  items: { text: string; pass: boolean }[];
}) {
  const isGit = icon === 'git';
  return (
    <div
      className="card-sm"
      style={{
        borderColor: isGit ? 'var(--border)' : 'var(--high-border)',
        background: isGit ? 'var(--surface)' : 'var(--high-bg)',
      }}
    >
      <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: isGit ? 'var(--text-muted)' : 'var(--high)' }}>
          {isGit ? '⎇ ' : '🧠 '}{label}
        </span>
      </div>
      <div className="stack gap-2">
        {items.map((item) => (
          <div key={item.text} className="row gap-2" style={{ fontSize: 12 }}>
            <span style={{ color: item.pass ? 'var(--pass)' : 'var(--high)', flexShrink: 0 }}>
              {item.pass ? '✓' : '✗'}
            </span>
            <span style={{ color: item.pass ? 'var(--text)' : 'var(--high)' }}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConflictRow({ conflict, onClick }: { conflict: Conflict; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="card-sm"
      style={{
        cursor: 'pointer',
        border: '1px solid var(--high-border)',
        background: 'var(--high-bg)',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
    >
      <div className="stack gap-1">
        <div className="row gap-2">
          <SeverityBadge severity={conflict.severity} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            {conflict.kind.replace('_', ' ')}
          </span>
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>{conflict.title}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {conflict.affectedFiles.map((f) => (
            <span key={f} className="tag" style={{ marginRight: 4 }}>{f}</span>
          ))}
        </p>
      </div>
      <span style={{ color: 'var(--high)', fontSize: 13, flexShrink: 0 }}>Inspect →</span>
    </div>
  );
}

const LEGEND = [
  { label: 'Requirement',  color: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.4)'  },
  { label: 'Change',       color: 'rgba(63,185,80,0.12)',   border: 'rgba(63,185,80,0.35)'  },
  { label: 'Assumption',   color: 'rgba(227,179,65,0.15)',  border: 'rgba(227,179,65,0.4)'  },
  { label: 'File',         color: '#161b22',                border: '#30363d'                },
  { label: 'Conflict',     color: 'rgba(248,81,73,0.15)',   border: 'rgba(248,81,73,0.55)'  },
];
