// ─────────────────────────────────────────────────────────────────────────────
// Passport Fixtures tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  PASSPORT_PASS,
  PASSPORT_FAIL,
  PASSPORT_PARTIAL,
  PASSPORT_VARIANTS,
  serializePassport,
} from '@/data/passportFixtures';
import type { ChangePassport } from '@/types/semantic';

// ── Fixture registry ──────────────────────────────────────────────────────────

describe('PASSPORT_VARIANTS registry', () => {
  it('contains exactly 3 variants', () => {
    expect(PASSPORT_VARIANTS).toHaveLength(3);
  });

  it('all variant ids are unique', () => {
    const ids = PASSPORT_VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all variant passport ids are unique', () => {
    const ids = PASSPORT_VARIANTS.map((v) => v.passport.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all three status values', () => {
    const statuses = PASSPORT_VARIANTS.map((v) => v.passport.status);
    expect(statuses).toContain('PASS');
    expect(statuses).toContain('FAIL');
    expect(statuses).toContain('PENDING');
  });

  it('each variant has a non-empty label and sublabel', () => {
    for (const v of PASSPORT_VARIANTS) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.sublabel.length).toBeGreaterThan(0);
    }
  });
});

// ── PASSPORT_PASS ─────────────────────────────────────────────────────────────

describe('PASSPORT_PASS', () => {
  it('has status PASS', () => {
    expect(PASSPORT_PASS.status).toBe('PASS');
  });

  it('has all conflicts resolved', () => {
    expect(PASSPORT_PASS.conflictsResolved).toBe(PASSPORT_PASS.conflictsFound);
    for (const c of PASSPORT_PASS.conflicts) {
      expect(c.resolved).toBe(true);
    }
  });

  it('tests passing equals total', () => {
    expect(PASSPORT_PASS.testsPassing).toBe(PASSPORT_PASS.testsTotal);
    expect(PASSPORT_PASS.testsPassing).toBe(43);
  });

  it('requirement coverage ≥ 90', () => {
    expect(PASSPORT_PASS.requirementCoverage).not.toBeNull();
    expect(PASSPORT_PASS.requirementCoverage!).toBeGreaterThanOrEqual(90);
  });

  it('has a remaining risk note (webhook)', () => {
    expect(PASSPORT_PASS.remainingRisk).not.toBeNull();
    expect(PASSPORT_PASS.remainingRisk!.toLowerCase()).toContain('webhook');
  });

  it('has sessionId', () => {
    expect(PASSPORT_PASS.sessionId).toBeTruthy();
  });

  it('has repository and branches', () => {
    expect(PASSPORT_PASS.repository).toBeTruthy();
    expect(PASSPORT_PASS.branches).toBeDefined();
    expect(PASSPORT_PASS.branches!.length).toBeGreaterThan(0);
  });

  it('all numeric metrics are non-null', () => {
    const p = PASSPORT_PASS;
    expect(p.filesChanged).not.toBeNull();
    expect(p.assumptionsFound).not.toBeNull();
    expect(p.assumptionsVerified).not.toBeNull();
    expect(p.conflictsFound).not.toBeNull();
    expect(p.conflictsResolved).not.toBeNull();
    expect(p.testsTotal).not.toBeNull();
    expect(p.testsPassing).not.toBeNull();
    expect(p.requirementCoverage).not.toBeNull();
  });
});

// ── PASSPORT_FAIL ─────────────────────────────────────────────────────────────

describe('PASSPORT_FAIL', () => {
  it('has status FAIL', () => {
    expect(PASSPORT_FAIL.status).toBe('FAIL');
  });

  it('has at least one unresolved conflict', () => {
    const unresolved = PASSPORT_FAIL.conflicts.filter((c) => !c.resolved);
    expect(unresolved.length).toBeGreaterThan(0);
  });

  it('conflictsResolved is less than conflictsFound', () => {
    expect(PASSPORT_FAIL.conflictsResolved).not.toBeNull();
    expect(PASSPORT_FAIL.conflictsFound).not.toBeNull();
    expect(PASSPORT_FAIL.conflictsResolved!).toBeLessThan(PASSPORT_FAIL.conflictsFound!);
  });

  it('has 42 tests all passing (but feature is still broken)', () => {
    expect(PASSPORT_FAIL.testsPassing).toBe(42);
    expect(PASSPORT_FAIL.testsTotal).toBe(42);
  });

  it('requirement coverage is less than PASS variant', () => {
    expect(PASSPORT_FAIL.requirementCoverage).not.toBeNull();
    expect(PASSPORT_PASS.requirementCoverage).not.toBeNull();
    expect(PASSPORT_FAIL.requirementCoverage!).toBeLessThan(PASSPORT_PASS.requirementCoverage!);
  });

  it('remaining risk mentions the unresolved conflict', () => {
    expect(PASSPORT_FAIL.remainingRisk).not.toBeNull();
    expect(PASSPORT_FAIL.remainingRisk!.toLowerCase()).toMatch(/billing|role|owner/);
  });

  it('shares the same feature as PASSPORT_PASS', () => {
    expect(PASSPORT_FAIL.feature).toBe(PASSPORT_PASS.feature);
  });
});

// ── PASSPORT_PARTIAL ──────────────────────────────────────────────────────────

describe('PASSPORT_PARTIAL', () => {
  it('has status PENDING', () => {
    expect(PASSPORT_PARTIAL.status).toBe('PENDING');
  });

  it('has null for all analysis metrics', () => {
    expect(PASSPORT_PARTIAL.assumptionsFound).toBeNull();
    expect(PASSPORT_PARTIAL.assumptionsVerified).toBeNull();
    expect(PASSPORT_PARTIAL.conflictsFound).toBeNull();
    expect(PASSPORT_PARTIAL.conflictsResolved).toBeNull();
    expect(PASSPORT_PARTIAL.requirementCoverage).toBeNull();
  });

  it('has null for test metrics', () => {
    expect(PASSPORT_PARTIAL.testsTotal).toBeNull();
    expect(PASSPORT_PARTIAL.testsPassing).toBeNull();
  });

  it('has null for filesChanged', () => {
    expect(PASSPORT_PARTIAL.filesChanged).toBeNull();
  });

  it('has no conflicts', () => {
    expect(PASSPORT_PARTIAL.conflicts).toHaveLength(0);
  });

  it('still has required string fields', () => {
    expect(PASSPORT_PARTIAL.feature.length).toBeGreaterThan(0);
    expect(PASSPORT_PARTIAL.intent.length).toBeGreaterThan(0);
    expect(PASSPORT_PARTIAL.id.length).toBeGreaterThan(0);
    expect(PASSPORT_PARTIAL.generatedAt.length).toBeGreaterThan(0);
  });
});

// ── serializePassport ─────────────────────────────────────────────────────────

describe('serializePassport', () => {
  it('returns valid JSON', () => {
    const json = serializePassport(PASSPORT_PASS);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes the schema field', () => {
    const obj = JSON.parse(serializePassport(PASSPORT_PASS));
    expect(obj.schema).toBe('mergemind/change-passport/v1');
  });

  it('round-trips all required fields', () => {
    const obj = JSON.parse(serializePassport(PASSPORT_PASS));
    const p: ChangePassport = PASSPORT_PASS;
    const r = obj.passport;
    expect(r.id).toBe(p.id);
    expect(r.feature).toBe(p.feature);
    expect(r.intent).toBe(p.intent);
    expect(r.status).toBe(p.status);
    expect(r.conflictsFound).toBe(p.conflictsFound);
    expect(r.conflictsResolved).toBe(p.conflictsResolved);
    expect(r.testsPassing).toBe(p.testsPassing);
    expect(r.testsTotal).toBe(p.testsTotal);
    expect(r.requirementCoverage).toBe(p.requirementCoverage);
  });

  it('serializes null metrics correctly for PARTIAL', () => {
    const obj = JSON.parse(serializePassport(PASSPORT_PARTIAL));
    const r = obj.passport;
    expect(r.assumptionsFound).toBeNull();
    expect(r.conflictsFound).toBeNull();
    expect(r.testsTotal).toBeNull();
    expect(r.requirementCoverage).toBeNull();
  });

  it('conflicts array contains only data fields (no React noise)', () => {
    const obj = JSON.parse(serializePassport(PASSPORT_PASS));
    for (const c of obj.passport.conflicts) {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('kind');
      expect(c).toHaveProperty('severity');
      expect(c).toHaveProperty('resolved');
      // evidenceExcerpts are NOT in the serialized output (too large for passport)
      expect(c).not.toHaveProperty('evidenceExcerpts');
    }
  });

  it('produces deterministic output for the same input', () => {
    const a = serializePassport(PASSPORT_FAIL);
    const b = serializePassport(PASSPORT_FAIL);
    expect(a).toBe(b);
  });

  it('produces different output for different passports', () => {
    const pass = serializePassport(PASSPORT_PASS);
    const fail = serializePassport(PASSPORT_FAIL);
    expect(pass).not.toBe(fail);
  });
});

// ── Cross-fixture invariants ───────────────────────────────────────────────────

describe('Cross-fixture invariants', () => {
  const all = [PASSPORT_PASS, PASSPORT_FAIL, PASSPORT_PARTIAL];

  it('all passports have ISO-8601 generatedAt', () => {
    for (const p of all) {
      expect(() => new Date(p.generatedAt).toISOString()).not.toThrow();
    }
  });

  it('all passports have non-empty feature and intent', () => {
    for (const p of all) {
      expect(p.feature.length).toBeGreaterThan(0);
      expect(p.intent.length).toBeGreaterThan(0);
    }
  });

  it('when conflictsResolved is non-null, it does not exceed conflictsFound', () => {
    for (const p of all) {
      if (p.conflictsResolved !== null && p.conflictsFound !== null) {
        expect(p.conflictsResolved).toBeLessThanOrEqual(p.conflictsFound);
      }
    }
  });

  it('when testsPassing is non-null, it does not exceed testsTotal', () => {
    for (const p of all) {
      if (p.testsPassing !== null && p.testsTotal !== null) {
        expect(p.testsPassing).toBeLessThanOrEqual(p.testsTotal);
      }
    }
  });

  it('resolved conflict count matches conflicts[].resolved count', () => {
    for (const p of all) {
      if (p.conflictsResolved !== null) {
        const resolvedCount = p.conflicts.filter((c) => c.resolved).length;
        expect(resolvedCount).toBe(p.conflictsResolved);
      }
    }
  });
});
