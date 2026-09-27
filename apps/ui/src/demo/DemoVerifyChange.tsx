// ─────────────────────────────────────────────────────────────────────────────
// Demo: Verify Change
//
// Story beats 1 + 2:
//   Step 1 (verify) — form pre-filled with the Org Billing scenario,
//                     two branches shown, code diff snippets shown,
//                     "Verify with Bob" button is the narrator's cue
//   Step 2 (git-clean) — same screen shows the Git verdict strip prominently
//                        "Next" in DemoBar advances to analysis
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { startAnalysis } from '@/adapters/semanticAdapter';
import { useDemoMode } from '@/demo/demoContext';

const DEFAULT_INPUT = {
  repository: 'https://github.com/owner/repository',
  baseBranch: 'main',
  featureRequest: 'Add organization billing. Only organization owners can manage subscriptions.',
  branchA: 'feature/auth-roles',
  branchB: 'feature/billing-permissions',
};

export function DemoVerifyChange() {
  const demo = useDemoMode();
  const [loading, setLoading] = useState(false);
  const [repository, setRepository] = useState(DEFAULT_INPUT.repository);
  const [baseBranch, setBaseBranch] = useState(DEFAULT_INPUT.baseBranch);
  const [branchA, setBranchA] = useState(DEFAULT_INPUT.branchA);
  const [branchB, setBranchB] = useState(DEFAULT_INPUT.branchB);
  const [featureRequest, setFeatureRequest] = useState(DEFAULT_INPUT.featureRequest);
  const [error, setError] = useState<string | null>(null);
  // Memory-only: never persisted, never displayed back, sent once with Verify.
  const [bobApiKey, setBobApiKey] = useState('');

  const isGitCleanStep = demo.currentStep.id === 'git-clean';

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    demo.setSessionError(null);
    demo.setSessionStatus('PENDING');
    try {
      const sessionId = await startAnalysis({
        repository: repository.trim(),
        baseBranch: baseBranch.trim() || 'main',
        featureRequest: featureRequest.trim(),
        branchA: branchA.trim(),
        branchB: branchB.trim(),
        ...(bobApiKey.trim() ? { bobApiKey: bobApiKey.trim() } : {}),
      });
      demo.setSessionId(sessionId);
      demo.setLiveSession(null);
      demo.advance(); // verify → git-clean (same route, DemoBar advances)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      demo.setSessionError(message);
      demo.setSessionStatus('ERROR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* ── Scenario header ── */}
      <div style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="row gap-3" style={{ marginBottom: 'var(--sp-2)' }}>
          <h2>Verify Semantic Compatibility</h2>
          <span className="badge badge-blue">Demo scenario</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Two Bob agents wrote independent changes for the same feature. Git reports a clean merge.
          Are the <em>ideas</em> compatible?
        </p>
      </div>

      {/* ── Real verification input ── */}
      <div className="card stack gap-3" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="stack gap-3">
          <label htmlFor="demo-repo">Repository (public GitHub URL)</label>
          <input
            id="demo-repo"
            className="input-field input-mono"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="https://github.com/owner/repository"
            required
          />
        </div>

        <div className="stack gap-3">
          <label htmlFor="demo-feature">Feature request (original requirement)</label>
          <textarea
            id="demo-feature"
            className="input-field"
            rows={3}
            value={featureRequest}
            onChange={(e) => setFeatureRequest(e.target.value)}
            placeholder="Describe what the change is supposed to do…"
            required
            style={{ resize: 'vertical', fontFamily: 'var(--font)' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-4)' }}>
          <div className="stack gap-3">
            <label htmlFor="demo-base">Base branch</label>
            <input
              id="demo-base"
              className="input-field input-mono"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
              required
            />
          </div>
          <div className="stack gap-3">
            <label htmlFor="demo-branchA">Change A (branch or commit)</label>
            <input
              id="demo-branchA"
              className="input-field input-mono"
              value={branchA}
              onChange={(e) => setBranchA(e.target.value)}
              placeholder="feature/my-change"
              required
            />
          </div>
          <div className="stack gap-3">
            <label htmlFor="demo-branchB">Change B (branch or commit)</label>
            <input
              id="demo-branchB"
              className="input-field input-mono"
              value={branchB}
              onChange={(e) => setBranchB(e.target.value)}
              placeholder="feature/another-change"
              required
            />
          </div>
        </div>

        <div className="stack gap-3">
          <label htmlFor="demo-bobkey">Bob API key (optional — enables live Bob analysis)</label>
          <input
            id="demo-bobkey"
            type="password"
            className="input-field input-mono"
            value={bobApiKey}
            onChange={(e) => setBobApiKey(e.target.value)}
            placeholder="bob_prod_…"
            autoComplete="off"
          />
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          MergeMind clones the repository, extracts the real diffs for both changes against the base
          branch, and verifies them with the deterministic semantic engine. Source text only —
          repository code is never executed. The key is sent once with this verification and never
          stored.
        </span>

        {error && (
          <div
            role="alert"
            style={{
              padding: 'var(--sp-3) var(--sp-4)',
              background: 'var(--high-bg)',
              border: '1px solid var(--high-border)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              color: 'var(--high)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* ── Git precondition strip — always visible, highlighted in step 2 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-4)',
          padding: 'var(--sp-4)',
          background: isGitCleanStep ? 'rgba(66,190,101,0.06)' : 'var(--surface-2)',
          border: `1px solid ${isGitCleanStep ? 'var(--low-border)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--sp-5)',
          transition: 'border-color 0.3s, background 0.3s',
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
              marginBottom: 'var(--sp-3)',
            }}
          >
            {isGitCleanStep ? '⎇  Git verdict — looks safe' : '⎇  Pre-merge check'}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
            <GitCheck text="Merge: no conflicts" />
            <GitCheck text="42 / 42 tests passing" />
            <GitCheck text="Code compiles" />
          </div>
        </div>
        {isGitCleanStep && (
          <div
            className="fade-in"
            style={{
              padding: '6px 14px',
              background: 'var(--low-bg)',
              border: '1px solid var(--low-border)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--pass)',
            }}
          >
            ✓ Everything looks safe
          </div>
        )}
      </div>

      {/* ── MergeMind question ── */}
      <div
        style={{
          textAlign: 'center',
          padding: 'var(--sp-6)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--sp-5)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 'var(--sp-2)' }}>
          But do the <em style={{ color: 'var(--accent)' }}>ideas</em> agree?
        </div>
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-muted)',
            marginBottom: 'var(--sp-5)',
            lineHeight: 1.6,
          }}
        >
          Git understands text. MergeMind understands intent.
        </p>
        {demo.currentStep.id === 'verify' && (
          <button
            className="btn btn-primary"
            onClick={handleVerify}
            disabled={loading}
            style={{ fontSize: 14, padding: '10px 24px' }}
          >
            {loading ? (
              <>
                <span className="spinner" /> Starting…
              </>
            ) : (
              '🤖 Verify with Bob'
            )}
          </button>
        )}
        {demo.currentStep.id === 'git-clean' && (
          <div
            className="fade-in row gap-2"
            style={{ justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}
          >
            <span className="spinner" />
            Press <strong>Next →</strong> in the demo bar to run Bob analysis
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function GitCheck({ text }: { text: string }) {
  return (
    <span className="row gap-2" style={{ fontSize: 13 }}>
      <span style={{ color: 'var(--pass)' }}>✓</span>
      <span style={{ color: 'var(--text)' }}>{text}</span>
    </span>
  );
}
