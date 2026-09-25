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
import {
  DEMO_STEPS,
  DEMO_STEP_BY_INDEX,
  type DemoStep,
  type DemoStepId,
} from './demoScript';

// ── Context shape ─────────────────────────────────────────────────────────────

export interface DemoContextValue {
  /** Always true inside /demo/* routes */
  isDemo:       boolean;
  currentStep:  DemoStep;
  stepIndex:    number;
  totalSteps:   number;
  /** Move to the next step (and navigate if the next step has a different route) */
  advance:      () => void;
  /** Jump to a specific step by id */
  jumpTo:       (id: DemoStepId) => void;
  /** Reset to step 0 and navigate to /demo/verify */
  restart:      () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface DemoProviderProps { children: ReactNode; }

export function DemoProvider({ children }: DemoProviderProps) {
  const navigate  = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);

  const currentStep = DEMO_STEP_BY_INDEX(stepIndex);

  const advance = useCallback(() => {
    const nextIdx  = stepIndex + 1;
    const nextStep = DEMO_STEP_BY_INDEX(nextIdx);
    setStepIndex(nextIdx);
    // Navigate only when route changes
    if (nextStep.route !== currentStep.route) {
      navigate(nextStep.route);
    }
  }, [stepIndex, currentStep.route, navigate]);

  const jumpTo = useCallback((id: DemoStepId) => {
    const target = DEMO_STEPS.find((s) => s.id === id);
    if (!target) return;
    setStepIndex(target.index);
    navigate(target.route);
  }, [navigate]);

  const restart = useCallback(() => {
    setStepIndex(0);
    navigate('/demo/verify');
  }, [navigate]);

  const value: DemoContextValue = {
    isDemo:      true,
    currentStep,
    stepIndex,
    totalSteps: DEMO_STEPS.length,
    advance,
    jumpTo,
    restart,
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
    isDemo:      false,
    currentStep: DEMO_STEP_BY_INDEX(0),
    stepIndex:   0,
    totalSteps:  DEMO_STEPS.length,
    advance:     () => {},
    jumpTo:      () => {},
    restart:     () => {},
  };
}
