import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const STEPS = [
  { path: '/',          label: 'Verify',   short: '1' },
  { path: '/analysis',  label: 'Analysis', short: '2' },
  { path: '/graph',     label: 'Conflicts',short: '3' },
  { path: '/detail',    label: 'Detail',   short: '4' },
  { path: '/passport',  label: 'Passport', short: '5' },
] as const;

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();
  const currentIdx = STEPS.findIndex((s) => s.path === pathname);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ── */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 var(--sp-8)',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark />
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            MergeMind
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent-glow)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 4,
            padding: '1px 6px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginLeft: 4,
          }}>Beta</span>
        </Link>

        {/* Step breadcrumb */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {STEPS.map((step, idx) => {
            const isDone    = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <div key={step.path} style={{ display: 'flex', alignItems: 'center' }}>
                {idx > 0 && (
                  <svg width="16" height="16" viewBox="0 0 16 16" style={{ color: 'var(--border)', margin: '0 2px' }}>
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                <span style={{
                  fontSize: 12,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isDone ? 'var(--pass)' : isCurrent ? 'var(--text)' : 'var(--text-dim)',
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: isCurrent ? 'var(--surface-2)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}>
                  {isDone && <CheckIcon />}
                  {step.label}
                </span>
              </div>
            );
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', color: 'var(--text-muted)', fontSize: 12 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--pass)' }}/>
          Demo mode
        </div>
      </header>

      {/* ── Page content ── */}
      <main style={{ flex: 1, padding: 'var(--sp-8) var(--sp-8)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {children}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: 'var(--sp-4) var(--sp-8)',
        display: 'flex',
        justifyContent: 'center',
        color: 'var(--text-dim)',
        fontSize: 12,
        gap: 'var(--sp-2)',
      }}>
        <span>MergeMind</span>
        <span>·</span>
        <span>IBM TechXchange Hackathon 2024</span>
        <span>·</span>
        <span>Powered by IBM Bob</span>
      </footer>
    </div>
  );
}

// ── Inline SVG icons ───────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <rect width="26" height="26" rx="6" fill="var(--accent)" opacity="0.15"/>
      <path d="M7 13 L13 7 L19 13 L13 19 Z" stroke="var(--accent)" strokeWidth="1.8" fill="none"/>
      <circle cx="13" cy="13" r="2.5" fill="var(--accent)"/>
      <line x1="13" y1="7" x2="13" y2="10.5" stroke="var(--high)" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="19" y1="13" x2="15.5" y2="13" stroke="var(--high)" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="var(--pass)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

