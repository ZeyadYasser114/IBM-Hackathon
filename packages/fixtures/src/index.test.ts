/**
 * index.test.ts — smoke tests for @mergemind/fixtures
 *
 * These tests verify that:
 *   1. Every exported scenario loads without error.
 *   2. Structural invariants hold (required fields, non-empty arrays, etc.).
 *   3. canonicalResult UUIDs are internally consistent.
 *   4. getScenario() resolves correctly.
 *
 * These are NOT detector tests — they never call conflict-detection logic.
 * They only assert the shape and internal consistency of the fixture data.
 */

import {
  allScenarios,
  getScenario,
  scenario01BusinessRule,
  scenario02ContractMismatch,
  scenario03DependencyAssumption,
} from './index.js';

describe('@mergemind/fixtures — structural invariants', () => {
  it('exports exactly three scenarios', () => {
    expect(allScenarios).toHaveLength(3);
  });

  it('scenario IDs are unique', () => {
    const ids = allScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
  });

  describe.each([
    ['scenario-01-business-rule', scenario01BusinessRule],
    ['scenario-02-contract-mismatch', scenario02ContractMismatch],
    ['scenario-03-dependency-assumption', scenario03DependencyAssumption],
  ] as const)('%s', (id, scenario) => {
    it('id matches filename slug', () => {
      expect(scenario.id).toBe(id);
    });

    it('has a non-empty originalRequirement', () => {
      expect(scenario.originalRequirement.length).toBeGreaterThan(20);
    });

    it('has at least one base file', () => {
      expect(scenario.baseFiles.length).toBeGreaterThanOrEqual(1);
    });

    it('has exactly two branches', () => {
      expect(scenario.branches).toHaveLength(2);
    });

    it('every branch has at least one changed file and a non-empty patch', () => {
      for (const branch of scenario.branches) {
        expect(branch.changedFiles.length).toBeGreaterThanOrEqual(1);
        expect(branch.patch.trim().length).toBeGreaterThan(0);
      }
    });

    it('expectedContradiction is at least 50 characters', () => {
      expect(scenario.expectedContradiction.length).toBeGreaterThan(50);
    });

    it('has at least two expectedAffectedFiles', () => {
      expect(scenario.expectedAffectedFiles.length).toBeGreaterThanOrEqual(2);
    });

    it('has at least two expectedAffectedComponents', () => {
      expect(scenario.expectedAffectedComponents.length).toBeGreaterThanOrEqual(2);
    });

    describe('canonicalResult', () => {
      const r = scenario.canonicalResult;

      it('status is FAIL', () => {
        expect(r.status).toBe('FAIL');
      });

      it('has at least two assumptions', () => {
        expect(r.assumptions.length).toBeGreaterThanOrEqual(2);
      });

      it('has exactly one conflict', () => {
        expect(r.conflicts).toHaveLength(1);
      });

      it('conflict category matches scenario conflictCategory', () => {
        expect(r.conflicts[0]!.category).toBe(scenario.conflictCategory);
      });

      it('all affectedAssumptionIds reference real assumption ids', () => {
        const assumptionIds = new Set(r.assumptions.map((a) => a.id));
        for (const conflict of r.conflicts) {
          for (const aid of conflict.affectedAssumptionIds) {
            expect(assumptionIds.has(aid)).toBe(true);
          }
        }
      });

      it('summary counts are self-consistent', () => {
        expect(r.summary.assumptionsFound).toBe(r.assumptions.length);
        expect(r.summary.conflictsFound).toBe(r.conflicts.length);
        expect(r.summary.conflictsResolved).toBe(0);
      });

      it('proposedResolution and resolvedAt are null', () => {
        for (const c of r.conflicts) {
          expect(c.proposedResolution).toBeNull();
          expect(c.resolvedAt).toBeNull();
        }
      });

      it('errorMessage is null', () => {
        expect(r.errorMessage).toBeNull();
      });
    });
  });

  describe('getScenario()', () => {
    it('returns scenario-01-business-rule', () => {
      expect(getScenario('scenario-01-business-rule')).toBe(scenario01BusinessRule);
    });

    it('returns scenario-02-contract-mismatch', () => {
      expect(getScenario('scenario-02-contract-mismatch')).toBe(scenario02ContractMismatch);
    });

    it('returns scenario-03-dependency-assumption', () => {
      expect(getScenario('scenario-03-dependency-assumption')).toBe(scenario03DependencyAssumption);
    });

    it('throws a controlled error for an unknown scenario id', () => {
      expect(() =>
        getScenario('scenario-99-does-not-exist' as 'scenario-01-business-rule'),
      ).toThrow(/unknown scenario id/);
    });

    it('is deterministic — repeated lookups return the same reference', () => {
      expect(getScenario('scenario-01-business-rule')).toBe(
        getScenario('scenario-01-business-rule'),
      );
    });
  });
});
