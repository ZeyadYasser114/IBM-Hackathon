import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PassportCard } from '@/components/PassportCard';
import {
  PASSPORT_VARIANTS,
  serializePassport,
  type PassportVariant,
} from '@/data/passportFixtures';
import type { ChangePassport } from '@/types/semantic';

// ─────────────────────────────────────────────────────────────────────────────
// ChangePassport page
//
// Shows the selected passport variant (PASS / FAIL / PARTIAL) through the
// reusable PassportCard component. Provides real JSON download export.
// ─────────────────────────────────────────────────────────────────────────────

export function ChangePassportPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // If navigated from ConflictDetail with resolved=true, default to PASS
  const fromResolved = (location.state as { resolved?: boolean } | null)?.resolved === true;
  const [variantIdx, setVariantIdx] = useState(fromResolved ? 0 : 1);

  const variant  = PASSPORT_VARIANTS[variantIdx]!;
  const passport = variant.passport;

  // ── JSON export ──────────────────────────────────────────────────────────
  const handleExport = () => {
    const json     = serializePassport(passport);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `mergemind-passport-${passport.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── Navigate to conflict detail ───────────────────────────────────────────
  const handleInspectConflict = (conflictId: string) => {
    navigate('/detail', { state: { conflictId, scenarioIdx: 0 } });
  };

  return (
    <div className="fade-in no-print-chrome" style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ══════════════════════════════════════════════════════════════
          PAGE HEADER (hidden in print)
      ══════════════════════════════════════════════════════════════ */}
      <div className="print-hide" style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--sp-6)',
        marginBottom: 'var(--sp-5)',
        flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Change Passport</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Permanent verification artifact. Serialisable so future developers and AI agents
            can read what changed, why, and what must remain true.
          </p>
        </div>
        <div className="row gap-2">
          <button className="btn btn-ghost" onClick={handlePrint} style={{ fontSize: 12 }}>
            🖨 Print
          </button>
          <button className="btn btn-secondary" onClick={handleExport} style={{ fontSize: 12 }}>
            ↓ Export JSON
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ fontSize: 12 }}>
            New analysis
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          VARIANT SELECTOR (hidden in print)
      ══════════════════════════════════════════════════════════════ */}
      <div className="print-hide" style={{ marginBottom: 'var(--sp-5)' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text-muted)',
          marginBottom: 'var(--sp-2)',
        }}>
          Demo variant
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          {PASSPORT_VARIANTS.map((v, idx) => (
            <VariantTab
              key={v.id}
              variant={v}
              isActive={idx === variantIdx}
              onClick={() => setVariantIdx(idx)}
            />
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          PASSPORT CARD
      ══════════════════════════════════════════════════════════════ */}
      <PassportCard
        passport={passport}
        onInspectConflict={handleInspectConflict}
      />

      {/* ══════════════════════════════════════════════════════════════
          JSON PREVIEW (print-hide, collapsible)
      ══════════════════════════════════════════════════════════════ */}
      <JsonPreview passport={passport} onExport={handleExport} />

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function VariantTab({
  variant, isActive, onClick,
}: {
  variant: PassportVariant;
  isActive: boolean;
  onClick: () => void;
}) {
  const p = variant.passport;
  const statusColor =
    p.status === 'PASS'    ? 'var(--pass)'       :
    p.status === 'FAIL'    ? 'var(--high)'        :
                             'var(--text-muted)';
  const borderColor =
    isActive && p.status === 'PASS'    ? 'var(--low-border)'    :
    isActive && p.status === 'FAIL'    ? 'var(--high-border)'   :
    isActive                           ? 'var(--border)'        :
                                         'var(--border-2)';

  return (
    <button
      onClick={onClick}
      style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            3,
        padding:        '9px 16px',
        background:     isActive ? 'var(--surface-2)' : 'var(--surface)',
        border:         `1px solid ${borderColor}`,
        borderRadius:   'var(--radius)',
        cursor:         'pointer',
        textAlign:      'left',
        transition:     'border-color 0.15s',
        minWidth:       150,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
        {variant.label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {variant.sublabel}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 700, color: statusColor,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {p.status}
      </span>
    </button>
  );
}

function JsonPreview({
  passport, onExport,
}: {
  passport: ChangePassport;
  onExport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const json = serializePassport(passport);

  return (
    <div className="print-hide" style={{ marginTop: 'var(--sp-6)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost"
        style={{ fontSize: 12, width: '100%', justifyContent: 'space-between' }}
      >
        <span>{ open ? '▾' : '▸' } Serialized JSON ({json.length.toLocaleString()} chars)</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          schema: mergemind/change-passport/v1
        </span>
      </button>

      {open && (
        <div className="fade-in" style={{ marginTop: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-2)' }}>
            <button className="btn btn-secondary" onClick={onExport} style={{ fontSize: 11 }}>
              ↓ Download .json
            </button>
          </div>
          <pre style={{
            background:   'var(--surface-2)',
            border:       '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding:      'var(--sp-4)',
            fontSize:     11.5,
            fontFamily:   'var(--mono)',
            color:        'var(--text)',
            lineHeight:   1.6,
            overflowX:    'auto',
            maxHeight:    400,
            whiteSpace:   'pre',
          }}>
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
