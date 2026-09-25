import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_PASSPORT, DEMO_PASSPORT_RESOLVED } from '@/data/demoFixtures';
import { StatusBadge, SeverityBadge } from '@/components/StatusBadge';
import type { ChangePassport } from '@/types/semantic';

export function ChangePassportPage() {
  const navigate = useNavigate();
  // Show resolved passport if navigated from ConflictDetail with resolved flag,
  // otherwise show unresolved state for the default demo path.
  // In real usage, this would be driven by session state.
  const [showResolved, setShowResolved] = useState(false);
  const passport = showResolved ? DEMO_PASSPORT_RESOLVED : DEMO_PASSPORT;

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div className="row gap-4" style={{ marginBottom: 'var(--sp-6)', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="row gap-3" style={{ marginBottom: 'var(--sp-2)' }}>
            <h2>Change Passport</h2>
            <StatusBadge status={passport.status} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Permanent verification record. Future developers and AI agents can read this to understand
            what changed, why, and what must remain true.
          </p>
        </div>
        <div style={{ flexShrink: 0 }}>
          <button
            className={`btn ${showResolved ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setShowResolved((v) => !v)}
            style={{ fontSize: 12 }}
          >
            {showResolved ? 'Show unresolved state' : '→ Apply fix & regenerate'}
          </button>
        </div>
      </div>

      {/* ── Passport header card ── */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--sp-6)',
          borderColor: passport.status === 'PASS' ? 'var(--low-border)' : 'var(--high-border)',
          background: passport.status === 'PASS' ? 'var(--low-bg)' : 'var(--high-bg)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
          <div>
            <FieldRow label="Feature" value={passport.feature} />
            <FieldRow label="Intent" value={passport.intent} />
            <FieldRow label="Generated" value={formatDate(passport.generatedAt)} />
            <FieldRow label="Passport ID" value={passport.id} mono />
          </div>
          <div>
            <FieldRow label="Components" value={passport.components.join(', ')} />
            <FieldRow label="Files changed" value={String(passport.filesChanged)} />
            <FieldRow
              label="Verification"
              value={passport.status}
              valueColor={passport.status === 'PASS' ? 'var(--pass)' : 'var(--high)'}
            />
          </div>
        </div>
      </div>

      {/* ── Metrics grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--sp-4)',
        marginBottom: 'var(--sp-6)',
      }}>
        <MetricCard
          value={`${passport.assumptionsVerified}/${passport.assumptionsFound}`}
          label="Assumptions verified"
          ok={passport.assumptionsVerified === passport.assumptionsFound}
        />
        <MetricCard
          value={`${passport.conflictsResolved}/${passport.conflictsFound}`}
          label="Conflicts resolved"
          ok={passport.conflictsResolved === passport.conflictsFound}
        />
        <MetricCard
          value={`${passport.testsPassing}/${passport.testsTotal}`}
          label="Tests passing"
          ok={passport.testsPassing === passport.testsTotal}
        />
        <MetricCard
          value={`${passport.requirementCoverage}%`}
          label="Requirement coverage"
          ok={passport.requirementCoverage >= 90}
        />
      </div>

      {/* ── Remaining risk ── */}
      <section style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
          <h3 style={{ fontSize: 14 }}>Remaining Risk</h3>
        </div>
        <div className="card-sm" style={{
          borderColor: passport.status === 'FAIL' ? 'var(--high-border)' : 'var(--medium-border)',
          background:  passport.status === 'FAIL' ? 'var(--high-bg)'    : 'var(--medium-bg)',
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text)',
        }}>
          {passport.status === 'FAIL' ? '⚠️ ' : 'ℹ️ '}
          {passport.remainingRisk}
        </div>
      </section>

      {/* ── Conflicts section ── */}
      <section style={{ marginBottom: 'var(--sp-6)' }}>
        <h3 style={{ fontSize: 14, marginBottom: 'var(--sp-4)' }}>Semantic Conflicts</h3>
        <div className="stack gap-3">
          {passport.conflicts.map((c) => (
            <div
              key={c.id}
              className="card-sm"
              style={{
                borderColor: c.resolved ? 'var(--low-border)' : 'var(--high-border)',
                background:  c.resolved ? 'var(--low-bg)'    : 'var(--high-bg)',
              }}
            >
              <div className="row gap-3" style={{ marginBottom: 'var(--sp-2)' }}>
                <SeverityBadge severity={c.severity} />
                <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                  {c.kind.replace('_', ' ')}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12 }}>
                  {c.resolved
                    ? <span style={{ color: 'var(--pass)' }}>✓ Resolved</span>
                    : <span style={{ color: 'var(--high)', cursor: 'pointer' }}
                        onClick={() => navigate('/detail')}>
                        ✗ Unresolved — inspect →
                      </span>
                  }
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {c.affectedFiles.map((f) => <span key={f} className="tag" style={{ marginRight: 4 }}>{f}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Machine-readable block ── */}
      <section style={{ marginBottom: 'var(--sp-6)' }}>
        <h3 style={{ fontSize: 14, marginBottom: 'var(--sp-3)' }}>Machine-readable Record</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)' }}>
          Future AI agents can read this passport to understand what must remain true.
        </p>
        <PassportCodeBlock passport={passport} />
      </section>

      {/* ── Footer actions ── */}
      <div className="row gap-3" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>Start new analysis</button>
        <button className="btn btn-secondary" onClick={() => alert('Export: in production this creates a signed JSON artifact.')}>
          Export Passport
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({ label, value, mono, valueColor }: {
  label: string; value: string; mono?: boolean; valueColor?: string;
}) {
  return (
    <div className="row gap-2" style={{ marginBottom: 6, fontSize: 13, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--text-dim)', width: 110, flexShrink: 0 }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ color: valueColor ?? 'var(--text)', lineHeight: 1.4 }}>
        {value}
      </span>
    </div>
  );
}

function MetricCard({ value, label, ok }: { value: string; label: string; ok: boolean }) {
  return (
    <div className="card-sm stack gap-1" style={{ textAlign: 'center', padding: 'var(--sp-4) var(--sp-3)' }}>
      <div style={{
        fontSize: 26,
        fontWeight: 700,
        color: ok ? 'var(--pass)' : 'var(--high)',
        lineHeight: 1.2,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

function PassportCodeBlock({ passport }: { passport: ChangePassport }) {
  const lines = [
    `MERGEMIND CHANGE PASSPORT`,
    ``,
    `Feature:              ${passport.feature}`,
    `Intent:               ${passport.intent}`,
    `Files Changed:        ${passport.filesChanged}`,
    `Components:           ${passport.components.join(', ')}`,
    `Assumptions Found:    ${passport.assumptionsFound}`,
    `Verified:             ${passport.assumptionsVerified}`,
    `Conflicts Found:      ${passport.conflictsFound}`,
    `Resolved:             ${passport.conflictsResolved}`,
    `Tests:                ${passport.testsPassing} / ${passport.testsTotal}`,
    `Requirement Coverage: ${passport.requirementCoverage}%`,
    `Remaining Risk:       ${passport.remainingRisk}`,
    `Verification Status:  ${passport.status}`,
    `Passport ID:          ${passport.id}`,
    `Generated:            ${passport.generatedAt}`,
  ];

  return (
    <pre className="code-block" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
      {lines.join('\n')}
    </pre>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
