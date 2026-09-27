// ─────────────────────────────────────────────────────────────────────────────
// Demo: Conflict Detail
//
// Story beats 6 + 7:
//   Step 6 (detail)     — full evidence for the real conflict
//   Step 7 (resolution) — suggested resolution accepted (local MVP state)
//
// Live path renders the actual conflict from demo.liveSession. The suggested
// resolution is the engine's verificationHint — the source repository is NOT
// modified by accepting. Fixture fallback keeps the original offline story.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { SeverityBadge } from '@/components/StatusBadge';
import { useDemoMode } from '@/demo/demoContext';
import { SCENARIO_OWNER_ADMIN } from '@/graph/graphScenarios';
import { DEMO_SESSION } from '@/data/demoFixtures';
import type { EvidenceExcerpt, Assumption } from '@/types/semantic';

const FIXTURE_CONFLICT = SCENARIO_OWNER_ADMIN.conflicts[0]!;

export function DemoConflictDetail() {
  const demo = useDemoMode();
  const live = demo.liveSession && demo.sessionId !== DEMO_SESSION.id ? demo.liveSession : null;
  const conflict = live ? live.graph.conflicts[0] : FIXTURE_CONFLICT;
  const isFixture = !live;

  const [accepting, setAccepting] = useState(false);
  const [resolved, setResolved] = useState(demo.currentStep.id === 'resolution');

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

  if (!conflict) {
    return (
      <div className="fade-in" style={{ maxWidth: 860, margin: '0 auto' }}>
        <div
          className="card"
          style={{
            borderColor: 'var(--low-border)',
            background: 'var(--low-bg)',
            marginBottom: 'var(--sp-5)',
          }}
        >
          <h2 style={{ color: 'var(--pass)', marginBottom: 'var(--sp-3)' }}>
            No conflicts to inspect
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.8 }}>
            Live analysis found no semantic conflicts for this change set. Continue to the Change
            Passport for the verification record.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => demo.jumpTo('passport')}>
          View Change Passport →
        </button>
      </div>
    );
  }

  const severityColor = conflict.severity === 'HIGH' ? 'var(--high)' : 'var(--medium)';
  const severityBorder =
    conflict.severity === 'HIGH' ? 'var(--high-border)' : 'var(--medium-border)';
  const severityBg = conflict.severity === 'HIGH' ? 'var(--high-bg)' : 'var(--medium-bg)';
  const resolutionText = conflict.proposedResolution ?? conflict.verificationHint;

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
      <div
        className="card"
        style={{
          marginBottom: 'var(--sp-5)',
          borderColor: resolved ? 'var(--low-border)' : severityBorder,
          background: resolved ? 'var(--low-bg)' : severityBg,
        }}
      >
        <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <SeverityBadge severity={conflict.severity} />
          <span
            className="badge"
            style={{
              color: 'var(--text-muted)',
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              fontFamily: 'var(--mono)',
            }}
          >
            {conflict.kind.replace('_', ' ')}
          </span>
          <span
            className="badge"
            style={{
              color: 'var(--pass)',
              background: 'var(--low-bg)',
              borderColor: 'var(--low-border)',
            }}
          >
            ● {conflict.confidence}% confidence
          </span>
          {resolved && (
            <span className="badge badge-pass" style={{ marginLeft: 'auto' }}>
              ✓ RESOLVED
            </span>
          )}
        </div>
        <h2
          style={{
            marginBottom: 'var(--sp-3)',
            color: resolved ? 'var(--pass)' : severityColor,
            lineHeight: 1.3,
          }}
        >
          {conflict.title}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.8 }}>
          {conflict.description}
        </p>
      </div>

      {/* ── Requirement ── */}
      <DemoSection icon="📌" title="Original requirement">
        <blockquote
          style={{
            margin: 0,
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'var(--surface-2)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: '0 var(--radius) var(--radius) 0',
            fontSize: 14,
            color: 'var(--text)',
            fontStyle: 'italic',
            lineHeight: 1.6,
          }}
        >
          {conflict.requirementText}
        </blockquote>
      </DemoSection>

      {/* ── Affected contract ── */}
      <DemoSection icon="🔗" title="Affected contract">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-3)',
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
          }}
        >
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--medium)', fontWeight: 600 }}>
            {conflict.affectedContract}
          </span>
        </div>
      </DemoSection>

      {/* ── Assumption clash ── */}
      <DemoSection icon="⚡" title="Conflicting assumptions">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--sp-4)',
            marginBottom: 'var(--sp-4)',
          }}
        >
          <AsmCard
            assumption={conflict.assumptionA}
            label={`Change A · ${conflict.assumptionA.producedBy}`}
            accent="#6fdc8c"
            accentBg="rgba(66,190,101,0.07)"
          />
          <AsmCard
            assumption={conflict.assumptionB}
            label={`Change B · ${conflict.assumptionB.producedBy}`}
            accent="var(--high)"
            accentBg="var(--high-bg)"
          />
        </div>
        {/* Affected files */}
        {conflict.affectedFiles.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--sp-3)',
              padding: 'var(--sp-4)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              flexWrap: 'wrap',
            }}
          >
            {conflict.affectedFiles.map((f) => (
              <span key={f} className="tag mono" style={{ fontSize: 12 }}>
                {f}
              </span>
            ))}
          </div>
        )}
      </DemoSection>

      {/* ── Evidence ── */}
      <DemoSection
        icon="🔬"
        title={`Evidence excerpts (${conflict.evidenceExcerpts.length})`}
        hint="Code that makes this finding auditable"
      >
        <div className="stack gap-3">
          {conflict.evidenceExcerpts.map((e, idx) => (
            <EvidCard key={idx} excerpt={e} index={idx} />
          ))}
        </div>
      </DemoSection>

      {/* ── Resolution ── */}
      {!resolved && (
        <DemoSection
          icon="🤖"
          title={isFixture ? 'Bob-proposed resolution' : 'Suggested resolution'}
          hint={isFixture ? undefined : 'From the engine verification hint — advisory only'}
        >
          <div
            className="card"
            style={{
              borderColor: 'rgba(69,137,255,0.3)',
              background: 'var(--accent-glow)',
            }}
          >
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                marginBottom: 'var(--sp-4)',
                color: 'var(--text)',
              }}
            >
              {resolutionText}
            </p>
            {!isFixture && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>
                Accepting records the resolution locally. The source repository is not modified.
              </p>
            )}
            <div className="row gap-3">
              <button
                className="btn btn-primary"
                onClick={handleAccept}
                disabled={accepting}
                style={{ fontSize: 14, padding: '10px 20px' }}
              >
                {accepting ? (
                  <>
                    <span className="spinner" /> Applying fix…
                  </>
                ) : (
                  '✓ Accept resolution'
                )}
              </button>
            </div>
          </div>
        </DemoSection>
      )}

      {/* ── Post-resolution ── */}
      {resolved && (
        <div
          className="fade-in card"
          style={{
            borderColor: 'var(--low-border)',
            background: 'var(--low-bg)',
            marginBottom: 'var(--sp-5)',
          }}
        >
          <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
            <span>✅</span>
            <h3 style={{ color: 'var(--pass)' }}>Resolution accepted</h3>
          </div>
          {isFixture ? (
            <ul
              style={{
                fontSize: 13,
                color: 'var(--text)',
                lineHeight: 1.8,
                paddingLeft: 'var(--sp-5)',
                marginBottom: 'var(--sp-4)',
              }}
            >
              <li>
                <code>billing/permissions.ts</code> line 32: <code>role === &quot;owner&quot;</code>
              </li>
              <li>
                New test: <code>&quot;admin cannot manage organization subscription&quot;</code>
              </li>
              <li style={{ color: 'var(--pass)', fontWeight: 600 }}>
                Test suite: 42 → <strong>43 passing</strong>
              </li>
            </ul>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 'var(--sp-4)' }}>
              Recorded locally for this session. The source repository was not modified — apply the
              suggested change in your own branch.
            </p>
          )}
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

function DemoSection({
  icon,
  title,
  hint,
  children,
}: {
  icon: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 'var(--sp-5)' }}>
      <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
        <span>{icon}</span>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h3>
        {hint && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function AsmCard({
  assumption,
  label,
  accent,
  accentBg,
}: {
  assumption: Assumption;
  label: string;
  accent: string;
  accentBg: string;
}) {
  return (
    <div className="card-sm" style={{ background: accentBg, borderColor: accent }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: accent,
          marginBottom: 'var(--sp-2)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
        {assumption.statement}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        <span className="mono">{assumption.sourceFile}</span> line {assumption.sourceLine}
      </div>
    </div>
  );
}

function EvidCard({ excerpt, index }: { excerpt: EvidenceExcerpt; index: number }) {
  const missingFile = !excerpt.file;
  return (
    <div
      style={{
        border: `1px solid ${missingFile ? 'var(--medium-border)' : 'var(--border-2)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: missingFile ? 'var(--medium-bg)' : 'var(--surface-2)',
          borderBottom: `1px solid ${missingFile ? 'var(--medium-border)' : 'var(--border-2)'}`,
          gap: 'var(--sp-3)',
          flexWrap: 'wrap',
        }}
      >
        <div className="row gap-2">
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>
            #{index + 1}
          </span>
          {missingFile ? (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--medium)',
                fontStyle: 'italic',
              }}
            >
              ⚠ file path not resolved
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {excerpt.file}
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              borderLeft: '1px solid var(--border)',
              paddingLeft: 8,
            }}
          >
            {excerpt.location}
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: 'var(--surface)',
            padding: '1px 6px',
            borderRadius: 4,
            border: '1px solid var(--border-2)',
          }}
        >
          {excerpt.source}
        </span>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--surface)',
          fontSize: 12,
          fontFamily: 'var(--mono)',
          color: 'var(--text)',
          lineHeight: 1.65,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {excerpt.snippet}
      </pre>
    </div>
  );
}
