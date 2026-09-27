// ─────────────────────────────────────────────────────────────────────────────
// Demo: Analysis
//
// Story beat 3 — live verification progress.
// Polls GET /api/session/:id until COMPLETE or ERROR using the real session
// id stored in DemoContext. The five-row layout is preserved, but rows show
// honest pipeline stages (fetch → analyze → verify), never fake Bob claims.
// Offline fallback (fixture id) keeps the original ticker so the demo still
// works when the API is unreachable.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import {
  getSession,
  fetchLiveSession,
  fetchRawSession,
  buildInterimSession,
} from '@/adapters/semanticAdapter';
import { DEMO_SESSION } from '@/data/demoFixtures';
import type { AnalysisSession } from '@/types/semantic';
import { AgentProgress } from '@/components/AgentProgress';
import { useDemoMode } from '@/demo/demoContext';
import { DEMO_AGENT_INTERVAL } from '@/demo/demoScript';

const AGENT_COUNT = 5;
const LIVE_POLL_MS = 1500;

const STATUS_PROGRESS: Record<string, number> = {
  PENDING: 5,
  INGESTING: 25,
  RUNNING: 55,
  ANALYZING: 55,
  VERIFYING: 85,
  COMPLETE: 100,
};

export function DemoAnalysis() {
  const demo = useDemoMode();
  const sessionId = demo.sessionId;
  const isFixture = !sessionId || sessionId === DEMO_SESSION.id;

  const [session, setSession] = useState<AnalysisSession | null>(demo.liveSession);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(demo.sessionError);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancedRef = useRef(false); // prevent double-advance

  // ── Live polling path ──
  useEffect(() => {
    if (isFixture) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const raw = await fetchRawSession(sessionId!);
        if (cancelled || !raw) return;
        if (raw.status === 'COMPLETE') {
          const live = await fetchLiveSession(sessionId!);
          if (cancelled) return;
          if (live) {
            setSession(live);
            demo.setLiveSession(live);
            demo.setSessionStatus('COMPLETE');
            setStep(AGENT_COUNT);
            setDone(true);
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
          return;
        }
        if (raw.status === 'ERROR') {
          if (cancelled) return;
          const message = raw.error ?? 'Verification failed';
          setError(message);
          demo.setSessionError(message);
          demo.setSessionStatus('ERROR');
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }
        demo.setSessionStatus(raw.status as 'PENDING' | 'INGESTING' | 'ANALYZING' | 'VERIFYING');
        setSession(buildInterimSession(raw));
        setStep(AGENT_COUNT);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        demo.setSessionError(message);
        demo.setSessionStatus('ERROR');
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    void poll();
    intervalRef.current = setInterval(() => void poll(), LIVE_POLL_MS);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Offline fixture fallback (API unreachable when Verify ran) ──
  useEffect(() => {
    if (!isFixture) return;
    let currentStep = 0;

    const tick = async () => {
      const s = await getSession('session-demo-001', currentStep);
      setSession(s);
      currentStep++;
      setStep(currentStep);

      if (currentStep >= AGENT_COUNT) {
        clearInterval(intervalRef.current!);
        const final = await getSession('session-demo-001', AGENT_COUNT);
        setSession(final);
        setDone(true);
      }
    };

    tick();
    intervalRef.current = setInterval(tick, DEMO_AGENT_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFixture]);

  // Auto-advance to graph when done (only once)
  useEffect(() => {
    if (done && !advancedRef.current) {
      advancedRef.current = true;
      // Brief pause so the user can see "complete" state
      const t = setTimeout(() => demo.advance(), 900);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (!sessionId && !isFixture) {
    return (
      <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 style={{ marginBottom: 4 }}>No verification session</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 'var(--sp-5)' }}>
          Start a verification from the Verify screen first.
        </p>
        <button className="btn btn-primary" onClick={() => demo.jumpTo('verify')}>
          ← Back to Verify
        </button>
      </div>
    );
  }

  const liveStatus = demo.sessionStatus;
  const progress = isFixture
    ? Math.min(Math.round((step / AGENT_COUNT) * 100), 100)
    : (STATUS_PROGRESS[liveStatus] ?? 10);

  const conflicts = session?.graph.conflicts ?? [];
  const highCount = conflicts.filter((c) => c.severity === 'HIGH').length;
  const passed = done && conflicts.length === 0;

  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="row gap-4" style={{ marginBottom: 'var(--sp-6)' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Bob Analysis Running</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {isFixture
              ? 'Five parallel Bob subagents inspect requirements, code, contracts, dependencies, and semantic consistency.'
              : 'Fetching the repository, extracting real diffs, and checking semantic assumptions with the deterministic engine.'}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: done ? 'var(--pass)' : 'var(--accent)',
              lineHeight: 1,
            }}
          >
            {progress}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>complete</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
        {session ? (
          <AgentProgress agents={session.agents} />
        ) : (
          <div
            className="row gap-3"
            style={{ justifyContent: 'center', padding: 'var(--sp-8)', color: 'var(--text-muted)' }}
          >
            <span className="spinner" />
            {error ? 'Verification failed.' : 'Contacting verification session…'}
          </div>
        )}
      </div>

      {error && (
        <div
          className="fade-in"
          role="alert"
          style={{
            background: 'var(--high-bg)',
            border: '1px solid var(--high-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--sp-5)',
            marginBottom: 'var(--sp-5)',
          }}
        >
          <h3 style={{ color: 'var(--high)', marginBottom: 4 }}>Verification failed</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>
            {error}
          </p>
          <button className="btn btn-secondary" onClick={() => demo.jumpTo('verify')}>
            ← Back to Verify
          </button>
        </div>
      )}

      {done && !error && session && (
        <div
          className="fade-in"
          style={{
            background: passed ? 'var(--low-bg)' : 'var(--high-bg)',
            border: `1px solid ${passed ? 'var(--low-border)' : 'var(--high-border)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--sp-5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-4)',
          }}
        >
          <div>
            <div className="row gap-2" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{passed ? '✅' : '⚠'}</span>
              <h3 style={{ color: passed ? 'var(--pass)' : 'var(--high)' }}>
                {passed
                  ? 'No Semantic Conflicts'
                  : `${conflicts.length} Semantic Conflict${conflicts.length === 1 ? '' : 's'} Detected`}
              </h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {passed ? (
                <>
                  Live analysis verified {session.passport.assumptionsFound ?? 0} assumptions with
                  no conflicts — the changes agree.
                </>
              ) : (
                <>
                  Live analysis found{' '}
                  <strong style={{ color: 'var(--high)' }}>
                    {conflicts.length} semantic conflict{conflicts.length === 1 ? '' : 's'}
                    {highCount > 0 ? ` (${highCount} high-severity)` : ''}
                  </strong>{' '}
                  in this change set. Proceeding to Conflict Graph…
                </>
              )}
            </p>
          </div>
          <span className="spinner" style={{ flexShrink: 0 }} />
        </div>
      )}
    </div>
  );
}
