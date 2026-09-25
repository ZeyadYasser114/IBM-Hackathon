// ─────────────────────────────────────────────────────────────────────────────
// DemoLayout — wraps all /demo/* pages
// Adds bottom padding so content isn't hidden behind the DemoBar,
// and renders the DemoBar itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { DemoBar } from '@/components/DemoBar';

interface DemoLayoutProps {
  children: ReactNode;
}

export function DemoLayout({ children }: DemoLayoutProps) {
  return (
    <>
      <div style={{ paddingBottom: 68 }}>  {/* 52px bar + 16px gap */}
        {children}
      </div>
      <DemoBar />
    </>
  );
}
