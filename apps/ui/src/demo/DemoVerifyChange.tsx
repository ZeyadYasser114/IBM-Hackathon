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

const DEMO_INPUT = {
  repository:     'acme-org/platform',
  featureRequest: 'Add organization billing. Only organization owners can manage subscriptions.',
  branchA:        'feature/auth-roles',
  branchB:        'feature/billing-permissions',
};

const CODE_DIFF_A = `// auth/roles.ts  (feature/auth-roles)
export const ORG_PRIVILEGED_ROLE = 'owner';
User.role = ORG_PRIVILEGED_ROLE;`;

const CODE_DIFF_B = `// billing/permissions.ts  (feature/billing-permissions)
if (user.role === 'admin') {
  return manageSubscription();
}`;

export function DemoVerifyChange() {
  const demo       = useDemoMode();
  const [loading, setLoading] = useState(false);

  const isGitCleanStep = demo.currentStep.id === 'git-clean';

  const handleVerify = async () => {
    setLoading(true);
    await startAnalysis(DEMO_INPUT);
    demo.advance(); // verify → git-clean (same route, DemoBar advances)
    setLoading(false);
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
          Two Bob agents wrote independent changes for the same feature.
          Git reports a clean merge. Are the <em>ideas</em> compatible?
        </p>
      </div>

      {/* ── Input summary ── */}
      <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
        <FieldRow label="Repository"      value={DEMO_INPUT.repository}     mono />
        <FieldRow label="Feature request" value={DEMO_INPUT.featureRequest} />
        <FieldRow label="Branch A"        value={DEMO_INPUT.branchA}        mono />
        <FieldRow label="Branch B"        value={DEMO_INPUT.branchB}        mono />
      </div>

      {/* ── Code diffs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)',
        marginBottom: 'var(--sp-5)' }}>
        <CodePanel label="Authentication change" code={CODE_DIFF_A} accent="var(--low)" />
        <CodePanel label="Billing change"        code={CODE_DIFF_B} accent="var(--medium)" />
      </div>

      {/* ── Git precondition strip — always visible, highlighted in step 2 ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        padding: 'var(--sp-4)',
        background: isGitCleanStep ? 'rgba(63,185,80,0.06)' : 'var(--surface-2)',
        border: `1px solid ${isGitCleanStep ? 'var(--low-border)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        marginBottom: 'var(--sp-5)',
        transition: 'border-color 0.3s, background 0.3s',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 'var(--sp-3)' }}>
            {isGitCleanStep ? '⎇  Git verdict — looks safe' : '⎇  Pre-merge check'}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
            <GitCheck text="Merge: no conflicts"   />
            <GitCheck text="42 / 42 tests passing" />
            <GitCheck text="Code compiles"         />
          </div>
        </div>
        {isGitCleanStep && (
          <div className="fade-in" style={{
            padding: '6px 14px',
            background: 'var(--low-bg)',
            border: '1px solid var(--low-border)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--pass)',
          }}>
            ✓ Everything looks safe
          </div>
        )}
      </div>

      {/* ── MergeMind question ── */}
      <div style={{
        textAlign: 'center',
        padding: 'var(--sp-6)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 'var(--sp-5)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 'var(--sp-2)' }}>
          But do the <em style={{ color: 'var(--accent)' }}>ideas</em> agree?
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 'var(--sp-5)', lineHeight: 1.6 }}>
          Git understands text. MergeMind understands intent.
        </p>
        {demo.currentStep.id === 'verify' && (
          <button
            className="btn btn-primary"
            onClick={handleVerify}
            disabled={loading}
            style={{ fontSize: 14, padding: '10px 24px' }}
          >
            {loading ? <><span className="spinner" /> Starting…</> : '🤖 Verify with Bob'}
          </button>
        )}
        {demo.currentStep.id === 'git-clean' && (
          <div className="fade-in row gap-2" style={{ justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 13 }}>
            <span className="spinner" />
            Press <strong>Next →</strong> in the demo bar to run Bob analysis
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row gap-2" style={{ marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: 'var(--text-dim)', width: 110, flexShrink: 0 }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function CodePanel({ label, code, accent }: { label: string; code: string; accent: string }) {
  return (
    <div style={{ border: `1px solid ${accent}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{
        padding: '6px 12px',
        background: 'var(--surface-2)',
        borderBottom: `1px solid ${accent}`,
        fontSize: 11, fontWeight: 600, color: accent,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </div>
      <pre style={{
        margin: 0, padding: 'var(--sp-3) var(--sp-4)',
        background: 'var(--surface)',
        fontSize: 12, fontFamily: 'var(--mono)',
        color: 'var(--text)', lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
      }}>
        {code}
      </pre>
    </div>
  );
}

function GitCheck({ text }: { text: string }) {
  return (
    <span className="row gap-2" style={{ fontSize: 13 }}>
      <span style={{ color: 'var(--pass)' }}>✓</span>
      <span style={{ color: 'var(--text)' }}>{text}</span>
    </span>
  );
}
