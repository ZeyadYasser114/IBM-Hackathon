/**
 * VerifyForm — Screen 1 input form
 *
 * Pre-populated with the demo fixture scenario (auth/billing role conflict).
 * The "Verify with Bob" button calls verify.start and navigates to the result.
 *
 * EXTENSION POINT
 * ---------------
 * - Replace fixture defaults with a real repo/branch picker
 * - On success navigate to /verify/[id] (Screen 2 → 3 → 4 → 5)
 */
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { DEMO_SCENARIO } from '@/fixtures/demo-scenario';

type FormState = 'idle' | 'submitting' | 'done' | 'error';

export function VerifyForm() {
  const [requirementText, setRequirementText] = useState(DEMO_SCENARIO.requirement.description);
  const [repoName, setRepoName] = useState(DEMO_SCENARIO.repository.name);
  const [formState, setFormState] = useState<FormState>('idle');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startVerification = trpc.verify.start.useMutation({
    onSuccess(data) {
      setVerificationId(data.verificationId);
      setFormState('done');
    },
    onError(err) {
      setErrorMessage(err.message);
      setFormState('error');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState('submitting');
    setErrorMessage(null);

    startVerification.mutate({
      requirement: {
        ...DEMO_SCENARIO.requirement,
        description: requirementText,
      },
      repository: {
        ...DEMO_SCENARIO.repository,
        name: repoName,
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section>
        <label style={labelStyle} htmlFor="repo-name">Repository</label>
        <input
          id="repo-name"
          style={inputStyle}
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          placeholder="my-org/my-repo"
          required
        />
      </section>

      <section>
        <label style={labelStyle} htmlFor="requirement">Feature requirement</label>
        <textarea
          id="requirement"
          style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
          value={requirementText}
          onChange={(e) => setRequirementText(e.target.value)}
          placeholder="Describe what the developer asked for…"
          required
        />
        <p style={{ color: 'var(--color-muted)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
          Branches to verify: {DEMO_SCENARIO.repository.featureBranches.map((b) => b.name).join(', ')}
        </p>
      </section>

      <button
        type="submit"
        disabled={formState === 'submitting'}
        style={buttonStyle(formState === 'submitting')}
      >
        {formState === 'submitting' ? 'Running Bob agents…' : '✦ Verify with Bob'}
      </button>

      {formState === 'done' && verificationId && (
        <div style={resultBoxStyle('success')}>
          <strong>Verification started</strong>
          <p style={{ marginTop: '0.4rem', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            ID: <code>{verificationId}</code>
          </p>
          <p style={{ marginTop: '0.4rem', fontSize: '0.875rem' }}>
            Poll <code>GET /api/trpc/verify.result?input={JSON.stringify({ verificationId })}</code> for results.
          </p>
        </div>
      )}

      {formState === 'error' && (
        <div style={resultBoxStyle('error')}>
          <strong>Error</strong>
          <p style={{ marginTop: '0.4rem', fontSize: '0.875rem' }}>{errorMessage}</p>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline — replaced by design system in UI branch)
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontWeight: 600,
  fontSize: '0.875rem',
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.8rem',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  color: 'var(--color-text)',
  fontSize: '1rem',
  fontFamily: 'inherit',
  outline: 'none',
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '0.75rem 1.5rem',
  background: disabled ? 'var(--color-border)' : 'var(--color-accent)',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  alignSelf: 'flex-start',
  transition: 'background 0.15s',
});

const resultBoxStyle = (variant: 'success' | 'error'): React.CSSProperties => ({
  padding: '1rem',
  borderRadius: '6px',
  border: `1px solid ${variant === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
  background: 'var(--color-surface)',
});
