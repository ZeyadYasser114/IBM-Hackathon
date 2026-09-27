// ─────────────────────────────────────────────────────────────────────────────
// Demo: Conflict Graph
//
// Story beats 4 + 5:
//   Step 4 (graph)     — full graph rendered, conflict node pulsing
//   Step 5 (highlight) — conflict row is highlighted, CTA to inspect it
// Clicking the conflict node or "Inspect" advances to detail step.
//
// Live path uses demo.liveSession.graph (real ConflictReport mapping).
// Fixture fallback keeps SCENARIO_OWNER_ADMIN when the API is unreachable.
// Zero conflicts render a real PASS state — never a fabricated conflict.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { GraphCanvas } from '@/components/GraphCanvas';
import { SeverityBadge } from '@/components/StatusBadge';
import { SCENARIO_OWNER_ADMIN } from '@/graph/graphScenarios';
import { useDemoMode } from '@/demo/demoContext';
import { DEMO_CONFLICT_ID } from '@/demo/demoScript';
import { DEMO_SESSION } from '@/data/demoFixtures';

export function DemoConflictGraph() {
  const demo = useDemoMode();
  const isHighlightStep = demo.currentStep.id === 'highlight' || demo.currentStep.id === 'detail';

  const live = demo.liveSession && demo.sessionId !== DEMO_SESSION.id ? demo.liveSession : null;
  const graph = live ? live.graph : SCENARIO_OWNER_ADMIN;
  const conflicts = graph.conflicts;
  const firstConflict = conflicts[0];
  const highlightId = live ? firstConflict?.id : DEMO_CONFLICT_ID;

  // Auto-highlight conflict after a short delay on step 4
  const [selectedId, setSelectedId] = useState<string | undefined>(
    isHighlightStep ? highlightId : undefined,
  );

  useEffect(() => {
    if (demo.currentStep.id === 'graph') {
      // No conflicts → skip highlight, go straight to passport
      if (conflicts.length === 0) return;
      const t = setTimeout(() => {
        setSelectedId(highlightId);
        demo.advance(); // graph → highlight
      }, 1400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.currentStep.id, highlightId, conflicts.length]);

  const handleConflictClick = () => {
    demo.jumpTo('detail');
  };

  if (!live && demo.sessionId && demo.sessionId !== DEMO_SESSION.id && !demo.liveSession) {
    return (
      <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 style={{ marginBottom: 4 }}>Analysis not ready</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 'var(--sp-5)' }}>
          The verification session has no complete result yet. Run the analysis first.
        </p>
        <button className="btn btn-primary" onClick={() => demo.jumpTo('analysis')}>
          ← Back to Analysis
        </button>
      </div>
    );
  }

  const highCount = conflicts.filter((c) => c.severity === 'HIGH').length;
  // Full real total (rendered list may be capped for usability — see adapter).
  const totalConflicts = live
    ? (live.passport.conflictsFound ?? conflicts.length)
    : conflicts.length;
  const badge =
    totalConflicts === 0
      ? 'No conflicts'
      : `${totalConflicts} conflict${totalConflicts === 1 ? '' : 's'}${highCount > 0 ? ` · ${highCount} HIGH` : ''}`;

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="row gap-3" style={{ marginBottom: 'var(--sp-2)' }}>
          <h2>Conflict Graph</h2>
          <span
            className={`badge ${conflicts.length === 0 ? 'badge-pass' : highCount > 0 ? 'badge-high' : 'badge-medium'}`}
          >
            {badge}
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {live
            ? `Real semantic analysis of ${live.input.branchA} vs ${live.input.branchB}.`
            : 'Git reported a clean merge. Bob found a semantic conflict inside the meaning.'}
        </p>
      </div>

      {/* ── Git vs MergeMind strip ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--sp-4)',
          marginBottom: 'var(--sp-5)',
        }}
      >
        {live ? (
          <VerdictStrip
            icon="⎇"
            label="Repository input"
            items={[
              { text: live.input.repository, pass: true },
              { text: `base: ${live.input.baseBranch ?? 'main'}`, pass: true },
              { text: `${live.input.branchA} vs ${live.input.branchB}`, pass: true },
            ]}
            dim
          />
        ) : (
          <VerdictStrip
            icon="⎇"
            label="Git verdict"
            items={[
              { text: 'Merge: no conflicts', pass: true },
              { text: '42/42 tests passing', pass: true },
              { text: 'Code compiles', pass: true },
            ]}
            dim
          />
        )}
        <VerdictStrip
          icon="🧠"
          label="MergeMind verdict"
          items={
            conflicts.length === 0
              ? [
                  { text: 'Semantic: NO CONFLICTS', pass: true },
                  { text: 'Changes agree', pass: true },
                ]
              : conflicts.map((c) => ({
                  text: `${c.title} (${c.severity})`,
                  pass: false,
                }))
          }
        />
      </div>

      {/* ── Graph ── */}
      <div className="card" style={{ marginBottom: 'var(--sp-5)', padding: 'var(--sp-4)' }}>
        <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
          <h3 style={{ fontSize: 14 }}>Semantic Conflict Map</h3>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            {conflicts.length === 0
              ? 'No conflicts to inspect'
              : isHighlightStep
                ? '◇ Click the conflict diamond to inspect'
                : 'Analysing…'}
          </span>
        </div>
        <GraphCanvas
          graph={graph}
          onConflictClick={handleConflictClick}
          selectedConflictId={selectedId}
        />
      </div>

      {/* ── PASS state ── */}
      {conflicts.length === 0 && (
        <div
          className="fade-in card"
          style={{
            borderColor: 'var(--low-border)',
            background: 'var(--low-bg)',
            marginBottom: 'var(--sp-5)',
          }}
        >
          <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
            <span>✅</span>
            <h3 style={{ color: 'var(--pass)' }}>Changes agree</h3>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>
            The deterministic engine extracted {live?.passport.assumptionsFound ?? '—'} assumptions
            and found no semantic conflicts.
          </p>
          <button className="btn btn-primary" onClick={() => demo.jumpTo('passport')}>
            View Change Passport →
          </button>
        </div>
      )}

      {/* ── Conflict rows ── */}
      {isHighlightStep && totalConflicts > 0 && (
        <div className="fade-in" style={{ marginBottom: 'var(--sp-4)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 'var(--sp-3)' }}>
            Detected Conflicts
            {live && totalConflicts > conflicts.length && (
              <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>
                {' '}
                — showing {conflicts.length} of {totalConflicts} (ordered by severity)
              </span>
            )}
          </h3>
          {conflicts.map((conflict) => (
            <div key={conflict.id} style={{ marginBottom: 'var(--sp-4)' }}>
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
                    <SeverityBadge severity={conflict.severity} />
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--mono)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {conflict.kind.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--high)' }}>
                    {conflict.title}
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    &quot;{conflict.assumptionA.statement}&quot; ≠ &quot;
                    {conflict.assumptionB.statement}&quot;
                  </p>
                </div>
                <span
                  style={{ color: 'var(--high)', fontSize: 14, fontWeight: 700, flexShrink: 0 }}
                >
                  Inspect evidence →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function VerdictStrip({
  icon,
  label,
  items,
  dim,
}: {
  icon: string;
  label: string;
  items: { text: string; pass: boolean }[];
  dim?: boolean;
}) {
  return (
    <div
      className="card-sm"
      style={{
        borderColor: dim ? 'var(--border)' : 'var(--high-border)',
        background: dim ? 'var(--surface)' : 'var(--high-bg)',
      }}
    >
      <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            color: dim ? 'var(--text-muted)' : 'var(--high)',
          }}
        >
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
