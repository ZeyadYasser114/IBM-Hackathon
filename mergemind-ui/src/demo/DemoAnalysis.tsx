// ─────────────────────────────────────────────────────────────────────────────
// Demo: Analysis
//
// Story beat 3 — Bob agent animation
// Uses DEMO_AGENT_INTERVAL (800ms) instead of 1200ms.
// Auto-advances to graph step when all agents complete.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { getSession } from '@/adapters/semanticAdapter';
import type { AnalysisSession } from '@/types/semantic';
import { AgentProgress } from '@/components/AgentProgress';
import { useDemoMode } from '@/demo/demoContext';
import { DEMO_AGENT_INTERVAL } from '@/demo/demoScript';

const AGENT_COUNT = 5;

export function DemoAnalysis() {
  const demo = useDemoMode();
  const [session, setSession]  = useState<AnalysisSession | null>(null);
  const [step, setStep]        = useState(0);
  const [done, setDone]        = useState(false);
  const intervalRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancedRef            = useRef(false); // prevent double-advance

  useEffect(() => {
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Auto-advance to graph when done (only once)
  useEffect(() => {
    if (done && !advancedRef.current) {
      advancedRef.current = true;
      // Brief pause so the user can see "complete" state
      const t = setTimeout(() => demo.advance(), 900);
      return () => clearTimeout(t);
    }
  }, [done, demo]);

  const progress = Math.min(Math.round((step / AGENT_COUNT) * 100), 100);

  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="row gap-4" style={{ marginBottom: 'var(--sp-6)' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Bob Analysis Running</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Five parallel Bob subagents inspect requirements, code, contracts,
            dependencies, and semantic consistency.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 700,
            color: done ? 'var(--pass)' : 'var(--accent)', lineHeight: 1 }}>
            {progress}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>complete</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
        {session ? (
          <AgentProgress agents={session.agents} />
        ) : (
          <div className="row gap-3" style={{ justifyContent: 'center',
            padding: 'var(--sp-8)', color: 'var(--text-muted)' }}>
            <span className="spinner" />
            Initialising Bob agents…
          </div>
        )}
      </div>

      {done && (
        <div className="fade-in" style={{
          background: 'var(--high-bg)',
          border: '1px solid var(--high-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--sp-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-4)',
        }}>
          <div>
            <div className="row gap-2" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <h3 style={{ color: 'var(--high)' }}>1 Semantic Conflict Detected</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              HIGH severity business-rule conflict found despite a clean Git merge.
              Proceeding to Conflict Graph…
            </p>
          </div>
          <span className="spinner" style={{ flexShrink: 0 }} />
        </div>
      )}
    </div>
  );
}
