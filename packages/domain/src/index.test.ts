/**
 * index.test.ts — @mergemind/domain schema tests
 *
 * Proves that:
 *   1. Valid examples are accepted by every Zod schema.
 *   2. Malformed / invalid data is rejected with meaningful errors.
 *   3. Cross-field refinements (e.g. lineEnd >= lineStart) are enforced.
 *
 * These are contract tests, not unit tests.  They guard the boundary between
 * serialized artifacts and in-memory domain objects.
 */

import {
  CodeEvidenceSchema,
  FeatureRequestSchema,
  BranchRefSchema,
  RepositorySourceSchema,
  ChangedFileSchema,
  AssumptionSchema,
  DependencyReferenceSchema,
  ConflictFindingSchema,
  VerificationSummarySchema,
  VerificationResultSchema,
  ChangePassportDraftSchema,
} from '../src/schemas/index.js';

// ---------------------------------------------------------------------------
// Fixtures — canonical minimal valid objects
// ---------------------------------------------------------------------------

const VALID_ID = '123e4567-e89b-42d3-a456-426614174000';
const VALID_ID_2 = '223e4567-e89b-42d3-a456-426614174001';
const VALID_ID_3 = '323e4567-e89b-42d3-a456-426614174002';
const VALID_DATE = '2024-08-01T12:00:00.000Z';
const VALID_SHA = 'a'.repeat(40);
const VALID_SHA_2 = 'b'.repeat(40);

const VALID_EVIDENCE = {
  source: 'SOURCE_CODE' as const,
  filePath: 'src/auth/roles.ts',
  lineStart: 42,
  lineEnd: 44,
  snippet: "if (role === 'owner') {",
  branchName: 'feature/auth',
  metadata: {},
};

const VALID_FEATURE_REQUEST = {
  id: VALID_ID,
  title: 'Add organization billing',
  description: 'Only organization owners can manage subscriptions.',
  acceptanceCriteria: [{ key: 'AC-1', description: 'Only owners can cancel.' }],
  rules: ['Only organization owners can manage subscriptions.'],
  tags: ['billing', 'permissions'],
  createdAt: VALID_DATE,
  submittedBy: 'alice@example.com',
};

const VALID_BRANCH_REF = { name: 'feature/auth', sha: VALID_SHA };
const VALID_BASE_BRANCH = { name: 'main', sha: VALID_SHA_2 };

const VALID_REPO_SOURCE = {
  id: VALID_ID_2,
  name: 'acme/platform',
  cloneUrl: 'https://github.com/acme/platform',
  provider: 'github',
  baseBranch: VALID_BASE_BRANCH,
  featureBranches: [VALID_BRANCH_REF],
  resolvedAt: VALID_DATE,
};

const VALID_ASSUMPTION = {
  id: VALID_ID,
  branchName: 'feature/auth',
  sourceFile: 'src/auth/roles.ts',
  statement: "The privileged organization role is 'owner'",
  concept: 'privileged-role',
  value: "'owner'",
  sourceAgent: 'intent' as const,
  evidence: [VALID_EVIDENCE],
  confidence: 'HIGH' as const,
  numericConfidence: 0.95,
  relatedAssumptionIds: [],
  extractedAt: VALID_DATE,
};

const VALID_CONFLICT = {
  id: VALID_ID,
  title: 'Privileged role mismatch',
  description: 'feature/auth uses owner, feature/billing uses admin.',
  severity: 'HIGH' as const,
  category: 'BUSINESS_RULE' as const,
  affectedAssumptionIds: [VALID_ID],
  affectedFiles: ['src/auth/roles.ts', 'src/billing/permissions.ts'],
  conflictEvidence: [VALID_EVIDENCE],
  proposedResolution: null,
  resolvedAt: null,
};

const VALID_SUMMARY = {
  assumptionsFound: 2,
  conflictsFound: 1,
  conflictsResolved: 0,
  filesChanged: 3,
  requirementCoverage: 80,
  conflictsBySeverity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 },
};

const VALID_VERIFICATION_RESULT = {
  id: VALID_ID,
  schemaVersion: '1.0.0',
  featureRequest: VALID_FEATURE_REQUEST,
  repositorySource: VALID_REPO_SOURCE,
  status: 'FAIL' as const,
  startedAt: VALID_DATE,
  completedAt: VALID_DATE,
  assumptions: [VALID_ASSUMPTION],
  conflicts: [VALID_CONFLICT],
  summary: VALID_SUMMARY,
  errorMessage: null,
};

const VALID_PASSPORT_DRAFT = {
  id: VALID_ID_3,
  schemaVersion: '1.0.0',
  verificationResultId: VALID_ID,
  title: 'Add organization billing — v1',
  intentSummary: 'Adds org billing; owners manage subscriptions.',
  changedFiles: ['src/auth/roles.ts'],
  remainingRisks: [
    {
      key: 'R-1',
      description: 'Privileged role mismatch not yet resolved.',
      severity: 'HIGH' as const,
      sourceConflictId: VALID_ID,
    },
  ],
  notableDecisions: ['Decided to unify on the "owner" role.'],
  verificationResult: VALID_VERIFICATION_RESULT,
  generatedAt: VALID_DATE,
  approvedBy: null,
  approvedAt: null,
};

// ===========================================================================
// CodeEvidence
// ===========================================================================

describe('CodeEvidenceSchema', () => {
  it('accepts a valid SOURCE_CODE evidence', () => {
    expect(CodeEvidenceSchema.safeParse(VALID_EVIDENCE).success).toBe(true);
  });

  it('accepts INFERRED evidence with null lines and snippet', () => {
    const inferred = {
      ...VALID_EVIDENCE,
      source: 'INFERRED',
      lineStart: null,
      lineEnd: null,
      snippet: null,
      metadata: { model: 'claude-3-7-sonnet' },
    };
    expect(CodeEvidenceSchema.safeParse(inferred).success).toBe(true);
  });

  it('accepts FILE_CHANGE as a valid source', () => {
    const fc = { ...VALID_EVIDENCE, source: 'FILE_CHANGE' };
    expect(CodeEvidenceSchema.safeParse(fc).success).toBe(true);
  });

  it('rejects unknown source value', () => {
    const bad = { ...VALID_EVIDENCE, source: 'MAGIC' };
    expect(CodeEvidenceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects lineEnd < lineStart', () => {
    const bad = { ...VALID_EVIDENCE, lineStart: 10, lineEnd: 5 };
    expect(CodeEvidenceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects lineEnd set when lineStart is null', () => {
    const bad = { ...VALID_EVIDENCE, lineStart: null, lineEnd: 5 };
    expect(CodeEvidenceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty filePath', () => {
    const bad = { ...VALID_EVIDENCE, filePath: '' };
    expect(CodeEvidenceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-string values in metadata', () => {
    const bad = { ...VALID_EVIDENCE, metadata: { key: 42 } };
    expect(CodeEvidenceSchema.safeParse(bad).success).toBe(false);
  });
});

// ===========================================================================
// FeatureRequest
// ===========================================================================

describe('FeatureRequestSchema', () => {
  it('accepts a complete valid request', () => {
    expect(FeatureRequestSchema.safeParse(VALID_FEATURE_REQUEST).success).toBe(true);
  });

  it('accepts empty arrays for optional lists', () => {
    const minimal = { ...VALID_FEATURE_REQUEST, acceptanceCriteria: [], rules: [], tags: [] };
    expect(FeatureRequestSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects non-UUID id', () => {
    const bad = { ...VALID_FEATURE_REQUEST, id: 'not-a-uuid' };
    expect(FeatureRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty title', () => {
    const bad = { ...VALID_FEATURE_REQUEST, title: '' };
    expect(FeatureRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid ISO date', () => {
    const bad = { ...VALID_FEATURE_REQUEST, createdAt: '2024-08-01' };
    expect(FeatureRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing submittedBy', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { submittedBy: _, ...bad } = VALID_FEATURE_REQUEST;
    expect(FeatureRequestSchema.safeParse(bad).success).toBe(false);
  });
});

// ===========================================================================
// BranchRef
// ===========================================================================

describe('BranchRefSchema', () => {
  it('accepts a valid branch ref', () => {
    expect(BranchRefSchema.safeParse(VALID_BRANCH_REF).success).toBe(true);
  });

  it('rejects a SHA that is not 40 hex chars', () => {
    expect(BranchRefSchema.safeParse({ name: 'main', sha: 'abc123' }).success).toBe(false);
  });

  it('rejects uppercase hex SHA', () => {
    expect(BranchRefSchema.safeParse({ name: 'main', sha: 'A'.repeat(40) }).success).toBe(false);
  });

  it('rejects empty branch name', () => {
    expect(BranchRefSchema.safeParse({ name: '', sha: VALID_SHA }).success).toBe(false);
  });
});

// ===========================================================================
// RepositorySource
// ===========================================================================

describe('RepositorySourceSchema', () => {
  it('accepts a valid repository source', () => {
    expect(RepositorySourceSchema.safeParse(VALID_REPO_SOURCE).success).toBe(true);
  });

  it('rejects empty featureBranches array', () => {
    const bad = { ...VALID_REPO_SOURCE, featureBranches: [] };
    expect(RepositorySourceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing cloneUrl', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { cloneUrl: _, ...bad } = VALID_REPO_SOURCE;
    expect(RepositorySourceSchema.safeParse(bad).success).toBe(false);
  });
});

// ===========================================================================
// ChangedFile
// ===========================================================================

describe('ChangedFileSchema', () => {
  it('accepts a MODIFIED file', () => {
    const f = {
      path: 'src/auth/roles.ts',
      kind: 'MODIFIED',
      patch: '@@ -1 +1 @@ ...',
      additions: 3,
      deletions: 1,
      branchName: 'feature/auth',
      language: 'typescript',
    };
    expect(ChangedFileSchema.safeParse(f).success).toBe(true);
  });

  it('accepts a RENAMED file with previousPath', () => {
    const f = {
      path: 'src/auth/guards.ts',
      kind: 'RENAMED',
      previousPath: 'src/auth/middleware.ts',
      patch: null,
      additions: 0,
      deletions: 0,
      branchName: 'feature/auth',
      language: 'typescript',
    };
    expect(ChangedFileSchema.safeParse(f).success).toBe(true);
  });

  it('rejects RENAMED file without previousPath', () => {
    const bad = {
      path: 'src/auth/guards.ts',
      kind: 'RENAMED',
      patch: null,
      additions: 0,
      deletions: 0,
      branchName: 'feature/auth',
      language: null,
    };
    expect(ChangedFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown kind', () => {
    const bad = {
      path: 'src/auth/roles.ts',
      kind: 'COPIED',
      patch: null,
      additions: 0,
      deletions: 0,
      branchName: 'feature/auth',
      language: null,
    };
    expect(ChangedFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative additions', () => {
    const f = {
      path: 'src/auth/roles.ts',
      kind: 'MODIFIED',
      patch: null,
      additions: -1,
      deletions: 0,
      branchName: 'feature/auth',
      language: null,
    };
    expect(ChangedFileSchema.safeParse(f).success).toBe(false);
  });
});

// ===========================================================================
// Assumption
// ===========================================================================

describe('AssumptionSchema', () => {
  it('accepts a fully populated assumption', () => {
    expect(AssumptionSchema.safeParse(VALID_ASSUMPTION).success).toBe(true);
  });

  it('accepts an assumption with zero evidence (valid but degrades confidence)', () => {
    const a = { ...VALID_ASSUMPTION, evidence: [] };
    expect(AssumptionSchema.safeParse(a).success).toBe(true);
  });

  it('rejects a concept that is not kebab-case', () => {
    const bad = { ...VALID_ASSUMPTION, concept: 'Privileged Role' };
    expect(AssumptionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects numericConfidence outside 0–1', () => {
    const bad = { ...VALID_ASSUMPTION, numericConfidence: 1.5 };
    expect(AssumptionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an invalid AgentType', () => {
    const bad = { ...VALID_ASSUMPTION, sourceAgent: 'wizard' };
    expect(AssumptionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an invalid ConfidenceLevel', () => {
    const bad = { ...VALID_ASSUMPTION, confidence: 'VERY_HIGH' };
    expect(AssumptionSchema.safeParse(bad).success).toBe(false);
  });
});

// ===========================================================================
// DependencyReference
// ===========================================================================

describe('DependencyReferenceSchema', () => {
  const VALID_DEP = {
    id: VALID_ID,
    from: {
      filePath: 'src/billing/service.ts',
      symbolName: 'checkBillingAccess',
      branchName: 'feature/billing',
    },
    to: { filePath: 'src/auth/roles.ts', symbolName: 'checkRole', branchName: 'feature/auth' },
    kind: 'FUNCTION_CALL',
    isCrossModule: false,
    description: 'billing calls auth to verify owner role',
  };

  it('accepts a valid dependency reference', () => {
    expect(DependencyReferenceSchema.safeParse(VALID_DEP).success).toBe(true);
  });

  it('accepts null symbolName (module-level reference)', () => {
    const d = { ...VALID_DEP, from: { ...VALID_DEP.from, symbolName: null } };
    expect(DependencyReferenceSchema.safeParse(d).success).toBe(true);
  });

  it('accepts null description', () => {
    const d = { ...VALID_DEP, description: null };
    expect(DependencyReferenceSchema.safeParse(d).success).toBe(true);
  });

  it('rejects an unknown DependencyKind', () => {
    const bad = { ...VALID_DEP, kind: 'MAGIC_LINK' };
    expect(DependencyReferenceSchema.safeParse(bad).success).toBe(false);
  });
});

// ===========================================================================
// ConflictFinding
// ===========================================================================

describe('ConflictFindingSchema', () => {
  it('accepts a valid unresolved conflict', () => {
    expect(ConflictFindingSchema.safeParse(VALID_CONFLICT).success).toBe(true);
  });

  it('accepts a resolved conflict with proposedResolution and resolvedAt set', () => {
    const resolved = {
      ...VALID_CONFLICT,
      proposedResolution: 'Unify both branches on role === owner.',
      resolvedAt: VALID_DATE,
    };
    expect(ConflictFindingSchema.safeParse(resolved).success).toBe(true);
  });

  it('rejects resolvedAt set when proposedResolution is null', () => {
    const bad = { ...VALID_CONFLICT, proposedResolution: null, resolvedAt: VALID_DATE };
    expect(ConflictFindingSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty affectedAssumptionIds', () => {
    const bad = { ...VALID_CONFLICT, affectedAssumptionIds: [] };
    expect(ConflictFindingSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown ConflictCategory', () => {
    const bad = { ...VALID_CONFLICT, category: 'STYLE' };
    expect(ConflictFindingSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown ConflictSeverity', () => {
    const bad = { ...VALID_CONFLICT, severity: 'FATAL' };
    expect(ConflictFindingSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts all new ConflictCategory values', () => {
    for (const category of ['LOGIC', 'SECURITY', 'CONFIGURATION'] as const) {
      const c = { ...VALID_CONFLICT, category };
      expect(ConflictFindingSchema.safeParse(c).success).toBe(true);
    }
  });
});

// ===========================================================================
// VerificationSummary
// ===========================================================================

describe('VerificationSummarySchema', () => {
  it('accepts a valid summary', () => {
    expect(VerificationSummarySchema.safeParse(VALID_SUMMARY).success).toBe(true);
  });

  it('accepts null requirementCoverage', () => {
    const s = { ...VALID_SUMMARY, requirementCoverage: null };
    expect(VerificationSummarySchema.safeParse(s).success).toBe(true);
  });

  it('rejects conflictsResolved > conflictsFound', () => {
    const bad = { ...VALID_SUMMARY, conflictsFound: 1, conflictsResolved: 2 };
    expect(VerificationSummarySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects requirementCoverage > 100', () => {
    const bad = { ...VALID_SUMMARY, requirementCoverage: 101 };
    expect(VerificationSummarySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative counts', () => {
    const bad = { ...VALID_SUMMARY, assumptionsFound: -1 };
    expect(VerificationSummarySchema.safeParse(bad).success).toBe(false);
  });
});

// ===========================================================================
// VerificationResult
// ===========================================================================

describe('VerificationResultSchema', () => {
  it('accepts a complete FAIL result', () => {
    expect(VerificationResultSchema.safeParse(VALID_VERIFICATION_RESULT).success).toBe(true);
  });

  it('accepts a PASS result with no conflicts', () => {
    const pass = {
      ...VALID_VERIFICATION_RESULT,
      status: 'PASS',
      conflicts: [],
      summary: { ...VALID_SUMMARY, conflictsFound: 0 },
    };
    expect(VerificationResultSchema.safeParse(pass).success).toBe(true);
  });

  it('accepts a PENDING result with null completedAt', () => {
    const pending = {
      ...VALID_VERIFICATION_RESULT,
      status: 'PENDING',
      completedAt: null,
      conflicts: [],
      assumptions: [],
      summary: { ...VALID_SUMMARY, conflictsFound: 0, assumptionsFound: 0 },
    };
    expect(VerificationResultSchema.safeParse(pending).success).toBe(true);
  });

  it('rejects PENDING result with completedAt set', () => {
    const bad = {
      ...VALID_VERIFICATION_RESULT,
      status: 'PENDING',
      completedAt: VALID_DATE,
    };
    expect(VerificationResultSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects ERROR result with null errorMessage', () => {
    const bad = {
      ...VALID_VERIFICATION_RESULT,
      status: 'ERROR',
      errorMessage: null,
    };
    expect(VerificationResultSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts ERROR result with errorMessage set', () => {
    const ok = {
      ...VALID_VERIFICATION_RESULT,
      status: 'ERROR',
      completedAt: VALID_DATE,
      errorMessage: 'Git clone timed out after 30s',
    };
    expect(VerificationResultSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects invalid schemaVersion', () => {
    const bad = { ...VALID_VERIFICATION_RESULT, schemaVersion: 'v1' };
    expect(VerificationResultSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown VerificationStatus', () => {
    const bad = { ...VALID_VERIFICATION_RESULT, status: 'UNKNOWN' };
    expect(VerificationResultSchema.safeParse(bad).success).toBe(false);
  });
});

// ===========================================================================
// ChangePassportDraft
// ===========================================================================

describe('ChangePassportDraftSchema', () => {
  it('accepts a valid unapproved draft', () => {
    expect(ChangePassportDraftSchema.safeParse(VALID_PASSPORT_DRAFT).success).toBe(true);
  });

  it('accepts a fully approved draft', () => {
    const approved = {
      ...VALID_PASSPORT_DRAFT,
      approvedBy: 'bob@example.com',
      approvedAt: VALID_DATE,
    };
    expect(ChangePassportDraftSchema.safeParse(approved).success).toBe(true);
  });

  it('rejects approvedBy set without approvedAt', () => {
    const bad = { ...VALID_PASSPORT_DRAFT, approvedBy: 'bob@example.com', approvedAt: null };
    expect(ChangePassportDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects approvedAt set without approvedBy', () => {
    const bad = { ...VALID_PASSPORT_DRAFT, approvedBy: null, approvedAt: VALID_DATE };
    expect(ChangePassportDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects verificationResultId that does not match embedded result id', () => {
    const bad = { ...VALID_PASSPORT_DRAFT, verificationResultId: VALID_ID_2 };
    expect(ChangePassportDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts empty remainingRisks array', () => {
    const ok = { ...VALID_PASSPORT_DRAFT, remainingRisks: [] };
    expect(ChangePassportDraftSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects missing title', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { title: _, ...bad } = VALID_PASSPORT_DRAFT;
    expect(ChangePassportDraftSchema.safeParse(bad).success).toBe(false);
  });
});
