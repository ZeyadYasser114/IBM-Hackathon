import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAnalysis } from '@/adapters/semanticAdapter';
import type { VerifyChangeInput } from '@/types/semantic';

const DEFAULT_INPUT: VerifyChangeInput = {
  repository: 'acme-org/platform',
  featureRequest: 'Add organization billing. Only organization owners can manage subscriptions.',
  branchA: 'feature/auth-roles',
  branchB: 'feature/billing-permissions',
};

export function VerifyChange() {
  const navigate = useNavigate();
  const [input, setInput] = useState<VerifyChangeInput>(DEFAULT_INPUT);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const sessionId = await startAnalysis(input);
    navigate('/analysis', { state: { sessionId, input } });
  };

  return (
    <div className="fade-in" style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--sp-10)' }}>
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <HeroGraphic />
        </div>
        <h1 style={{ marginBottom: 'var(--sp-3)' }}>Verify Semantic Compatibility</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.7 }}>
          Git tells you whether code can merge.<br />
          <strong style={{ color: 'var(--text)' }}>MergeMind tells you whether the ideas can coexist.</strong>
        </p>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="card stack gap-6">
        <div className="stack gap-3">
          <label htmlFor="repo">Repository</label>
          <input
            id="repo"
            className="input-field input-mono"
            value={input.repository}
            onChange={(e) => setInput({ ...input, repository: e.target.value })}
            placeholder="owner/repo"
            required
          />
        </div>

        <div className="stack gap-3">
          <label htmlFor="feature">Feature Request</label>
          <textarea
            id="feature"
            className="input-field"
            rows={3}
            value={input.featureRequest}
            onChange={(e) => setInput({ ...input, featureRequest: e.target.value })}
            placeholder="Describe what the change is supposed to do…"
            required
            style={{ resize: 'vertical', fontFamily: 'var(--font)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Bob uses this requirement to verify that all changes still agree with the original intent.
          </span>
        </div>

        <hr />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
          <div className="stack gap-3">
            <label htmlFor="branchA">Branch A</label>
            <input
              id="branchA"
              className="input-field input-mono"
              value={input.branchA}
              onChange={(e) => setInput({ ...input, branchA: e.target.value })}
              placeholder="feature/my-change"
              required
            />
          </div>
          <div className="stack gap-3">
            <label htmlFor="branchB">Branch B</label>
            <input
              id="branchB"
              className="input-field input-mono"
              value={input.branchB}
              onChange={(e) => setInput({ ...input, branchB: e.target.value })}
              placeholder="feature/another-change"
              required
            />
          </div>
        </div>

        {/* ── Git status strip ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--radius)',
          padding: 'var(--sp-3) var(--sp-4)',
          fontSize: 12,
        }}>
          <GitIcon />
          <span style={{ color: 'var(--pass)', fontWeight: 600 }}>✓ Merge: no conflicts</span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ color: 'var(--pass)', fontWeight: 600 }}>✓ Tests: 42/42 passing</span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ color: 'var(--medium)', fontWeight: 600 }}>⚠ Semantic: unverified</span>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: 'flex-end' }}>
          {loading ? (
            <>
              <span className="spinner" />
              Starting analysis…
            </>
          ) : (
            <>
              <BobIcon />
              Verify with Bob
            </>
          )}
        </button>
      </form>

      {/* ── Conflict classes ── */}
      <div style={{ marginTop: 'var(--sp-8)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-4)' }}>
        {CONFLICT_CLASSES.map((c) => (
          <div key={c.title} className="card-sm stack gap-2">
            <span style={{ fontSize: 20 }}>{c.icon}</span>
            <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
              {c.title}
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const CONFLICT_CLASSES = [
  {
    icon: '⚖️',
    title: 'Business Rule',
    desc: 'Two changes interpret the same requirement differently.',
  },
  {
    icon: '📋',
    title: 'Contract',
    desc: 'One component changes something another depends on.',
  },
  {
    icon: '🔗',
    title: 'Dependency',
    desc: 'A change invalidates an assumption made elsewhere.',
  },
];

function HeroGraphic() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ margin: '0 auto', display: 'block' }}>
      <rect width="80" height="80" rx="20" fill="var(--surface)" stroke="var(--border)"/>
      <circle cx="40" cy="18" r="6" fill="none" stroke="var(--accent)" strokeWidth="1.5"/>
      <circle cx="20" cy="44" r="6" fill="none" stroke="#86efac" strokeWidth="1.5"/>
      <circle cx="60" cy="44" r="6" fill="none" stroke="#fde68a" strokeWidth="1.5"/>
      <circle cx="40" cy="62" r="7" fill="var(--high-bg)" stroke="var(--high)" strokeWidth="1.8"/>
      <path d="M40 22 L20 38 M40 22 L60 38 M20 50 L38 56 M60 50 L42 56" stroke="var(--border)" strokeWidth="1.2"/>
      <path d="M24 48 L36 58 M56 48 L44 58" stroke="rgba(248,81,73,0.5)" strokeWidth="1.2" strokeDasharray="3 2"/>
      <text x="37" y="66" fill="var(--high)" fontSize="8" fontWeight="700">!</text>
    </svg>
  );
}

function GitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-muted)">
      <path d="M15.7 7.3l-7-7a1 1 0 00-1.4 0l-7 7a1 1 0 000 1.4l7 7a1 1 0 001.4 0l7-7a1 1 0 000-1.4zM8 11a1 1 0 110-2 1 1 0 010 2zm1-4H7V4h2v3z"/>
    </svg>
  );
}

function BobIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect width="16" height="16" rx="4" fill="white" opacity="0.15"/>
      <circle cx="8" cy="8" r="4" stroke="white" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="1.5" fill="white"/>
    </svg>
  );
}
