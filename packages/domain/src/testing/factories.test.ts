/**
 * factories.test.ts — proves every factory default passes its Zod schema.
 *
 * If a model and its factory drift apart, these tests fail with the exact
 * schema issue, telling the author which factory default to update.
 */

import {
  AcceptanceCriterionSchema,
  AssumptionSchema,
  ChangePassportDraftSchema,
  ChangedFileSchema,
  CodeEvidenceSchema,
  ConflictFindingSchema,
  DependencyReferenceSchema,
  FeatureRequestSchema,
  RepositorySourceSchema,
  VerificationResultSchema,
  VerificationSummarySchema,
} from '../schemas/index.js';
import {
  makeAcceptanceCriterion,
  makeAgentProgress,
  makeAssumption,
  makeBranchRef,
  makeChangePassportDraft,
  makeChangedFile,
  makeCodeEvidence,
  makeConflictFinding,
  makeDependencyEndpoint,
  makeDependencyReference,
  makeFeatureRequest,
  makeRepositorySource,
  makeRiskItem,
  makeVerificationResult,
  makeVerificationSummary,
} from './factories.js';

describe('factory defaults are schema-valid', () => {
  it('makeAcceptanceCriterion passes AcceptanceCriterionSchema', () => {
    expect(AcceptanceCriterionSchema.safeParse(makeAcceptanceCriterion()).success).toBe(true);
  });

  it('makeFeatureRequest passes FeatureRequestSchema', () => {
    expect(FeatureRequestSchema.safeParse(makeFeatureRequest()).success).toBe(true);
  });

  it('makeBranchRef has a 40-hex-char sha', () => {
    const ref = makeBranchRef();
    expect(ref.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('makeRepositorySource passes RepositorySourceSchema', () => {
    expect(RepositorySourceSchema.safeParse(makeRepositorySource()).success).toBe(true);
  });

  it('makeChangedFile passes ChangedFileSchema', () => {
    expect(ChangedFileSchema.safeParse(makeChangedFile()).success).toBe(true);
  });

  it('makeChangedFile with previousPath passes ChangedFileSchema', () => {
    const renamed = makeChangedFile({
      kind: 'RENAMED',
      path: 'src/auth/guards.ts',
      previousPath: 'src/auth/middleware.ts',
    });
    expect(ChangedFileSchema.safeParse(renamed).success).toBe(true);
  });

  it('makeCodeEvidence passes CodeEvidenceSchema', () => {
    expect(CodeEvidenceSchema.safeParse(makeCodeEvidence()).success).toBe(true);
  });

  it('makeAssumption passes AssumptionSchema', () => {
    expect(AssumptionSchema.safeParse(makeAssumption()).success).toBe(true);
  });

  it('makeDependencyEndpoint has the required fields', () => {
    const endpoint = makeDependencyEndpoint();
    expect(endpoint.filePath.length).toBeGreaterThan(0);
    expect(endpoint.branchName.length).toBeGreaterThan(0);
  });

  it('makeDependencyReference passes DependencyReferenceSchema', () => {
    expect(DependencyReferenceSchema.safeParse(makeDependencyReference()).success).toBe(true);
  });

  it('makeConflictFinding passes ConflictFindingSchema', () => {
    expect(ConflictFindingSchema.safeParse(makeConflictFinding()).success).toBe(true);
  });

  it('makeVerificationSummary passes VerificationSummarySchema', () => {
    expect(VerificationSummarySchema.safeParse(makeVerificationSummary()).success).toBe(true);
  });

  it('makeVerificationResult passes VerificationResultSchema', () => {
    const parsed = VerificationResultSchema.safeParse(makeVerificationResult());
    if (!parsed.success) {
      // Surface the exact issues — factory/schema drift should be obvious.
      expect(JSON.stringify(parsed.error.issues, null, 2)).toBe('unreachable');
    }
    expect(parsed.success).toBe(true);
  });

  it('makeRiskItem has a key and description', () => {
    const risk = makeRiskItem();
    expect(risk.key.length).toBeGreaterThan(0);
    expect(risk.description.length).toBeGreaterThan(0);
  });

  it('makeChangePassportDraft passes ChangePassportDraftSchema', () => {
    expect(ChangePassportDraftSchema.safeParse(makeChangePassportDraft()).success).toBe(true);
  });

  it('makeAgentProgress has agent type and message', () => {
    const progress = makeAgentProgress();
    expect(progress.agentType).toBe('intent');
    expect(progress.message.length).toBeGreaterThan(0);
  });
});
