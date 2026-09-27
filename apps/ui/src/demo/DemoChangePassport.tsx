// ─────────────────────────────────────────────────────────────────────────────
// Demo: Change Passport
//
// Story beats 8 + 9 + 10:
//   Step 8 (tests)    — test callout only when tests were actually measured
//   Step 9 (passport) — full passport card visible
//   Step 10 (done)    — restart CTA shown
//
// Live path renders demo.liveSession.passport (real verification result).
// Fixture fallback keeps PASSPORT_PASS when the API is unreachable. Measured
// values only — unmeasured metrics render as "Not measured" via PassportCard.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { PassportCard } from '@/components/PassportCard';
import { PASSPORT_PASS } from '@/data/passportFixtures';
import { serializePassport } from '@/data/passportFixtures';
import { fetchMerge, markMerged, type MergeAttestation } from '@/adapters/semanticAdapter';
import { useDemoMode } from '@/demo/demoContext';
import { DEMO_SESSION } from '@/data/demoFixtures';

export function DemoChangePassport() {
  const demo = useDemoMode();
  const isDone = demo.currentStep.id === 'done';

  const live = demo.liveSession && demo.sessionId !== DEMO_SESSION.id ? demo.liveSession : null;
  const passport = live ? live.passport : PASSPORT_PASS;

  const [merge, setMerge] = useState<MergeAttestation | null>(null);
  const [marking, setMarking] = useState(false);
  const [note, setNote] = useState('');
  const [mergeError, setMergeError] = useState<string | null>(null);

  useEffect(() => {
    if (!live || !demo.sessionId) {
      setMerge(null);
      return;
    }
    let cancelled = false;
    fetchMerge(demo.sessionId)
      .then((m) => {
        if (!cancelled) setMerge(m);
      })
      .catch(() => {
        // Offline — merge marking unavailable, passport still renders.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.sessionId]);

  const handleMarkMerged = async () => {
    if (!demo.sessionId) return;
    setMarking(true);
    setMergeError(null);
    try {
      const m = await markMerged(demo.sessionId, note.trim() || undefined);
      setMerge(m);
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarking(false);
    }
  };

  const handleExport = () => {
    const json = serializePassport(passport);
    const data = JSON.parse(json) as Record<string, unknown>;
    // Attach the merge attestation when present — export stays honest.
    if (live && merge) data['merge'] = { ...merge, sessionId: demo.sessionId };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mergemind-passport-${passport.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showTests =
    (demo.currentStep.id === 'tests' || demo.currentStep.id === 'passport' || isDone) &&
    passport.testsTotal !== null &&
    passport.testsPassing !== null;

  return (
    <div className="fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--sp-4)',
          marginBottom: 'var(--sp-5)',
          flexWrap: 'wrap',
        }}
      >
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

      {/* ── Test count callout — only when tests were actually measured ── */}
      {showTests && (
        <div
          className="fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-5)',
            padding: 'var(--sp-4) var(--sp-6)',
            background: 'var(--low-bg)',
            border: '1px solid var(--low-border)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: 'var(--sp-5)',
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: 'var(--pass)',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {passport.testsPassing}/{passport.testsTotal}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--pass)', marginBottom: 3 }}>
              Tests passing
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Measured test results for this verification.
            </div>
          </div>
        </div>
      )}

      {/* ── Passport card ── */}
      <PassportCard passport={passport} onInspectConflict={() => demo.jumpTo('detail')} />

      {/* ── Merge with Git — live PASS sessions only ── */}
      {live && passport.status === 'PASS' && (
        <div
          className="card"
          style={{
            marginTop: 'var(--sp-5)',
            borderColor: merge ? 'var(--low-border)' : 'var(--border)',
            background: merge ? 'var(--low-bg)' : 'var(--surface)',
          }}
        >
          {merge ? (
            <div className="row gap-2">
              <span style={{ fontSize: 16 }}>⎇</span>
              <div>
                <h3 style={{ color: 'var(--pass)', fontSize: 14 }}>Merged with Git</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Marked {new Date(merge.markedAt).toLocaleString()}
                  {merge.note ? ` — ${merge.note}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="stack gap-3">
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 4 }}>
                  Task looks simple — merge with Git
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  No semantic conflicts were found. Merge the branches yourself with Git, then
                  record it here for the audit trail. MergeMind never modifies your repository.
                </p>
              </div>
              <input
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note (e.g. merged via PR #12)"
                maxLength={200}
                style={{ fontSize: 13 }}
              />
              {mergeError && (
                <div role="alert" style={{ fontSize: 12, color: 'var(--high)' }}>
                  {mergeError}
                </div>
              )}
              <div>
                <button
                  className="btn btn-primary"
                  onClick={handleMarkMerged}
                  disabled={marking}
                  style={{ fontSize: 13, padding: '8px 18px' }}
                >
                  {marking ? (
                    <>
                      <span className="spinner" /> Recording…
                    </>
                  ) : (
                    '⎇ Mark merged with Git'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {live && passport.status !== 'PASS' && (
        <div
          className="card-sm"
          style={{
            marginTop: 'var(--sp-5)',
            background: 'var(--surface-2)',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          Merging is blocked until all semantic conflicts are resolved — accept the suggested
          resolution first.
        </div>
      )}

      {/* ── Done CTA ── */}
      {isDone && (
        <div
          className="fade-in"
          style={{
            marginTop: 'var(--sp-8)',
            textAlign: 'center',
            padding: 'var(--sp-8)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 'var(--sp-3)' }}>🎉</div>
          <h2 style={{ marginBottom: 'var(--sp-3)', fontSize: 22 }}>Demo complete</h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-muted)',
              marginBottom: 'var(--sp-6)',
              lineHeight: 1.7,
              maxWidth: 480,
              margin: '0 auto var(--sp-6)',
            }}
          >
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
