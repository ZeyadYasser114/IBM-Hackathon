// ─────────────────────────────────────────────────────────────────────────────
// useLiveSession — loads a COMPLETE live analysis session by id.
//
// Returns { session: null } when there is no session id, the id is the demo
// fixture id, or the API is unreachable/incomplete — callers then render
// their fixture content unchanged. Demo (/demo/*) routes never use this hook.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { fetchLiveSession } from '@/adapters/semanticAdapter';
import { DEMO_SESSION } from '@/data/demoFixtures';
import type { AnalysisSession } from '@/types/semantic';

export interface LiveSessionState {
  session: AnalysisSession | null;
  loading: boolean;
}

export function useLiveSession(sessionId: string | undefined): LiveSessionState {
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId || sessionId === DEMO_SESSION.id) {
      setSession(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchLiveSession(sessionId)
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { session, loading };
}
