/**
 * enums.test.ts — runtime enum/union contract tests for @mergemind/domain
 *
 * Proves that:
 *   1. Every runtime enum object exposes exactly the documented value set
 *      (no missing members, no stray members — renaming a value breaks
 *      serialized artifacts, so the full set is asserted, not just `contains`).
 *   2. Every enum value is accepted by the Zod schema that consumes it
 *      (runtime values and validation schemas cannot drift apart).
 *   3. Unknown values are rejected at each schema boundary.
 *
 * These are contract tests, not detector tests. They guard the shared
 * vocabulary every package (ingest, analysis, verification, api) relies on.
 */

import {
  AgentStatus,
  AgentType,
  ChangeKind,
  ConfidenceLevel,
  ConflictCategory,
  ConflictSeverity,
  EvidenceSource,
  VerificationStatus,
} from './enums.js';
import {
  AssumptionSchema,
  ChangedFileSchema,
  CodeEvidenceSchema,
  ConflictFindingSchema,
  DependencyReferenceSchema,
  VerificationResultSchema,
} from './schemas/index.js';
import {
  makeAssumption,
  makeChangedFile,
  makeCodeEvidence,
  makeConflictFinding,
  makeDependencyReference,
  makeVerificationResult,
} from './testing/factories.js';

// ===========================================================================
// Runtime value sets — exact membership
// ===========================================================================

describe('runtime enum value sets', () => {
  it('EvidenceSource exposes exactly the 7 documented sources', () => {
    expect(Object.values(EvidenceSource).sort()).toEqual(
      ['COMMENT', 'CONFIG', 'FILE_CHANGE', 'INFERRED', 'SCHEMA', 'SOURCE_CODE', 'TEST'].sort(),
    );
  });

  it('ConfidenceLevel exposes exactly HIGH / MEDIUM / LOW', () => {
    expect(Object.values(ConfidenceLevel).sort()).toEqual(['HIGH', 'LOW', 'MEDIUM'].sort());
  });

  it('ConflictSeverity exposes exactly the 4 documented severities', () => {
    expect(Object.values(ConflictSeverity).sort()).toEqual(
      ['CRITICAL', 'HIGH', 'LOW', 'MEDIUM'].sort(),
    );
  });

  it('ConflictCategory exposes exactly the 8 documented categories', () => {
    expect(Object.values(ConflictCategory).sort()).toEqual(
      [
        'BUSINESS_RULE',
        'CONFIGURATION',
        'CONTRACT',
        'DATA_SCHEMA',
        'DEPENDENCY',
        'LOGIC',
        'SECURITY',
        'TEST_EXPECTATION',
      ].sort(),
    );
  });

  it('VerificationStatus exposes exactly the 6 lifecycle states', () => {
    expect(Object.values(VerificationStatus).sort()).toEqual(
      ['CANCELLED', 'ERROR', 'FAIL', 'IN_PROGRESS', 'PASS', 'PENDING'].sort(),
    );
  });

  it('AgentType exposes exactly the 5 subagent roles', () => {
    expect(Object.values(AgentType).sort()).toEqual(
      ['adversary', 'change', 'contract', 'dependency', 'intent'].sort(),
    );
  });

  it('AgentStatus exposes exactly the 4 agent states', () => {
    expect(Object.values(AgentStatus).sort()).toEqual(
      ['complete', 'failed', 'idle', 'running'].sort(),
    );
  });

  it('ChangeKind exposes exactly the 4 git change kinds', () => {
    expect(Object.values(ChangeKind).sort()).toEqual(
      ['ADDED', 'DELETED', 'MODIFIED', 'RENAMED'].sort(),
    );
  });
});

// ===========================================================================
// Schema agreement — every runtime value validates where it is consumed
// ===========================================================================

describe('EvidenceSource values are accepted by CodeEvidenceSchema', () => {
  it.each(Object.values(EvidenceSource))('source "%s" validates', (source) => {
    const parsed = CodeEvidenceSchema.safeParse(makeCodeEvidence({ source }));
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown source', () => {
    const bad = { ...makeCodeEvidence(), source: 'MAGIC' };
    expect(CodeEvidenceSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ConfidenceLevel values are accepted by AssumptionSchema', () => {
  it.each(Object.values(ConfidenceLevel))('confidence "%s" validates', (confidence) => {
    const parsed = AssumptionSchema.safeParse(makeAssumption({ confidence }));
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown confidence level', () => {
    const bad = { ...makeAssumption(), confidence: 'VERY_HIGH' };
    expect(AssumptionSchema.safeParse(bad).success).toBe(false);
  });
});

describe('AgentType values are accepted by AssumptionSchema', () => {
  it.each(Object.values(AgentType))('sourceAgent "%s" validates', (sourceAgent) => {
    const parsed = AssumptionSchema.safeParse(makeAssumption({ sourceAgent }));
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown agent type', () => {
    const bad = { ...makeAssumption(), sourceAgent: 'wizard' };
    expect(AssumptionSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ChangeKind values are accepted by ChangedFileSchema', () => {
  it.each(Object.values(ChangeKind))('kind "%s" validates', (kind) => {
    // RENAMED is only valid with a previousPath — the schema enforces it.
    const file =
      kind === 'RENAMED'
        ? makeChangedFile({ kind, previousPath: 'src/auth/middleware.ts' })
        : makeChangedFile({ kind });
    expect(ChangedFileSchema.safeParse(file).success).toBe(true);
  });

  it('rejects an unknown change kind', () => {
    const bad = { ...makeChangedFile(), kind: 'COPIED' };
    expect(ChangedFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ConflictSeverity values are accepted by ConflictFindingSchema', () => {
  it.each(Object.values(ConflictSeverity))('severity "%s" validates', (severity) => {
    const parsed = ConflictFindingSchema.safeParse(makeConflictFinding({ severity }));
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown severity', () => {
    const bad = { ...makeConflictFinding(), severity: 'FATAL' };
    expect(ConflictFindingSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ConflictCategory values are accepted by ConflictFindingSchema', () => {
  it.each(Object.values(ConflictCategory))('category "%s" validates', (category) => {
    const parsed = ConflictFindingSchema.safeParse(makeConflictFinding({ category }));
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown category', () => {
    const bad = { ...makeConflictFinding(), category: 'STYLE' };
    expect(ConflictFindingSchema.safeParse(bad).success).toBe(false);
  });
});

describe('DependencyKind values are accepted by DependencyReferenceSchema', () => {
  const kinds = [
    'IMPORT',
    'FUNCTION_CALL',
    'TYPE_EXTENDS',
    'SHARED_STATE',
    'EVENT',
    'DATA_REFERENCE',
    'OTHER',
  ] as const;

  it.each(kinds)('kind "%s" validates', (kind) => {
    const parsed = DependencyReferenceSchema.safeParse(makeDependencyReference({ kind }));
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown dependency kind', () => {
    const bad = { ...makeDependencyReference(), kind: 'MAGIC_LINK' };
    expect(DependencyReferenceSchema.safeParse(bad).success).toBe(false);
  });
});

describe('VerificationStatus values are accepted by VerificationResultSchema', () => {
  it.each(Object.values(VerificationStatus))('status "%s" validates', (status) => {
    // Non-terminal statuses require completedAt: null; ERROR requires errorMessage.
    // Overrides are added conditionally — an explicit `undefined` would clobber
    // the factory default via object spread.
    const overrides: Record<string, unknown> = { status };
    if (status === 'PENDING' || status === 'IN_PROGRESS') overrides['completedAt'] = null;
    if (status === 'ERROR') overrides['errorMessage'] = 'controlled test failure';
    const result = makeVerificationResult(
      overrides as Parameters<typeof makeVerificationResult>[0],
    );
    const parsed = VerificationResultSchema.safeParse(result);
    if (!parsed.success) {
      // Surface the exact issue so status/schema drift is obvious.
      expect(JSON.stringify(parsed.error.issues, null, 2)).toBe('unreachable');
    }
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const bad = { ...makeVerificationResult(), status: 'UNKNOWN' };
    expect(VerificationResultSchema.safeParse(bad).success).toBe(false);
  });
});
