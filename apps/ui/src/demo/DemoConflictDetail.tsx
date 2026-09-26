// ─────────────────────────────────────────────────────────────────────────────
// Demo: Conflict Detail
//
// Story beats 6 + 7:
//   Step 6 (detail)     — full evidence displayed for s1-conf
//   Step 7 (resolution) — Bob resolution accepted, animated to resolved state
//
// "Accept resolution" button advances to step 7 (resolution) then after the
// simulated fix completes, advances to step 8 (tests / passport).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { SeverityBadge } from '@/components/StatusBadge';
import { useDemoMode } from '@/demo/demoContext';
import { SCENARIO_OWNER_ADMIN } from '@/graph/graphScenarios';
import type { EvidenceExcerpt, Assumption } from '@/types/semantic';

const CONFLICT = SCENARIO_OWNER_ADMIN.conflicts[0]!;

export function DemoConflictDetail() {
  const demo = useDemoMode();
  const [accepting, setAccepting] = useState(false);
  const [resolved, setResolved]   = useState(demo.currentStep.id === 'resolution');

  // If we land on this page already at step 7 (e.g. via DemoBar), show resolved
  useEffect(() => {
    if (demo.currentStep.id === 'resolution') setResolved(true);
  }, [demo.currentStep.id]);

  const handleAccept = async () => {
    setAccepting(true);
    demo.advance(); // detail → resolution (same route)
    await new Promise((r) => setTimeout(r, 1400));
    setResolved(true);
    setAccepting(false);
  };

  const handleViewPassport = () => {
    demo.advance(); // resolution → tests/passport
  };

  const severityColor  = 'var(--high)';
  const severityBorder = 'var(--high-border)';
  const severityBg     = 'var(--high-bg)';

  return (
    <div className="fade-in" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <button
          onClick={() => demo.jumpTo('highlight')}
          className="btn btn-ghost"
          style={{ padding: '5px 12px', fontSize: 12 }}
        >
          ← Conflict Graph
        </button>
      </div>

      {/* ── Identity header ── */}
      <div className="card" style={{
        marginBottom: 'var(--sp-5)',
        borderColor: resolved ? 'var(--low-border)' : severityBorder,
        background:  resolved ? 'var(--low-bg)'    : severityBg,
      }}>
        <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <SeverityBadge severity={CONFLICT.severity} />
          <span className="badge" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)',
            background: 'var(--surface-2)', fontFamily: 'var(--mono)' }}>
            BUSINESS RULE
          </span>
          <span className="badge" style={{
            color: 'var(--pass)', background: 'var(--low-bg)', borderColor: 'var(--low-border)',
          }}>
            ● 97% confidence
          </span>
          {resolved && (
            <span className="badge badge-pass" style={{ marginLeft: 'auto' }}>✓ RESOLVED</span>
          )}
        </div>
        <h2 style={{
          marginBottom: 'var(--sp-3)',
          color: resolved ? 'var(--pass)' : severityColor,
          lineHeight: 1.3,
        }}>
          {CONFLICT.title}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.8 }}>
          {CONFLICT.description}
        </p>
      </div>

      {/* ── Requirement ── */}
      <DemoSection icon="📌" title="Original requirement">
        <blockquote style={{
          margin: 0, padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--surface-2)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: '0 var(--radius) var(--radius) 0',
          fontSize: 14, color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.6,
        }}>
          {CONFLICT.requirementText}
        </blockquote>
      </DemoSection>

      {/* ── Affected contract ── */}
      <DemoSection icon="🔗" title="Affected contract">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
          padding: 'var(--sp-3) var(--sp-4)', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13,
        }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--medium)', fontWeight: 600 }}>
            User.role
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            the string value that gates subscription management
          </span>
        </div>
      </DemoSection>

      {/* ── Assumption clash ── */}
      <DemoSection icon="⚡" title="Conflicting assumptions">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
          <AsmCard assumption={CONFLICT.assumptionA} label="Authentication change"
            accent="#86efac" accentBg="rgba(63,185,80,0.07)" />
          <AsmCard assumption={CONFLICT.assumptionB} label="Billing change"
            accent="var(--high)" accentBg="var(--high-bg)" />
        </div>
        {/* Visual clash */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 'var(--sp-5)', padding: 'var(--sp-4) var(--sp-6)',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          <ClashPill file="auth/roles.ts"           value='"owner"' color="var(--low)" />
          <div style={{ fontSize: 24, color: 'var(--high)', fontWeight: 700 }}>≠</div>
          <ClashPill file="billing/permissions.ts"  value='"admin"' color="var(--high)" />
        </div>
      </DemoSection>

      {/* ── Evidence ── */}
      <DemoSection
        icon="🔬"
        title={`Evidence excerpts (${CONFLICT.evidenceExcerpts.length})`}
        hint="Code that makes this finding auditable"
      >
        <div className="stack gap-3">
          {CONFLICT.evidenceExcerpts.map((e, idx) => (
            <EvidCard key={idx} excerpt={e} index={idx} />
          ))}
        </div>
      </DemoSection>

      {/* ── Resolution ── */}
      {!resolved && (
        <DemoSection icon="🤖" title="Bob-proposed resolution">
          <div className="card" style={{
            borderColor: 'rgba(59,130,246,0.3)', background: 'var(--accent-glow)',
          }}>
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 'var(--sp-4)',
              color: 'var(--text)' }}>
              {CONFLICT.proposedResolution}
            </p>
            <div className="row gap-3">
              <button
                className="btn btn-primary"
                onClick={handleAccept}
                disabled={accepting}
                style={{ fontSize: 14, padding: '10px 20px' }}
              >
                {accepting
                  ? <><span className="spinner" /> Applying fix…</>
                  : '✓ Accept resolution'}
              </button>
            </div>
          </div>
        </DemoSection>
      )}

      {/* ── Post-resolution ── */}
      {resolved && (
        <div className="fade-in card" style={{
          borderColor: 'var(--low-border)', background: 'var(--low-bg)',
          marginBottom: 'var(--sp-5)',
        }}>
          <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
            <span>✅</span>
            <h3 style={{ color: 'var(--pass)' }}>Resolution applied</h3>
          </div>
          <ul style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8,
            paddingLeft: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
            <li><code>billing/permissions.ts</code> line 32: <code>role === "owner"</code></li>
            <li>New test: <code>"admin cannot manage organization subscription"</code></li>
            <li style={{ color: 'var(--pass)', fontWeight: 600 }}>
              Test suite: 42 → <strong>43 passing</strong>
            </li>
          </ul>
          <button
            className="btn btn-primary"
            onClick={handleViewPassport}
            style={{ fontSize: 14, padding: '10px 20px' }}
          >
            View Change Passport →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DemoSection({ icon, title, hint, children }: {
  icon: string; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 'var(--sp-5)' }}>
      <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
        <span>{icon}</span>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h3>
        {hint && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function AsmCard({ assumption, label, accent, accentBg }: {
  assumption: Assumption; label: string; accent: string; accentBg: string;
}) {
  return (
    <div className="card-sm" style={{ background: accentBg, borderColor: accent }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: accent, marginBottom: 'var(--sp-2)' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
        {assumption.statement}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        <span className="mono">{assumption.sourceFile}</span>
        {' '} line {assumption.sourceLine}
      </div>
    </div>
  );
}

function ClashPill({ file, value, color }: { file: string; value: string; color: string }) {
  return (
    <div className="stack gap-1" style={{ alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
        {file.split('/').pop()}
      </span>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color,
        background: 'var(--surface)', border: `1px solid ${color}`,
        padding: '4px 14px', borderRadius: 6,
      }}>
        {value}
      </span>
    </div>
  );
}

function EvidCard({ excerpt, index }: { excerpt: EvidenceExcerpt; index: number }) {
  const missingFile = !excerpt.file;
  return (
    <div style={{
      border: `1px solid ${missingFile ? 'var(--medium-border)' : 'var(--border-2)'}`,
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px',
        background: missingFile ? 'var(--medium-bg)' : 'var(--surface-2)',
        borderBottom: `1px solid ${missingFile ? 'var(--medium-border)' : 'var(--border-2)'}`,
        gap: 'var(--sp-3)', flexWrap: 'wrap',
      }}>
        <div className="row gap-2">
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>#{index + 1}</span>
          {missingFile ? (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--medium)', fontStyle: 'italic' }}>
              ⚠ file path not resolved
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {excerpt.file}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-dim)',
            borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
            {excerpt.location}
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          background: 'var(--surface)', padding: '1px 6px', borderRadius: 4,
          border: '1px solid var(--border-2)' }}>
          {excerpt.source}
        </span>
      </div>
      <pre style={{
        margin: 0, padding: 'var(--sp-3) var(--sp-4)', background: 'var(--surface)',
        fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text)',
        lineHeight: 1.65, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {excerpt.snippet}
      </pre>
    </div>
  );
}
