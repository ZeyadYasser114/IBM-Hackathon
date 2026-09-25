import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSession } from '@/adapters/semanticAdapter';
import type { AnalysisSession } from '@/types/semantic';
import { AgentProgress } from '@/components/AgentProgress';

const AGENT_COUNT = 5;
const STEP_INTERVAL_MS = 1200; // advance one agent every 1.2s

export function Analysis() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const sessionId = (location.state as { sessionId?: string })?.sessionId ?? 'session-demo-001';

  const [session, setSession]     = useState<AnalysisSession | null>(null);
  const [step, setStep]           = useState(0);
  const [done, setDone]           = useState(false);
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  // Progressive agent simulation
  useEffect(() => {
    let currentStep = 0;

    const tick = async () => {
      const s = await getSession(sessionId, currentStep);
      setSession(s);
      currentStep++;
      setStep(currentStep);

      if (currentStep >= AGENT_COUNT) {
        clearInterval(intervalRef.current!);
        // Final complete load
        const final = await getSession(sessionId, AGENT_COUNT);
        setSession(final);
        setDone(true);
      }
    };

    tick();
    intervalRef.current = setInterval(tick, STEP_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.min(Math.round((step / AGENT_COUNT) * 100), 100);

  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div className="row gap-4" style={{ marginBottom: 'var(--sp-6)' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Bob Analysis Running</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Parallel agents are inspecting requirements, code, contracts, and dependencies.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: done ? 'var(--pass)' : 'var(--accent)', lineHeight: 1 }}>
            {progress}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>complete</div>
        </div>
      </div>

      {/* ── Agent panel ── */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
        {session ? (
          <AgentProgress agents={session.agents} />
        ) : (
          <div className="row gap-3" style={{ justifyContent: 'center', padding: 'var(--sp-8)', color: 'var(--text-muted)' }}>
            <span className="spinner" />
            Initialising Bob agents…
          </div>
        )}
      </div>

      {/* ── What Bob is doing ── */}
      <div className="card-sm" style={{ marginBottom: 'var(--sp-6)', background: 'var(--surface-2)' }}>
        <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
          <BobLogo />
          <span style={{ fontWeight: 600, fontSize: 13 }}>IBM Bob — Parallel Subagents</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          MergeMind launches five specialized Bob agents simultaneously. Each agent focuses on one
          dimension of the change — intent, behavior, contracts, dependencies, and adversarial
          consistency. This multi-perspective approach catches conflicts that any single reviewer
          would miss.
        </p>
      </div>

      {/* ── CTA when done ── */}
      {done && (
        <div
          className="fade-in"
          style={{
            background: 'var(--high-bg)',
            border: '1px solid var(--high-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--sp-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-4)',
          }}
        >
          <div>
            <div className="row gap-2" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <h3 style={{ color: 'var(--high)' }}>Semantic Conflict Detected</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Bob found <strong style={{ color: 'var(--high)' }}>1 high-severity</strong> semantic
              conflict that passed Git merge and all 42 tests.
            </p>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => navigate('/graph', { state: { sessionId } })}
            style={{ flexShrink: 0 }}
          >
            View Conflict Graph →
          </button>
        </div>
      )}
    </div>
  );
}

function BobLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect width="18" height="18" rx="5" fill="var(--accent)" opacity="0.2"/>
      <circle cx="9" cy="9" r="4" stroke="var(--accent)" strokeWidth="1.5"/>
      <circle cx="9" cy="9" r="1.5" fill="var(--accent)"/>
    </svg>
  );
}
