/**
 * serialization.test.ts — JSON boundary tests for @mergemind/domain
 *
 * Proves that:
 *   1. Every major domain object survives a JSON round-trip
 *      (stringify → parse → deep-equal → re-validates against its schema).
 *      Domain objects cross process boundaries as JSON (API responses,
 *      fixture files, Change Passport artifacts), so lossy serialization
 *      would corrupt downstream consumers silently.
 *   2. The checked-in `fixtures/canonical-verification-result.json` snapshot
 *      is a valid VerificationResult and matches the documented demo shape.
 *
 * No network, no filesystem writes, no randomness — fully deterministic.
 */

import { readFileSync } from 'node:fs';

import {
  AssumptionSchema,
  ChangedFileSchema,
  CodeEvidenceSchema,
  ConflictFindingSchema,
  FeatureRequestSchema,
  RepositorySourceSchema,
  VerificationResultSchema,
} from './schemas/index.js';
import {
  makeAssumption,
  makeChangedFile,
  makeCodeEvidence,
  makeConflictFinding,
  makeFeatureRequest,
  makeRepositorySource,
  makeVerificationResult,
} from './testing/factories.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse `value` through JSON and assert the result deep-equals the original. */
function expectJsonRoundTrip(value: unknown): unknown {
  const revived: unknown = JSON.parse(JSON.stringify(value));
  expect(revived).toEqual(value);
  return revived;
}

// ===========================================================================
// Per-model JSON round-trips
// ===========================================================================

describe('JSON round-trip preserves domain objects', () => {
  it('FeatureRequest survives stringify → parse and re-validates', () => {
    const original = makeFeatureRequest();
    const revived = expectJsonRoundTrip(original);
    expect(FeatureRequestSchema.safeParse(revived).success).toBe(true);
  });

  it('RepositorySource survives stringify → parse and re-validates', () => {
    const original = makeRepositorySource();
    const revived = expectJsonRoundTrip(original);
    expect(RepositorySourceSchema.safeParse(revived).success).toBe(true);
  });

  it('ChangedFile survives stringify → parse and re-validates', () => {
    const original = makeChangedFile();
    const revived = expectJsonRoundTrip(original);
    expect(ChangedFileSchema.safeParse(revived).success).toBe(true);
  });

  it('ChangedFile with null patch (binary/deleted) survives the round-trip', () => {
    const original = makeChangedFile({ kind: 'DELETED', patch: null, language: null });
    const revived = expectJsonRoundTrip(original);
    expect(ChangedFileSchema.safeParse(revived).success).toBe(true);
  });

  it('CodeEvidence with null lines/snippet survives the round-trip', () => {
    const original = makeCodeEvidence({ lineStart: null, lineEnd: null, snippet: null });
    const revived = expectJsonRoundTrip(original);
    expect(CodeEvidenceSchema.safeParse(revived).success).toBe(true);
  });

  it('Assumption survives stringify → parse and re-validates', () => {
    const original = makeAssumption();
    const revived = expectJsonRoundTrip(original);
    expect(AssumptionSchema.safeParse(revived).success).toBe(true);
  });

  it('ConflictFinding survives stringify → parse and re-validates', () => {
    const original = makeConflictFinding();
    const revived = expectJsonRoundTrip(original);
    expect(ConflictFindingSchema.safeParse(revived).success).toBe(true);
  });

  it('VerificationResult survives stringify → parse and re-validates', () => {
    const original = makeVerificationResult();
    const revived = expectJsonRoundTrip(original);
    expect(VerificationResultSchema.safeParse(revived).success).toBe(true);
  });

  it('double serialization is stable (stringify is idempotent)', () => {
    const original = makeVerificationResult();
    const once = JSON.stringify(original);
    const twice = JSON.stringify(JSON.parse(once));
    expect(twice).toBe(once);
  });
});

// ===========================================================================
// Canonical snapshot fixture at the repo root
// ===========================================================================

describe('fixtures/canonical-verification-result.json', () => {
  const snapshotPath = new URL(
    '../../../fixtures/canonical-verification-result.json',
    import.meta.url,
  );
  const raw = readFileSync(snapshotPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  it('is valid JSON', () => {
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  it('validates against VerificationResultSchema', () => {
    const result = VerificationResultSchema.safeParse(parsed);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues, null, 2)).toBe('unreachable');
    }
    expect(result.success).toBe(true);
  });

  it('documents the owner-vs-admin demo conflict (FAIL, 1 HIGH conflict)', () => {
    const result = VerificationResultSchema.parse(parsed);
    expect(result.status).toBe('FAIL');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.severity).toBe('HIGH');
    expect(result.conflicts[0]?.category).toBe('BUSINESS_RULE');
  });

  it('references the two demo files as affected', () => {
    const result = VerificationResultSchema.parse(parsed);
    const affected = result.conflicts[0]?.affectedFiles ?? [];
    expect(affected).toContain('src/auth/roles.ts');
    expect(affected).toContain('src/billing/permissions.ts');
  });

  it('serializes deterministically (parse → stringify is stable)', () => {
    const once = JSON.stringify(parsed);
    const twice = JSON.stringify(JSON.parse(once));
    expect(twice).toBe(once);
  });
});
