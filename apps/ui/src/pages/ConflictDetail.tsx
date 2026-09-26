import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ALL_SCENARIO_CONFLICTS } from '@/data/demoFixtures';
import { SeverityBadge } from '@/components/StatusBadge';
import type { Conflict, EvidenceExcerpt, Assumption } from '@/types/semantic';

// ─────────────────────────────────────────────────────────────────────────────
// ConflictDetail — full auditable evidence experience
//
// States handled:
//   1. No conflict selected        → empty-state prompt
//   2. High-confidence (≥85)       → evidence banner is green/confident
//   3. Lower-confidence (<85)      → amber warning banner + partial-evidence note
//   4. Multiple evidence excerpts  → all shown, missing-file path gracefully handled
// ─────────────────────────────────────────────────────────────────────────────

export function ConflictDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const state    = location.state as { conflictId?: string; scenarioIdx?: number } | null;

  // ── Resolve the conflict from the correct scenario ────────────────────────
  const scenarioIdx = state?.scenarioIdx ?? 0;
  const conflictId  = state?.conflictId;
  const allConflicts = ALL_SCENARIO_CONFLICTS[scenarioIdx] ?? ALL_SCENARIO_CONFLICTS[0]!;
  const conflict = conflictId
    ? allConflicts.find((c) => c.id === conflictId)
    : undefined;

  // ── Resolution state ───────────────────────────────────────────────────────
  const [resolved, setResolved] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    await new Promise((r) => setTimeout(r, 1400));
    setResolved(true);
    setAccepting(false);
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!conflict) {
    return (
      <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
        <BackButton onClick={() => navigate('/graph')} />
        <EmptyState onGoToGraph={() => navigate('/graph')} />
      </div>
    );
  }

  const isHighConfidence = conflict.confidence >= 85;
  const severityColor = conflict.severity === 'HIGH'
    ? 'var(--high)' : conflict.severity === 'MEDIUM'
    ? 'var(--medium)' : 'var(--low)';
  const severityBorder = conflict.severity === 'HIGH'
    ? 'var(--high-border)' : conflict.severity === 'MEDIUM'
    ? 'var(--medium-border)' : 'var(--low-border)';
  const severityBg = conflict.severity === 'HIGH'
    ? 'var(--high-bg)' : conflict.severity === 'MEDIUM'
    ? 'var(--medium-bg)' : 'var(--low-bg)';

  return (
    <div className="fade-in" style={{ maxWidth: 860, margin: '0 auto' }}>
      <BackButton onClick={() => navigate('/graph')} />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1 — Identity header
          Title · kind · severity · confidence · resolved badge
      ═══════════════════════════════════════════════════════════════ */}
      <div
        className="card"
        style={{ marginBottom: 'var(--sp-5)', borderColor: severityBorder, background: severityBg }}
      >
        {/* Badges row */}
        <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <SeverityBadge severity={conflict.severity} />
          <KindBadge kind={conflict.kind} />
          <ConfidenceBadge confidence={conflict.confidence} />
          {resolved && (
            <span className="badge badge-pass" style={{ marginLeft: 'auto' }}>✓ RESOLVED</span>
          )}
        </div>

        {/* Title */}
        <h2 style={{ marginBottom: 'var(--sp-3)', color: severityColor, lineHeight: 1.3 }}>
          {conflict.title}
        </h2>

        {/* Plain-language explanation */}
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.8 }}>
          {conflict.description}
        </p>

        {/* Lower-confidence warning */}
        {!isHighConfidence && (
          <div style={{
            marginTop: 'var(--sp-4)',
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'rgba(227,179,65,0.08)',
            border: '1px solid var(--medium-border)',
            borderRadius: 'var(--radius)',
            fontSize: 12,
            color: 'var(--medium)',
            lineHeight: 1.6,
          }}>
            <strong>⚡ Lower-confidence finding ({conflict.confidence}%)</strong> — The engine could
            not fully resolve all file paths. One evidence excerpt below is flagged as unresolved.
            Review the verification hint for manual inspection steps.
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2 — Requirement trace (why this conflict matters)
      ═══════════════════════════════════════════════════════════════ */}
      <Section icon="📌" title="Original requirement">
        <blockquote style={{
          margin: 0,
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--surface-2)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: '0 var(--radius) var(--radius) 0',
          fontSize: 14,
          color: 'var(--text)',
          fontStyle: 'italic',
          lineHeight: 1.6,
        }}>
          {conflict.requirementText}
        </blockquote>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3 — Affected contract
          What shared thing both sides disagree about
      ═══════════════════════════════════════════════════════════════ */}
      <Section icon="🔗" title="Affected contract">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          fontSize: 13,
        }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--medium)', fontWeight: 600 }}>
            {conflict.affectedContract.split(' (')[0]}
          </span>
          {conflict.affectedContract.includes('(') && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              ({conflict.affectedContract.split('(')[1]?.replace(')', '')})
            </span>
          )}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4 — Assumption clash
          Side-by-side cards + visual clash bar
      ═══════════════════════════════════════════════════════════════ */}
      <Section icon="⚡" title="Conflicting assumptions">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
          <AssumptionCard
            assumption={conflict.assumptionA}
            label="Change A"
            accent="#86efac"
            accentBg="rgba(63,185,80,0.07)"
          />
          <AssumptionCard
            assumption={conflict.assumptionB}
            label="Change B"
            accent={severityColor}
            accentBg={severityBg}
          />
        </div>

        {/* Visual clash bar */}
        <ClashBar conflict={conflict} />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 5 — Evidence excerpts
          Every excerpt is labelled with file, location, and source agent.
          Missing file path is handled gracefully.
      ═══════════════════════════════════════════════════════════════ */}
      <Section
        icon="🔬"
        title={`Evidence excerpts (${conflict.evidenceExcerpts.length})`}
        hint="Code and text that makes this finding auditable"
      >
        <div className="stack gap-3">
          {conflict.evidenceExcerpts.map((e, idx) => (
            <EvidenceCard key={idx} excerpt={e} index={idx} />
          ))}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 6 — Affected files
      ═══════════════════════════════════════════════════════════════ */}
      <Section icon="📁" title="Affected files">
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          {conflict.affectedFiles.map((f) => (
            <span key={f} className="tag" style={{ fontSize: 12, padding: '4px 10px' }}>
              {f}
            </span>
          ))}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 7 — Verification hint
      ═══════════════════════════════════════════════════════════════ */}
      <Section icon="🧭" title="What to inspect next">
        <div style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 'var(--sp-4)',
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.7,
        }}>
          {conflict.verificationHint}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 8 — Resolution
      ═══════════════════════════════════════════════════════════════ */}
      {!resolved && conflict.proposedResolution && (
        <Section icon="🤖" title="Bob-proposed resolution">
          <div className="card" style={{
            borderColor: 'rgba(59,130,246,0.3)',
            background: 'var(--accent-glow)',
          }}>
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 'var(--sp-4)', color: 'var(--text)' }}>
              {conflict.proposedResolution}
            </p>
            <div className="row gap-3">
              <button className="btn btn-primary" onClick={handleAccept} disabled={accepting}>
                {accepting ? <><span className="spinner" /> Applying fix…</> : 'Accept resolution'}
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('/passport')}>
                Skip for now
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* Post-resolution state */}
      {resolved && (
        <div className="fade-in card" style={{
          borderColor: 'var(--low-border)',
          background: 'var(--low-bg)',
          marginBottom: 'var(--sp-6)',
        }}>
          <div className="row gap-2" style={{ marginBottom: 'var(--sp-3)' }}>
            <span>✅</span>
            <h3 style={{ color: 'var(--pass)' }}>Resolution applied</h3>
          </div>
          <ResolutionSummary conflict={conflict} />
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <button className="btn btn-primary" onClick={() => navigate('/passport')}>
              View Change Passport →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ marginBottom: 'var(--sp-5)' }}>
      <button onClick={onClick} className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>
        ← Conflict Graph
      </button>
    </div>
  );
}

function EmptyState({ onGoToGraph }: { onGoToGraph: () => void }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: 'var(--sp-12) var(--sp-8)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{ fontSize: 40, marginBottom: 'var(--sp-4)' }}>◇</div>
      <h3 style={{ marginBottom: 'var(--sp-3)', color: 'var(--text-muted)' }}>
        No conflict selected
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 'var(--sp-6)', lineHeight: 1.6 }}>
        Select a conflict node in the graph or click a conflict row to<br />
        see the full evidence breakdown here.
      </p>
      <button className="btn btn-secondary" onClick={onGoToGraph}>
        ← Back to Conflict Graph
      </button>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  icon, title, hint, children,
}: {
  icon: string; title: string; hint?: string; children: React.ReactNode;
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

// ── Kind badge ─────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const label = kind.replace(/_/g, ' ');
  return (
    <span className="badge" style={{
      color: 'var(--text-muted)',
      borderColor: 'var(--border)',
      background: 'var(--surface-2)',
      fontFamily: 'var(--mono)',
    }}>
      {label}
    </span>
  );
}

// ── Confidence badge ───────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const isHigh = confidence >= 85;
  return (
    <span
      className="badge"
      style={{
        color:       isHigh ? 'var(--pass)'   : 'var(--medium)',
        background:  isHigh ? 'var(--low-bg)' : 'var(--medium-bg)',
        borderColor: isHigh ? 'var(--low-border)' : 'var(--medium-border)',
      }}
      title={`Confidence: ${confidence}% — ${isHigh ? 'all evidence resolved' : 'some evidence partially resolved'}`}
    >
      {isHigh ? '●' : '◐'} {confidence}% confidence
    </span>
  );
}

// ── Assumption card ────────────────────────────────────────────────────────────

function AssumptionCard({
  assumption, label, accent, accentBg,
}: {
  assumption: Assumption;
  label: string;
  accent: string;
  accentBg: string;
}) {
  const missingPath = !assumption.sourceFile || assumption.sourceFile === '—';
  return (
    <div className="card-sm" style={{ background: accentBg, borderColor: accent }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: accent, marginBottom: 'var(--sp-2)',
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
        {assumption.statement}
      </div>
      <div className="stack gap-1">
        <MetaRow
          label="File"
          value={missingPath ? '— (not resolved)' : assumption.sourceFile}
          mono
          dim={missingPath}
        />
        <MetaRow label="Line"       value={assumption.sourceLine} mono />
        <MetaRow label="Depends on" value={assumption.dependsOn}  mono />
        <MetaRow label="Found by"   value={assumption.producedBy} />
      </div>
    </div>
  );
}

function MetaRow({
  label, value, mono, dim,
}: {
  label: string; value: string; mono?: boolean; dim?: boolean;
}) {
  return (
    <div className="row gap-2" style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--text-dim)', width: 72, flexShrink: 0 }}>{label}</span>
      <span
        className={mono ? 'mono' : ''}
        style={{ color: dim ? 'var(--text-dim)' : 'var(--text)', wordBreak: 'break-all' }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Clash bar ─────────────────────────────────────────────────────────────────

function ClashBar({ conflict }: { conflict: Conflict }) {
  // Extract the key value from each assumption statement for a compact display
  const extract = (stmt: string) => {
    const m = stmt.match(/"([^"]+)"/);
    return m ? `"${m[1]}"` : stmt.split(' ').slice(-2).join(' ');
  };
  const valA = extract(conflict.assumptionA.statement);
  const valB = extract(conflict.assumptionB.statement);
  const fileA = conflict.assumptionA.sourceFile !== '—'
    ? conflict.assumptionA.sourceFile.split('/').pop()
    : '(unresolved)';
  const fileB = conflict.assumptionB.sourceFile !== '—'
    ? conflict.assumptionB.sourceFile.split('/').pop()
    : '(unresolved)';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--sp-5)',
      padding: 'var(--sp-4) var(--sp-6)',
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}>
      <ClashPill file={fileA!} value={valA} color="var(--low)" />
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}>
        <span style={{ fontSize: 22, color: 'var(--high)', fontWeight: 700, lineHeight: 1 }}>≠</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.08em' }}>
          conflict
        </span>
      </div>
      <ClashPill file={fileB!} value={valB} color="var(--high)" />
    </div>
  );
}

function ClashPill({ file, value, color }: { file: string; value: string; color: string }) {
  return (
    <div className="stack gap-1" style={{ alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{file}</span>
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: 14,
        fontWeight: 700,
        color,
        background: 'var(--surface)',
        border: `1px solid ${color}`,
        padding: '4px 14px',
        borderRadius: 6,
      }}>
        {value}
      </span>
    </div>
  );
}

// ── Evidence card ──────────────────────────────────────────────────────────────

function EvidenceCard({ excerpt, index }: { excerpt: EvidenceExcerpt; index: number }) {
  const missingFile = !excerpt.file;
  return (
    <div style={{
      border: `1px solid ${missingFile ? 'var(--medium-border)' : 'var(--border-2)'}`,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 12px',
        background: missingFile ? 'var(--medium-bg)' : 'var(--surface-2)',
        borderBottom: `1px solid ${missingFile ? 'var(--medium-border)' : 'var(--border-2)'}`,
        gap: 'var(--sp-3)',
        flexWrap: 'wrap',
      }}>
        <div className="row gap-2">
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>
            #{index + 1}
          </span>
          {missingFile ? (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--medium)', fontStyle: 'italic',
            }}>
              ⚠ file path not resolved
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {excerpt.file}
            </span>
          )}
          <span style={{
            fontSize: 11, color: 'var(--text-dim)',
            borderLeft: '1px solid var(--border)', paddingLeft: 8,
          }}>
            {excerpt.location}
          </span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          background: 'var(--surface)', padding: '1px 6px', borderRadius: 4,
          border: '1px solid var(--border-2)',
        }}>
          {excerpt.source}
        </span>
      </div>

      {/* Code snippet */}
      <pre style={{
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
      }}>
        {excerpt.snippet}
      </pre>
    </div>
  );
}

// ── Resolution summary ────────────────────────────────────────────────────────

function ResolutionSummary({ conflict }: { conflict: Conflict }) {
  if (conflict.kind === 'BUSINESS_RULE') {
    return (
      <ul style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8, paddingLeft: 'var(--sp-5)' }}>
        <li>billing/permissions.ts updated: <code>role === "owner"</code></li>
        <li>New regression test added: <code>"admin cannot manage organization subscription"</code></li>
        <li>Test suite: 42 → 43 passing</li>
      </ul>
    );
  }
  if (conflict.kind === 'CONTRACT') {
    return (
      <ul style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8, paddingLeft: 'var(--sp-5)' }}>
        <li>frontend/src/hooks/useUser.ts updated: <code>data.userId</code></li>
        <li>All 3 remaining <code>user_id</code> references in frontend updated</li>
        <li>Contract test added: field name round-trip assertion</li>
      </ul>
    );
  }
  return (
    <ul style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8, paddingLeft: 'var(--sp-5)' }}>
      <li>notification-service.ts: null-check added before email access</li>
      <li>New test: <code>"notification skipped gracefully for user without email"</code></li>
    </ul>
  );
}
