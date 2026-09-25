/**
 * Screen 1 — Verify Change
 *
 * The landing page. Developer selects a repository, pastes a feature
 * requirement, and picks branches to verify.
 *
 * EXTENSION POINT
 * ---------------
 * - Replace the static fixture data with a live GitHub repo selector
 * - Add a branch picker that calls git-ingest to enumerate available branches
 * - Show real-time agent progress (Screen 2) after the form is submitted
 */
import { VerifyForm } from '@/components/VerifyForm';

export default function HomePage() {
  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <header style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Merge<span style={{ color: 'var(--color-accent)' }}>Mind</span>
        </h1>
        <p style={{ color: 'var(--color-muted)', marginTop: '0.5rem' }}>
          Semantic verification layer for parallel AI coding agents. Git tells you whether code can
          merge. MergeMind tells you whether the ideas can coexist.
        </p>
      </header>

      <VerifyForm />
    </main>
  );
}
