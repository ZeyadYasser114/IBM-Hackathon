import { runVerification, StubConflictDetector } from '../src/index.js';
import type {
  Assumption,
  ConflictFinding,
  FeatureRequest,
  RepositorySource,
} from '@mergemind/domain';

const FEATURE_REQUEST: FeatureRequest = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'Add organization billing',
  description: 'Only organization owners can manage subscriptions.',
  acceptanceCriteria: [
    { key: 'AC-1', description: 'Only organization owners can manage subscriptions.' },
  ],
  rules: ['Only organization owners can manage subscriptions'],
  tags: ['billing'],
  createdAt: '2024-08-01T12:00:00.000Z',
  submittedBy: 'alice@example.com',
};

const REPOSITORY_SOURCE: RepositorySource = {
  id: '223e4567-e89b-42d3-a456-426614174001',
  name: 'demo-repo',
  cloneUrl: 'https://github.com/acme/demo-repo',
  provider: 'github',
  baseBranch: { name: 'main', sha: 'a'.repeat(40) },
  featureBranches: [
    { name: 'feature/auth', sha: 'b'.repeat(40) },
    { name: 'feature/billing', sha: 'c'.repeat(40) },
  ],
  resolvedAt: '2024-08-01T12:00:00.000Z',
};

const ASSUMPTIONS: Assumption[] = [
  {
    id: '323e4567-e89b-42d3-a456-426614174002',
    branchName: 'feature/auth',
    sourceFile: 'src/auth/roles.ts',
    statement: "The privileged organization role is 'owner'",
    concept: 'privileged-role',
    value: "'owner'",
    sourceAgent: 'intent',
    evidence: [],
    confidence: 'LOW',
    numericConfidence: 0.4,
    relatedAssumptionIds: [],
    extractedAt: '2024-08-01T12:00:00.000Z',
  },
  {
    id: '423e4567-e89b-42d3-a456-426614174003',
    branchName: 'feature/billing',
    sourceFile: 'src/billing/permissions.ts',
    statement: "The privileged organization role is 'admin'",
    concept: 'privileged-role',
    value: "'admin'",
    sourceAgent: 'contract',
    evidence: [],
    confidence: 'LOW',
    numericConfidence: 0.4,
    relatedAssumptionIds: [],
    extractedAt: '2024-08-01T12:00:00.000Z',
  },
];

function makeInput() {
  return {
    featureRequest: FEATURE_REQUEST,
    repositorySource: REPOSITORY_SOURCE,
    filesChanged: 2,
    assumptions: ASSUMPTIONS,
  };
}

describe('StubConflictDetector', () => {
  it('returns an empty conflict array', () => {
    const detector = new StubConflictDetector();
    expect(detector.detect(ASSUMPTIONS, FEATURE_REQUEST)).toHaveLength(0);
  });
});

describe('runVerification', () => {
  it('returns a valid VerificationResult shape', () => {
    const result = runVerification(makeInput());
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('schemaVersion');
    expect(result).toHaveProperty('featureRequest');
    expect(result).toHaveProperty('repositorySource');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('assumptions');
    expect(result).toHaveProperty('conflicts');
    expect(result).toHaveProperty('errorMessage');
    expect(result.summary).toHaveProperty('conflictsBySeverity');
  });

  it('status is PASS when no conflicts are found (stub)', () => {
    const result = runVerification(makeInput());
    expect(result.status).toBe('PASS');
  });

  it('status is FAIL when conflicts exist and none are resolved', () => {
    const mockConflict: ConflictFinding = {
      id: '523e4567-e89b-42d3-a456-426614174004',
      title: 'Role assumption mismatch',
      description: 'Auth uses owner, billing uses admin',
      severity: 'HIGH',
      category: 'BUSINESS_RULE',
      affectedAssumptionIds: [ASSUMPTIONS[0]?.id ?? '', ASSUMPTIONS[1]?.id ?? ''],
      affectedFiles: ['src/auth/roles.ts', 'src/billing/permissions.ts'],
      conflictEvidence: [],
      proposedResolution: null,
      resolvedAt: null,
    };
    const detector = {
      detect: (): ConflictFinding[] => [mockConflict],
    };
    const result = runVerification({ ...makeInput(), detector });
    expect(result.status).toBe('FAIL');
    expect(result.summary.conflictsFound).toBe(1);
    expect(result.summary.conflictsResolved).toBe(0);
    expect(result.summary.conflictsBySeverity.HIGH).toBe(1);
  });

  it('populates summary counts correctly', () => {
    const result = runVerification({ ...makeInput(), filesChanged: 5 });
    expect(result.summary.assumptionsFound).toBe(2);
    expect(result.summary.filesChanged).toBe(5);
  });
});
