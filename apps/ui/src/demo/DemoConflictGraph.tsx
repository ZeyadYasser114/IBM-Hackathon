// ─────────────────────────────────────────────────────────────────────────────
// Demo: Conflict Graph
//
// Story beats 4 + 5:
//   Step 4 (graph)     — full graph rendered, conflict node pulsing
//   Step 5 (highlight) — conflict row is highlighted, CTA to inspect it
// Clicking the conflict node or "Inspect" advances to detail step.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { GraphCanvas } from '@/components/GraphCanvas';
import { SeverityBadge } from '@/components/StatusBadge';
import { SCENARIO_OWNER_ADMIN } from '@/graph/graphScenarios';
import { useDemoMode } from '@/demo/demoContext';
import { DEMO_CONFLICT_ID } from '@/demo/demoScript';

const CONFLICT = SCENARIO_OWNER_ADMIN.conflicts[0]!;

export function DemoConflictGraph() {
  const demo = useDemoMode();
  const isHighlightStep = demo.currentStep.id === 'highlight' ||
                          demo.currentStep.id === 'detail';

  // Auto-highlight conflict after a short delay on step 4
  const [selectedId, setSelectedId] = useState<string | undefined>(
    isHighlightStep ? DEMO_CONFLICT_ID : undefined
  );

  useEffect(() => {
    if (demo.currentStep.id === 'graph') {
      const t = setTimeout(() => {
        setSelectedId(DEMO_CONFLICT_ID);
        demo.advance(); // graph → highlight
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [demo.currentStep.id, demo]);

  const handleConflictClick = () => {
    demo.jumpTo('detail');
  };

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="row gap-3" style={{ marginBottom: 'var(--sp-2)' }}>
          <h2>Conflict Graph</h2>
          <span className="badge badge-high">1 HIGH conflict</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Git reported a clean merge. Bob found a semantic conflict inside the meaning.
        </p>
      </div>

      {/* ── Git vs MergeMind strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
        <VerdictStrip
          icon="⎇"
          label="Git verdict"
          items={[
            { text: 'Merge: no conflicts',    pass: true },
            { text: '42/42 tests passing',    pass: true },
            { text: 'Code compiles',          pass: true },
          ]}
          dim
        />
        <VerdictStrip
          icon="🧠"
          label="MergeMind verdict"
          items={[
            { text: 'Semantic: CONFLICT FOUND',             pass: false },
            { text: 'Subscription management inaccessible', pass: false },
            { text: 'role="owner" ≠ role="admin"',          pass: false },
          ]}
        />
      </div>

      {/* ── Graph ── */}
      <div className="card" style={{ marginBottom: 'var(--sp-5)', padding: 'var(--sp-4)' }}>
        <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
          <h3 style={{ fontSize: 14 }}>Semantic Conflict Map</h3>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            {isHighlightStep ? '◇ Click the conflict diamond to inspect' : 'Analysing…'}
          </span>
        </div>
        <GraphCanvas
          graph={SCENARIO_OWNER_ADMIN}
          onConflictClick={handleConflictClick}
          selectedConflictId={selectedId}
        />
      </div>

      {/* ── Conflict row ── */}
      {isHighlightStep && (
        <div className="fade-in">
          <h3 style={{ fontSize: 14, marginBottom: 'var(--sp-3)' }}>Detected Conflicts</h3>
          <div
            onClick={handleConflictClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleConflictClick()}
            style={{
              cursor: 'pointer',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: 'var(--sp-4)',
              padding: 'var(--sp-4)',
              background: 'var(--high-bg)',
              border: '2px solid var(--high-border)',
              borderRadius: 'var(--radius-lg)',
              transition: 'opacity 0.15s',
            }}
          >
            <div className="stack gap-1">
              <div className="row gap-2">
                <SeverityBadge severity={CONFLICT.severity} />
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)',
                  textTransform: 'uppercase' }}>
                  BUSINESS RULE
                </span>
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--high)' }}>
                {CONFLICT.title}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                "{CONFLICT.assumptionA.statement}" ≠ "{CONFLICT.assumptionB.statement}"
              </p>
            </div>
            <span style={{ color: 'var(--high)', fontSize: 14, fontWeight: 700,
              flexShrink: 0 }}>
              Inspect evidence →
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function VerdictStrip({ icon, label, items, dim }: {
  icon: string; label: string;
  items: { text: string; pass: boolean }[];
  dim?: boolean;
}) {
  return (
    <div className="card-sm" style={{
      borderColor: dim ? 'var(--border)' : 'var(--high-border)',
      background:  dim ? 'var(--surface)' : 'var(--high-bg)',
    }}>
      <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
        <span style={{ fontWeight: 600, fontSize: 12,
          color: dim ? 'var(--text-muted)' : 'var(--high)' }}>
          {icon} {label}
        </span>
      </div>
      {items.map((item) => (
        <div key={item.text} className="row gap-2" style={{ fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: item.pass ? 'var(--pass)' : 'var(--high)', flexShrink: 0 }}>
            {item.pass ? '✓' : '✗'}
          </span>
          <span style={{ color: item.pass ? 'var(--text)' : 'var(--high)' }}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
