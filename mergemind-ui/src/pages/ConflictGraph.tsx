import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraphCanvas } from '@/components/GraphCanvas';
import { SeverityBadge } from '@/components/StatusBadge';
import { GRAPH_SCENARIOS, type GraphScenario } from '@/graph/graphScenarios';
import type { Conflict } from '@/types/semantic';

// ─────────────────────────────────────────────────────────────────────────────
// Conflict Graph page — scenario-aware, uses data-driven GraphCanvas
// ─────────────────────────────────────────────────────────────────────────────

export function ConflictGraph() {
  const navigate = useNavigate();
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [selectedId, setSelectedId]   = useState<string | undefined>(undefined);

  const scenario = GRAPH_SCENARIOS[scenarioIdx]!;
  const conflicts = scenario.graph.conflicts;
  const conflictCount = conflicts.length;
  const highCount  = conflicts.filter((c) => c.severity === 'HIGH').length;
  const medCount   = conflicts.filter((c) => c.severity === 'MEDIUM').length;

  const handleConflictClick = (conflictId: string) => {
    setSelectedId(conflictId);
    navigate('/detail', { state: { conflictId, scenarioIdx } });
  };

  return (
    <div className="fade-in">
      {/* ── Page header ── */}
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="row gap-3" style={{ marginBottom: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <h2>Conflict Graph</h2>
          {highCount  > 0 && <span className="badge badge-high">{highCount} HIGH</span>}
          {medCount   > 0 && <span className="badge badge-medium">{medCount} MEDIUM</span>}
          {conflictCount === 0 && <span className="badge badge-pass">No conflicts</span>}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Git reported a clean merge. Bob found semantic conflicts hidden inside the code.
          Select a scenario below, then click a conflict node to inspect the assumption mismatch.
        </p>
      </div>

      {/* ── Scenario selector ── */}
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>
          Demo Scenario
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          {GRAPH_SCENARIOS.map((s, idx) => (
            <ScenarioTab
              key={s.id}
              scenario={s}
              isActive={idx === scenarioIdx}
              onClick={() => { setScenarioIdx(idx); setSelectedId(undefined); }}
            />
          ))}
        </div>
      </div>

      {/* ── Git vs MergeMind comparison strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)',
        marginBottom: 'var(--sp-6)' }}>
        <StatusStrip icon="git" label="Git verdict" items={scenario.gitVerdict} />
        <StatusStrip icon="mm"  label="MergeMind verdict" items={scenario.mmVerdict} />
      </div>

      {/* ── Graph canvas ── */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)', padding: 'var(--sp-4)' }}>
        <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
          <div className="stack gap-1">
            <h3 style={{ fontSize: 14 }}>Semantic Conflict Map</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {scenario.subtitle} · {scenario.graph.nodes.length} nodes ·{' '}
              {scenario.graph.edges.length} relationships
            </p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <GraphLegend />
          </div>
        </div>

        <GraphCanvas
          graph={scenario.graph}
          onConflictClick={handleConflictClick}
          selectedConflictId={selectedId}
        />

        {/* Keyboard hint */}
        <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center',
          marginTop: 'var(--sp-3)' }}>
          Click or press Enter on a ◇ Conflict node to inspect the assumption mismatch
        </p>
      </div>

      {/* ── Conflict list ── */}
      <div>
        <h3 style={{ marginBottom: 'var(--sp-4)', fontSize: 14 }}>
          Detected Conflicts — {scenario.title}
        </h3>
        {conflicts.length === 0 ? (
          <div className="card-sm" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No semantic conflicts detected in this scenario.
          </div>
        ) : (
          <div className="stack gap-3">
            {conflicts.map((c) => (
              <ConflictRow
                key={c.id}
                conflict={c}
                isSelected={c.id === selectedId}
                onClick={() => handleConflictClick(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scenario tab ──────────────────────────────────────────────────────────────

function ScenarioTab({ scenario, isActive, onClick }: {
  scenario: GraphScenario;
  isActive: boolean;
  onClick: () => void;
}) {
  const severityColor = scenario.severity === 'HIGH'
    ? 'var(--high)'
    : scenario.severity === 'MEDIUM'
    ? 'var(--medium)'
    : 'var(--low)';

  return (
    <button
      onClick={onClick}
      style={{
        display:    'flex',
        flexDirection: 'column',
        gap:        4,
        padding:    '10px 16px',
        background: isActive ? 'var(--surface-2)' : 'var(--surface)',
        border:     `1px solid ${isActive ? severityColor : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        cursor:     'pointer',
        textAlign:  'left',
        transition: 'border-color 0.15s',
        minWidth:   160,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
        {scenario.title}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {scenario.subtitle}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, color: severityColor,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {scenario.severity}
      </span>
    </button>
  );
}

// ── Verdict comparison strip ───────────────────────────────────────────────────

function StatusStrip({ icon, label, items }: {
  icon: 'git' | 'mm';
  label: string;
  items: { text: string; pass: boolean }[];
}) {
  const isGit = icon === 'git';
  return (
    <div className="card-sm" style={{
      borderColor: isGit ? 'var(--border)' : 'var(--high-border)',
      background:  isGit ? 'var(--surface)' : 'var(--high-bg)',
    }}>
      <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
        <span style={{ fontWeight: 600, fontSize: 12,
          color: isGit ? 'var(--text-muted)' : 'var(--high)' }}>
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

// ── Conflict row ──────────────────────────────────────────────────────────────

function ConflictRow({ conflict, isSelected, onClick }: {
  conflict: Conflict;
  isSelected: boolean;
  onClick: () => void;
}) {
  const severityBorder = conflict.severity === 'HIGH'
    ? 'var(--high-border)'
    : conflict.severity === 'MEDIUM'
    ? 'var(--medium-border)'
    : 'var(--low-border)';

  const severityBg = conflict.severity === 'HIGH'
    ? 'var(--high-bg)'
    : conflict.severity === 'MEDIUM'
    ? 'var(--medium-bg)'
    : 'var(--low-bg)';

  return (
    <div
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      role="button"
      aria-label={`Inspect conflict: ${conflict.title}`}
      className="card-sm"
      style={{
        cursor:      'pointer',
        border:      `1px solid ${isSelected ? 'var(--accent)' : severityBorder}`,
        background:  isSelected ? 'rgba(59,130,246,0.06)' : severityBg,
        display:     'grid',
        gridTemplateColumns: '1fr auto',
        alignItems:  'center',
        gap:         'var(--sp-4)',
        transition:  'border-color 0.15s, background 0.15s',
        outline:     isSelected ? '1px solid var(--accent)' : 'none',
      }}
    >
      <div className="stack gap-1">
        <div className="row gap-2">
          <SeverityBadge severity={conflict.severity} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)',
            textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {conflict.kind.replace('_', ' ')}
          </span>
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>{conflict.title}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {conflict.affectedFiles.map((f) => (
            <span key={f} className="tag" style={{ marginRight: 4 }}>{f}</span>
          ))}
        </p>
        {/* One-line assumption clash summary */}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
          "{conflict.assumptionA.statement}" ≠ "{conflict.assumptionB.statement}"
        </p>
      </div>
      <span style={{
        color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 13, flexShrink: 0,
      }}>
        {isSelected ? 'selected ✓' : 'Inspect →'}
      </span>
    </div>
  );
}

// ── Graph legend ──────────────────────────────────────────────────────────────

function GraphLegend() {
  const items = [
    { shape: 'rect',        color: 'rgba(59,130,246,0.3)',  label: 'Requirement' },
    { shape: 'rect',        color: 'rgba(63,185,80,0.3)',   label: 'Change' },
    { shape: 'parallelogram', color: 'rgba(227,179,65,0.3)',label: 'Assumption' },
    { shape: 'doc',         color: 'rgba(99,110,123,0.3)',  label: 'File' },
    { shape: 'diamond',     color: 'rgba(248,81,73,0.3)',   label: 'Conflict' },
  ];

  return (
    <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {items.map((item) => (
        <div key={item.label} className="row gap-2"
          style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          <LegendShape shape={item.shape} color={item.color} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

function LegendShape({ shape, color }: { shape: string; color: string }) {
  const s = 12;
  if (shape === 'diamond') {
    return (
      <svg width={s} height={s} viewBox="0 0 12 12">
        <polygon points="6,1 11,6 6,11 1,6" fill={color} stroke={color} strokeWidth="1"/>
      </svg>
    );
  }
  if (shape === 'parallelogram') {
    return (
      <svg width={s} height={s} viewBox="0 0 12 12">
        <polygon points="3,1 12,1 9,11 0,11" fill={color} stroke={color} strokeWidth="1"/>
      </svg>
    );
  }
  if (shape === 'doc') {
    return (
      <svg width={s} height={s} viewBox="0 0 12 12">
        <path d="M1 1 L9 1 L11 3 L11 11 L1 11 Z" fill={color} stroke={color} strokeWidth="1"/>
      </svg>
    );
  }
  return (
    <svg width={s} height={s} viewBox="0 0 12 12">
      <rect x="1" y="1" width="10" height="10" rx="2" fill={color} stroke={color} strokeWidth="1"/>
    </svg>
  );
}
