import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_CONFLICTS } from '@/data/demoFixtures';
import { SeverityBadge } from '@/components/StatusBadge';
import type { Assumption } from '@/types/semantic';

export function ConflictDetail() {
  const navigate = useNavigate();
  const conflict = DEMO_CONFLICTS[0]; // Single demo conflict
  const [resolved, setResolved] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    // Simulate Bob applying the fix
    await new Promise((r) => setTimeout(r, 1400));
    setResolved(true);
    setAccepting(false);
  };

  if (!conflict) return <div>Conflict not found.</div>;

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* ── Breadcrumb ── */}
      <div className="row gap-2" style={{ marginBottom: 'var(--sp-6)', fontSize: 13 }}>
        <button onClick={() => navigate('/graph')} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>
          ← Back to graph
        </button>
      </div>

      {/* ── Conflict header ── */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)', borderColor: 'var(--high-border)', background: 'var(--high-bg)' }}>
        <div className="row gap-3" style={{ marginBottom: 'var(--sp-3)' }}>
          <SeverityBadge severity={conflict.severity} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {conflict.kind.replace('_', ' ')}
          </span>
          {resolved && <span className="badge badge-pass" style={{ marginLeft: 'auto' }}>RESOLVED</span>}
        </div>
        <h2 style={{ marginBottom: 'var(--sp-3)', color: 'var(--high)' }}>{conflict.title}</h2>
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7 }}>{conflict.description}</p>
      </div>

      {/* ── Requirement trace ── */}
      <section style={{ marginBottom: 'var(--sp-6)' }}>
        <SectionHeading icon="📌" title="Requirement that was violated" />
        <div className="code-block" style={{ borderLeft: '3px solid var(--accent)', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
          {conflict.requirementText}
        </div>
      </section>

      {/* ── Assumption clash ── */}
      <section style={{ marginBottom: 'var(--sp-6)' }}>
        <SectionHeading icon="⚡" title="Conflicting assumptions" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
          <AssumptionCard
            assumption={conflict.assumptionA}
            label="Authentication change"
            accent="#86efac"
            accentBg="rgba(63,185,80,0.1)"
          />
          <AssumptionCard
            assumption={conflict.assumptionB}
            label="Billing change"
            accent="var(--high)"
            accentBg="var(--high-bg)"
          />
        </div>

        {/* Clash visualiser */}
        <div style={{
          marginTop: 'var(--sp-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--sp-6)',
          padding: 'var(--sp-4)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          <CodePill file="auth/roles.ts" value='"owner"' color="var(--low)" />
          <div style={{ fontSize: 20, color: 'var(--high)' }}>≠</div>
          <CodePill file="billing/permissions.ts" value='"admin"' color="var(--high)" />
        </div>
      </section>

      {/* ── Affected files ── */}
      <section style={{ marginBottom: 'var(--sp-6)' }}>
        <SectionHeading icon="📁" title="Affected files" />
        <div className="stack gap-2">
          {conflict.affectedFiles.map((f) => (
            <div key={f} className="row gap-3 card-sm" style={{ padding: '10px 14px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>📄</span>
              <span className="mono" style={{ fontSize: 13 }}>{f}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bob proposed resolution ── */}
      {conflict.proposedResolution && !resolved && (
        <section style={{ marginBottom: 'var(--sp-6)' }}>
          <SectionHeading icon="🤖" title="Bob-proposed resolution" />
          <div className="card" style={{ borderColor: 'rgba(59,130,246,0.3)', background: 'var(--accent-glow)' }}>
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 'var(--sp-4)', color: 'var(--text)' }}>
              {conflict.proposedResolution}
            </p>
            <div className="row gap-3">
              <button
                className="btn btn-primary"
                onClick={handleAccept}
                disabled={accepting}
              >
                {accepting ? (
                  <><span className="spinner" /> Applying fix…</>
                ) : (
                  'Accept resolution'
                )}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => navigate('/passport')}
              >
                Skip for now
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Post-resolution CTA ── */}
      {resolved && (
        <div
          className="fade-in card"
          style={{
            borderColor: 'var(--low-border)',
            background: 'var(--low-bg)',
            marginBottom: 'var(--sp-6)',
          }}
        >
          <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
            <span>✅</span>
            <h3 style={{ color: 'var(--pass)' }}>Resolution applied</h3>
          </div>
          <ul style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8, paddingLeft: 'var(--sp-5)' }}>
            <li>billing/permissions.ts updated: <code>role === "owner"</code></li>
            <li>New regression test added: <code>"admin cannot manage organization subscription"</code></li>
            <li>Test suite: 42 → 43 passing</li>
          </ul>
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/passport')}
            >
              View Change Passport →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeading({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
      <span>{icon}</span>
      <h3 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h3>
    </div>
  );
}

function AssumptionCard({ assumption, label, accent, accentBg }: {
  assumption: Assumption;
  label: string;
  accent: string;
  accentBg: string;
}) {
  return (
    <div className="card-sm" style={{ background: accentBg, borderColor: accent }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent, marginBottom: 'var(--sp-2)' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
        {assumption.statement}
      </div>
      <div className="stack gap-1">
        <MetaRow label="File" value={assumption.sourceFile} mono />
        <MetaRow label="Line" value={assumption.sourceLine} mono />
        <MetaRow label="Depends on" value={assumption.dependsOn} mono />
        <MetaRow label="Found by" value={assumption.producedBy} />
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row gap-2" style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--text-dim)', width: 70, flexShrink: 0 }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function CodePill({ file, value, color }: { file: string; value: string; color: string }) {
  return (
    <div className="stack gap-1" style={{ alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{file}</span>
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: 15,
        fontWeight: 700,
        color,
        background: 'var(--surface)',
        border: `1px solid ${color}`,
        padding: '4px 14px',
        borderRadius: 6,
      }}>
        role = {value}
      </span>
    </div>
  );
}
