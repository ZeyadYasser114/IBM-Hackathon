import { runVerification, StubConflictDetector } from '../src/index.js';
import type { Assumption, FeatureRequirement, SemanticConflict } from '@mergemind/domain';

const REQUIREMENT: FeatureRequirement = {
  id: 'req-001',
  description: 'Only organization owners can manage subscriptions.',
  rules: ['Only organization owners can manage subscriptions'],
};

const ASSUMPTIONS: Assumption[] = [
  {
    id: 'a-001',
    branchName: 'feature/auth',
    sourceFile: 'src/auth/roles.ts',
    statement: "The privileged organization role is 'owner'",
    concept: 'privileged-role',
    value: "'owner'",
    sourceAgent: 'intent',
  },
  {
    id: 'a-002',
    branchName: 'feature/billing',
    sourceFile: 'src/billing/permissions.ts',
    statement: "The privileged organization role is 'admin'",
    concept: 'privileged-role',
    value: "'admin'",
    sourceAgent: 'contract',
  },
];

describe('StubConflictDetector', () => {
  it('returns an empty conflict array', () => {
    const detector = new StubConflictDetector();
    expect(detector.detect(ASSUMPTIONS, REQUIREMENT)).toHaveLength(0);
  });
});

describe('runVerification', () => {
  it('returns a valid VerificationResult shape', () => {
    const result = runVerification({
      requirementId: REQUIREMENT.id,
      requirement: REQUIREMENT,
      repositoryName: 'demo-repo',
      filesChanged: 2,
      assumptions: ASSUMPTIONS,
    });
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('assumptions');
    expect(result).toHaveProperty('conflicts');
  });

  it('status is PASS when no conflicts are found (stub)', () => {
    const result = runVerification({
      requirementId: REQUIREMENT.id,
      requirement: REQUIREMENT,
      repositoryName: 'demo-repo',
      filesChanged: 2,
      assumptions: ASSUMPTIONS,
    });
    expect(result.status).toBe('PASS');
  });

  it('status is FAIL when conflicts exist and none are resolved', () => {
    const mockConflict: SemanticConflict = {
      id: 'c-001',
      title: 'Role assumption mismatch',
      description: 'Auth uses owner, billing uses admin',
      severity: 'HIGH',
      conflictClass: 'business-rule',
      assumptionIds: ['a-001', 'a-002'],
      affectedFiles: ['src/auth/roles.ts', 'src/billing/permissions.ts'],
      proposedResolution: null,
    };
    const detector = {
      detect: (): SemanticConflict[] => [mockConflict],
    };
    const result = runVerification({
      requirementId: REQUIREMENT.id,
      requirement: REQUIREMENT,
      repositoryName: 'demo-repo',
      filesChanged: 2,
      assumptions: ASSUMPTIONS,
      detector,
    });
    expect(result.status).toBe('FAIL');
    expect(result.summary.conflictsFound).toBe(1);
    expect(result.summary.conflictsResolved).toBe(0);
  });

  it('populates summary counts correctly', () => {
    const result = runVerification({
      requirementId: REQUIREMENT.id,
      requirement: REQUIREMENT,
      repositoryName: 'demo-repo',
      filesChanged: 5,
      assumptions: ASSUMPTIONS,
    });
    expect(result.summary.assumptionsFound).toBe(2);
    expect(result.summary.filesChanged).toBe(5);
  });
});
