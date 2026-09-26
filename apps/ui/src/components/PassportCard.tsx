// ─────────────────────────────────────────────────────────────────────────────
// PassportCard — reusable Change Passport display component
//
// Designed to be:
//   • Scannable in under 10 seconds (large verdict stamp, metric grid at top)
//   • Print/export-friendly (no interactive elements inside the card itself)
//   • Null-safe — every nullable metric shows a clear "Not measured" state
//   • Self-contained — receives only a ChangePassport prop, no hooks/routing
// ─────────────────────────────────────────────────────────────────────────────

import type { ChangePassport, Conflict } from '@/types/semantic';
import { SeverityBadge } from '@/components/StatusBadge';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface PassportCardProps {
  passport: ChangePassport;
  /** Called when user clicks an unresolved conflict — navigate to detail */
  onInspectConflict?: (conflictId: string) => void;
}

export function PassportCard({ passport, onInspectConflict }: PassportCardProps) {
  const isPass    = passport.status === 'PASS';
  const isFail    = passport.status === 'FAIL';
  const borderColor = isPass ? 'var(--low-border)'  : isFail ? 'var(--high-border)' : 'var(--border)';
  const headerBg    = isPass ? 'var(--low-bg)'       : isFail ? 'var(--high-bg)'     : 'var(--surface-2)';
  const statusColor = isPass ? 'var(--pass)'         : isFail ? 'var(--high)'        : 'var(--text-muted)';

  return (
    <div
      className="passport-card"
      style={{
        border:       `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-lg)',
        overflow:     'hidden',
        background:   'var(--surface)',
      }}
    >
      {/* ══════════════════════════════════════════════════════════════
          TOP BAND — verdict stamp + identity
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        background: headerBg,
        borderBottom: `1px solid ${borderColor}`,
        padding: 'var(--sp-5) var(--sp-6)',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 'var(--sp-6)',
      }}>
        {/* Left: identity */}
        <div>
          <div className="row gap-2" style={{ marginBottom: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: 'var(--text-dim)',
              border: '1px solid var(--border)', borderRadius: 3,
              padding: '1px 6px', background: 'var(--surface)',
            }}>
              MergeMind Change Passport
            </span>
            {passport.sessionId && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                {passport.sessionId}
              </span>
            )}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, lineHeight: 1.2 }}>
            {passport.feature}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {passport.intent}
          </p>
        </div>

        {/* Right: large verdict stamp */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <VerdictStamp status={passport.status} color={statusColor} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          METRIC GRID — 6 numbers at a glance
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        borderBottom: '1px solid var(--border)',
      }}>
        <MetricCell
          value={passport.filesChanged}
          label="Files changed"
          format="number"
        />
        <MetricCell
          value={formatFraction(passport.assumptionsVerified, passport.assumptionsFound)}
          label="Assumptions verified"
          ok={passport.assumptionsVerified !== null &&
              passport.assumptionsFound    !== null &&
              passport.assumptionsVerified === passport.assumptionsFound}
        />
        <MetricCell
          value={formatFraction(passport.conflictsResolved, passport.conflictsFound)}
          label="Conflicts resolved"
          ok={passport.conflictsFound      !== null &&
              passport.conflictsResolved   !== null &&
              passport.conflictsResolved   === passport.conflictsFound}
          warn={passport.conflictsFound    !== null &&
                passport.conflictsResolved !== null &&
                passport.conflictsResolved < passport.conflictsFound}
        />
        <MetricCell
          value={formatFraction(passport.testsPassing, passport.testsTotal)}
          label="Tests passing"
          ok={passport.testsPassing !== null &&
              passport.testsTotal   !== null &&
              passport.testsPassing === passport.testsTotal}
        />
        <MetricCell
          value={passport.requirementCoverage !== null
            ? `${passport.requirementCoverage}%`
            : null}
          label="Req. coverage"
          ok={passport.requirementCoverage !== null && passport.requirementCoverage >= 90}
        />
        <MetricCell
          value={formatDate(passport.generatedAt)}
          label="Generated"
          format="date"
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          IDENTITY FIELDS
      ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        <FieldBlock>
          <FieldRow label="Passport ID"   value={passport.id}                           mono />
          <FieldRow label="Repository"    value={passport.repository ?? '—'}             mono />
          <FieldRow label="Branches"      value={passport.branches?.join(', ') ?? '—'}  mono />
          <FieldRow label="Components"    value={passport.components.length > 0 ? passport.components.join(', ') : '—'} />
        </FieldBlock>
        <FieldBlock borderLeft>
          <FieldRow label="Files changed" value={passport.filesChanged !== null ? String(passport.filesChanged) : '—'} />
          <FieldRow label="Assumptions"
            value={passport.assumptionsFound !== null
              ? `${passport.assumptionsVerified ?? '?'} / ${passport.assumptionsFound} verified`
              : '—'} />
          <FieldRow label="Conflicts"
            value={passport.conflictsFound !== null
              ? `${passport.conflictsResolved ?? '?'} / ${passport.conflictsFound} resolved`
              : '—'}
            valueColor={
              passport.conflictsFound !== null && passport.conflictsResolved !== null &&
              passport.conflictsResolved < passport.conflictsFound
                ? 'var(--high)' : undefined
            } />
          <FieldRow label="Tests"
            value={passport.testsTotal !== null
              ? `${passport.testsPassing ?? '?'} / ${passport.testsTotal} passing`
              : '—'} />
        </FieldBlock>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          CONFLICTS
      ══════════════════════════════════════════════════════════════ */}
      {passport.conflicts.length > 0 && (
        <div style={{ padding: 'var(--sp-4) var(--sp-6)', borderBottom: '1px solid var(--border)' }}>
          <SectionLabel>Semantic conflicts</SectionLabel>
          <div className="stack gap-2" style={{ marginTop: 'var(--sp-3)' }}>
            {passport.conflicts.map((c) => (
              <ConflictRow
                key={c.id}
                conflict={c}
                onInspect={onInspectConflict}
              />
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          REMAINING RISK
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ padding: 'var(--sp-4) var(--sp-6)', borderBottom: '1px solid var(--border)' }}>
        <SectionLabel>Remaining risk</SectionLabel>
        <RiskBanner passport={passport} />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MACHINE-READABLE TEXT BLOCK (print-friendly)
      ══════════════════════════════════════════════════════════════ */}
      <PassportTextBlock passport={passport} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ── Verdict stamp ─────────────────────────────────────────────────────────────

function VerdictStamp({ status, color }: { status: string; color: string }) {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '…';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{
        width: 64, height: 64,
        borderRadius: '50%',
        border: `2.5px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        fontWeight: 700,
        color,
        background: status === 'PASS'
          ? 'rgba(63,185,80,0.08)'
          : status === 'FAIL'
          ? 'rgba(248,81,73,0.08)'
          : 'rgba(99,110,123,0.08)',
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, color,
        textTransform: 'uppercase', letterSpacing: '0.12em',
      }}>
        {status}
      </span>
    </div>
  );
}

// ── Metric cell ───────────────────────────────────────────────────────────────

function MetricCell({
  value, label, ok, warn, format,
}: {
  value: string | number | null;
  label: string;
  ok?: boolean;
  warn?: boolean;
  format?: 'number' | 'date';
}) {
  const isNull = value === null || value === undefined;
  const color = ok ? 'var(--pass)' : warn ? 'var(--high)' : isNull ? 'var(--text-dim)' : 'var(--text)';
  const displayVal = isNull ? '—' : String(value);
  const isCompact = displayVal.length > 6;

  return (
    <div style={{
      padding: 'var(--sp-4) var(--sp-3)',
      textAlign: 'center',
      borderRight: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: isCompact ? 14 : 22,
        fontWeight: 700,
        color,
        lineHeight: 1.2,
        marginBottom: 4,
        fontFamily: format === 'date' ? 'var(--font)' : undefined,
        whiteSpace: 'nowrap',
      }}>
        {displayVal}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
    </div>
  );
}

// ── Field block + row ─────────────────────────────────────────────────────────

function FieldBlock({ children, borderLeft }: { children: React.ReactNode; borderLeft?: boolean }) {
  return (
    <div style={{
      padding: 'var(--sp-4) var(--sp-6)',
      borderLeft: borderLeft ? '1px solid var(--border)' : undefined,
    }}>
      {children}
    </div>
  );
}

function FieldRow({ label, value, mono, valueColor }: {
  label: string; value: string; mono?: boolean; valueColor?: string;
}) {
  return (
    <div className="row gap-2" style={{ marginBottom: 5, fontSize: 12, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--text-dim)', width: 100, flexShrink: 0 }}>{label}</span>
      <span
        className={mono ? 'mono' : ''}
        style={{ color: valueColor ?? (value === '—' ? 'var(--text-dim)' : 'var(--text)'),
          lineHeight: 1.4, wordBreak: 'break-all' }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: 'var(--text-dim)',
      marginBottom: 'var(--sp-1)',
    }}>
      {children}
    </div>
  );
}

// ── Conflict row ──────────────────────────────────────────────────────────────

function ConflictRow({
  conflict, onInspect,
}: {
  conflict: Conflict;
  onInspect?: (id: string) => void;
}) {
  const borderColor = conflict.resolved ? 'var(--low-border)'  : 'var(--high-border)';
  const bgColor     = conflict.resolved ? 'var(--low-bg)'      : 'var(--high-bg)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      alignItems: 'center',
      gap: 'var(--sp-3)',
      padding: '8px 12px',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius)',
      background: bgColor,
    }}>
      <SeverityBadge severity={conflict.severity} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{conflict.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
          {conflict.affectedFiles.map((f) => (
            <span key={f} className="tag" style={{ marginRight: 4 }}>{f}</span>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11, flexShrink: 0 }}>
        {conflict.resolved ? (
          <span style={{ color: 'var(--pass)', fontWeight: 600 }}>✓ Resolved</span>
        ) : (
          <button
            onClick={() => onInspect?.(conflict.id)}
            style={{
              background: 'none', border: 'none', cursor: onInspect ? 'pointer' : 'default',
              color: 'var(--high)', fontWeight: 600, fontSize: 11, padding: 0,
            }}
          >
            ✗ Unresolved{onInspect ? ' — inspect →' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Risk banner ───────────────────────────────────────────────────────────────

function RiskBanner({ passport }: { passport: ChangePassport }) {
  if (!passport.remainingRisk) {
    return (
      <div style={{
        marginTop: 'var(--sp-2)', fontSize: 12,
        color: 'var(--text-dim)', fontStyle: 'italic',
      }}>
        No remaining risks identified.
      </div>
    );
  }

  const isHigh = passport.status === 'FAIL';
  return (
    <div style={{
      marginTop: 'var(--sp-2)',
      padding: 'var(--sp-3) var(--sp-4)',
      background: isHigh ? 'var(--high-bg)' : 'var(--medium-bg)',
      border: `1px solid ${isHigh ? 'var(--high-border)' : 'var(--medium-border)'}`,
      borderRadius: 'var(--radius)',
      fontSize: 13,
      color: 'var(--text)',
      lineHeight: 1.6,
    }}>
      {isHigh ? '⚠ ' : 'ℹ '}
      {passport.remainingRisk}
    </div>
  );
}

// ── Machine-readable text block ───────────────────────────────────────────────

function PassportTextBlock({ passport }: { passport: ChangePassport }) {
  const fmt = (v: number | null | undefined): string => v !== null && v !== undefined ? String(v) : '—';
  const lines = [
    'MERGEMIND CHANGE PASSPORT',
    '',
    `Feature:              ${passport.feature}`,
    `Intent:               ${passport.intent}`,
    `Repository:           ${passport.repository ?? '—'}`,
    `Branches:             ${passport.branches?.join(', ') ?? '—'}`,
    `Files Changed:        ${fmt(passport.filesChanged)}`,
    `Components:           ${passport.components.join(', ') || '—'}`,
    '',
    `Assumptions Found:    ${fmt(passport.assumptionsFound)}`,
    `Verified:             ${fmt(passport.assumptionsVerified)}`,
    `Conflicts Found:      ${fmt(passport.conflictsFound)}`,
    `Resolved:             ${fmt(passport.conflictsResolved)}`,
    `Tests:                ${fmt(passport.testsPassing)} / ${fmt(passport.testsTotal)}`,
    `Req. Coverage:        ${passport.requirementCoverage !== null ? `${passport.requirementCoverage}%` : '—'}`,
    '',
    `Remaining Risk:       ${passport.remainingRisk ?? 'None identified'}`,
    `Verification Status:  ${passport.status}`,
    '',
    `Passport ID:          ${passport.id}`,
    `Session ID:           ${passport.sessionId ?? '—'}`,
    `Generated:            ${passport.generatedAt}`,
  ];

  return (
    <div style={{ padding: 'var(--sp-4) var(--sp-6)' }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 'var(--sp-2)',
      }}>
        Machine-readable record
      </div>
      <pre style={{
        margin: 0,
        background: 'var(--surface-2)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--radius)',
        padding: 'var(--sp-4)',
        fontSize: 11.5,
        fontFamily: 'var(--mono)',
        color: 'var(--text)',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowX: 'auto',
      }}>
        {lines.join('\n')}
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatFraction(numerator: number | null, denominator: number | null): string | null {
  if (numerator === null || denominator === null) return null;
  return `${numerator}/${denominator}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}
