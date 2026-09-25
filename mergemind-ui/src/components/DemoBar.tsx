// ─────────────────────────────────────────────────────────────────────────────
// DemoBar — sticky bottom demo progress bar
//
// Visible only inside /demo/* routes (when isDemo = true).
// Shows: current step label, step number, progress dots, restart button.
// Designed to be readable on a laptop screen during a live demo without
// distracting from the main content.
// ─────────────────────────────────────────────────────────────────────────────

import { useDemoMode } from '@/demo/demoContext';
import { DEMO_STEPS } from '@/demo/demoScript';

export function DemoBar() {
  const { isDemo, currentStep, stepIndex, totalSteps, advance, restart } = useDemoMode();

  if (!isDemo) return null;

  const isDone = currentStep.id === 'done';
  const pct    = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div
      className="print-hide"
      style={{
        position:   'fixed',
        bottom:     0,
        left:       0,
        right:      0,
        height:     52,
        background: 'var(--surface)',
        borderTop:  '1px solid var(--border)',
        display:    'flex',
        alignItems: 'center',
        padding:    '0 var(--sp-6)',
        gap:        'var(--sp-4)',
        zIndex:     200,
        boxShadow:  '0 -2px 8px rgba(0,0,0,0.25)',
      }}
    >
      {/* Demo badge */}
      <span style={{
        fontSize:    9,
        fontWeight:  700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color:       'var(--accent)',
        background:  'var(--accent-glow)',
        border:      '1px solid rgba(59,130,246,0.3)',
        borderRadius: 4,
        padding:     '2px 6px',
        flexShrink:   0,
      }}>
        DEMO
      </span>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {DEMO_STEPS.map((s, idx) => (
          <div
            key={s.id}
            title={s.label}
            style={{
              width:        idx === stepIndex ? 16 : 6,
              height:       6,
              borderRadius: 3,
              background:   idx < stepIndex
                ? 'var(--pass)'
                : idx === stepIndex
                ? 'var(--accent)'
                : 'var(--border)',
              transition:   'width 0.2s ease, background 0.2s ease',
              flexShrink:    0,
            }}
          />
        ))}
      </div>

      {/* Current step label */}
      <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
        {currentStep.label}
      </span>

      {/* Progress fraction */}
      <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
        {stepIndex + 1} / {totalSteps}
      </span>

      {/* Progress bar track */}
      <div style={{
        width:        120,
        height:       4,
        background:   'var(--border)',
        borderRadius: 2,
        overflow:     'hidden',
        flexShrink:    0,
      }}>
        <div style={{
          width:      `${pct}%`,
          height:     '100%',
          background: isDone ? 'var(--pass)' : 'var(--accent)',
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Next / Done button */}
      {!isDone ? (
        <button
          onClick={advance}
          className="btn btn-primary"
          style={{ padding: '5px 14px', fontSize: 12, flexShrink: 0 }}
        >
          Next →
        </button>
      ) : (
        <button
          onClick={restart}
          className="btn btn-secondary"
          style={{ padding: '5px 14px', fontSize: 12, flexShrink: 0 }}
        >
          ↺ Restart demo
        </button>
      )}

      {/* Restart (always present) */}
      {!isDone && (
        <button
          onClick={restart}
          className="btn btn-ghost"
          style={{ padding: '5px 10px', fontSize: 11, flexShrink: 0 }}
          title="Restart demo from the beginning"
        >
          ↺
        </button>
      )}
    </div>
  );
}
