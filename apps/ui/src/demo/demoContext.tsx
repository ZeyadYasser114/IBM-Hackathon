// ─────────────────────────────────────────────────────────────────────────────
// Demo Context
//
// Provides DemoContext to all demo-route pages. Pages call useDemoMode() to:
//   • know whether they are inside the demo flow
//   • read the current step
//   • call advance() to move to the next step
//   • call restart() to reset to step 0 and navigate to /demo/verify
//
// The context is NOT used on the regular / routes — those remain unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_STEPS, DEMO_STEP_BY_INDEX, type DemoStep, type DemoStepId } from './demoScript';
import type { AnalysisSession } from '@/types/semantic';

// ── Live session status ───────────────────────────────────────────────────────
// Mirrors the API lifecycle: PENDING → INGESTING → ANALYZING → VERIFYING →
// COMPLETE / ERROR. Fixture fallback uses COMPLETE directly.

export type DemoSessionStatus =
  'IDLE' | 'PENDING' | 'INGESTING' | 'ANALYZING' | 'VERIFYING' | 'COMPLETE' | 'ERROR';

// ── Context shape ─────────────────────────────────────────────────────────────

export interface DemoContextValue {
  /** Always true inside /demo/* routes */
  isDemo: boolean;
  currentStep: DemoStep;
  stepIndex: number;
  totalSteps: number;
  /** Move to the next step (and navigate if the next step has a different route) */
  advance: () => void;
  /** Jump to a specific step by id */
  jumpTo: (id: DemoStepId) => void;
  /** Reset to step 0 and navigate to /demo/verify */
  restart: () => void;
  /** Real verification session id returned by POST /api/verify (null until verified) */
  sessionId: string | null;
  /** Store the real session id after Verify */
  setSessionId: (id: string | null) => void;
  /** Last fully-mapped live AnalysisSession (null until COMPLETE) */
  liveSession: AnalysisSession | null;
  /** Store the mapped live session */
  setLiveSession: (s: AnalysisSession | null) => void;
  /** Live polling status for the current session */
  sessionStatus: DemoSessionStatus;
  /** Update the live polling status */
  setSessionStatus: (s: DemoSessionStatus) => void;
  /** Actionable error message when the live session fails */
  sessionError: string | null;
  /** Set the live session error */
  setSessionError: (e: string | null) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface DemoProviderProps {
  children: ReactNode;
}

export function DemoProvider({ children }: DemoProviderProps) {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [liveSession, setLiveSession] = useState<AnalysisSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<DemoSessionStatus>('IDLE');
  const [sessionError, setSessionError] = useState<string | null>(null);

  const currentStep = DEMO_STEP_BY_INDEX(stepIndex);

  const advance = useCallback(() => {
    const nextIdx = stepIndex + 1;
    const nextStep = DEMO_STEP_BY_INDEX(nextIdx);
    setStepIndex(nextIdx);
    // Navigate only when route changes
    if (nextStep.route !== currentStep.route) {
      navigate(nextStep.route);
    }
  }, [stepIndex, currentStep.route, navigate]);

  const jumpTo = useCallback(
    (id: DemoStepId) => {
      const target = DEMO_STEPS.find((s) => s.id === id);
      if (!target) return;
      setStepIndex(target.index);
      navigate(target.route);
    },
    [navigate],
  );

  const restart = useCallback(() => {
    setStepIndex(0);
    setSessionId(null);
    setLiveSession(null);
    setSessionStatus('IDLE');
    setSessionError(null);
    navigate('/demo/verify');
  }, [navigate]);

  const value: DemoContextValue = {
    isDemo: true,
    currentStep,
    stepIndex,
    totalSteps: DEMO_STEPS.length,
    advance,
    jumpTo,
    restart,
    sessionId,
    setSessionId,
    liveSession,
    setLiveSession,
    sessionStatus,
    setSessionStatus,
    sessionError,
    setSessionError,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the demo context when inside /demo/* routes, or a safe no-op stub
 * when called outside the demo (regular routes). Pages never need to guard for null.
 */
export function useDemoMode(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (ctx) return ctx;
  // Stub for non-demo routes — all values are inert
  return {
    isDemo: false,
    currentStep: DEMO_STEP_BY_INDEX(0),
    stepIndex: 0,
    totalSteps: DEMO_STEPS.length,
    advance: () => {},
    jumpTo: () => {},
    restart: () => {},
    sessionId: null,
    setSessionId: () => {},
    liveSession: null,
    setLiveSession: () => {},
    sessionStatus: 'IDLE' as DemoSessionStatus,
    setSessionStatus: () => {},
    sessionError: null,
    setSessionError: () => {},
  };
}
