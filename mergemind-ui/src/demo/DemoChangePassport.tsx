// ─────────────────────────────────────────────────────────────────────────────
// Demo: Change Passport
//
// Story beats 8 + 9 + 10:
//   Step 8 (tests)    — PASS passport shows 43/43 prominently
//   Step 9 (passport) — full passport card visible
//   Step 10 (done)    — restart CTA shown
// ─────────────────────────────────────────────────────────────────────────────

import { PassportCard } from '@/components/PassportCard';
import { PASSPORT_PASS } from '@/data/passportFixtures';
import { serializePassport } from '@/data/passportFixtures';
import { useDemoMode } from '@/demo/demoContext';

export function DemoChangePassport() {
  const demo = useDemoMode();
  const isDone = demo.currentStep.id === 'done';

  const handleExport = () => {
    const json = serializePassport(PASSPORT_PASS);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mergemind-passport-${PASSPORT_PASS.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)', flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Change Passport</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Permanent verification record. Serialisable for future developers and AI agents.
          </p>
        </div>
        <div className="row gap-2">
          <button className="btn btn-ghost" onClick={handleExport} style={{ fontSize: 12 }}>
            ↓ Export JSON
          </button>
        </div>
      </div>

      {/* ── Test count callout (beat 8) ── */}
      {(demo.currentStep.id === 'tests' || demo.currentStep.id === 'passport' || isDone) && (
        <div className="fade-in" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
          padding: 'var(--sp-4) var(--sp-6)',
          background: 'var(--low-bg)',
          border: '1px solid var(--low-border)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--sp-5)',
        }}>
          <div style={{
            fontSize: 40, fontWeight: 800, color: 'var(--pass)', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            43/43
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--pass)',
              marginBottom: 3 }}>
              Tests passing
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              New regression test added: <code>"admin cannot manage organization subscription"</code>
            </div>
          </div>
        </div>
      )}

      {/* ── Passport card ── */}
      <PassportCard
        passport={PASSPORT_PASS}
        onInspectConflict={() => demo.jumpTo('detail')}
      />

      {/* ── Done CTA ── */}
      {isDone && (
        <div className="fade-in" style={{
          marginTop: 'var(--sp-8)',
          textAlign: 'center',
          padding: 'var(--sp-8)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 'var(--sp-3)' }}>🎉</div>
          <h2 style={{ marginBottom: 'var(--sp-3)', fontSize: 22 }}>Demo complete</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 'var(--sp-6)',
            lineHeight: 1.7, maxWidth: 480, margin: '0 auto var(--sp-6)' }}>
            Git told you whether the code could merge.
            <br />
            <strong style={{ color: 'var(--text)' }}>
              MergeMind told you whether the ideas could coexist.
            </strong>
          </p>
          <button
            className="btn btn-primary"
            onClick={demo.restart}
            style={{ fontSize: 14, padding: '10px 24px' }}
          >
            ↺ Run demo again
          </button>
        </div>
      )}
    </div>
  );
}
