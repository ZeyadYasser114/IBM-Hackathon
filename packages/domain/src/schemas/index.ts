/**
 * schemas/index.ts
 *
 * Zod validation schemas for all MergeMind domain contracts.
 *
 * Use these schemas at system boundaries — API endpoints, file I/O, message
 * queues — to guarantee that untrusted input matches the domain contract before
 * it enters the business logic.
 *
 * The schemas are kept structurally in sync with the TypeScript types in
 * src/models/.  When a model field changes, update the corresponding schema.
 *
 * All schemas are exported both as Zod schemas (for .parse / .safeParse) and
 * as inferred TypeScript types (prefixed with `Validated`).  Use the inferred
 * types when you want to communicate "this value has been validated at runtime".
 *
 * Usage:
 *   import { VerificationResultSchema } from '@mergemind/domain/schemas';
 *   const result = VerificationResultSchema.parse(rawJson); // throws on invalid
 *   const safe = VerificationResultSchema.safeParse(rawJson); // { success, data|error }
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const IdSchema = z.string().uuid({ message: 'id must be a UUID v4 string' });

const ISODateStringSchema = z
  .string()
  .datetime({ message: 'must be an ISO-8601 UTC datetime string (e.g. 2024-08-01T12:00:00.000Z)' });

const SemVerSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, { message: 'must be a valid SemVer string (e.g. "1.0.0")' });

// ---------------------------------------------------------------------------
// Enum schemas — kept as literal unions so they serialize to strings
// ---------------------------------------------------------------------------

const EvidenceSourceSchema = z.enum([
  'SOURCE_CODE',
  'TEST',
  'COMMENT',
  'CONFIG',
  'SCHEMA',
  'INFERRED',
  'FILE_CHANGE',
]);

const ConfidenceLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

const ConflictSeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

const ConflictCategorySchema = z.enum([
  'BUSINESS_RULE',
  'CONTRACT',
  'DEPENDENCY',
  'DATA_SCHEMA',
  'TEST_EXPECTATION',
  'LOGIC',
  'SECURITY',
  'CONFIGURATION',
]);

const VerificationStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'PASS',
  'FAIL',
  'CANCELLED',
  'ERROR',
]);

const AgentTypeSchema = z.enum([
  'intent',
  'contract',
  'dependency',
  'adversary',
  'change',
]);

const ChangeKindSchema = z.enum(['ADDED', 'MODIFIED', 'DELETED', 'RENAMED']);

// ---------------------------------------------------------------------------
// CodeEvidence
// ---------------------------------------------------------------------------

export const CodeEvidenceSchema = z.object({
  source: EvidenceSourceSchema,
  filePath: z.string().min(1, 'filePath must not be empty'),
  lineStart: z.number().int().positive().nullable(),
  lineEnd: z.number().int().positive().nullable(),
  snippet: z.string().nullable(),
  branchName: z.string().min(1, 'branchName must not be empty'),
  metadata: z.record(z.string(), z.string()),
}).refine(
  (e) => {
    // lineEnd must be >= lineStart when both are set
    if (e.lineStart !== null && e.lineEnd !== null) {
      return e.lineEnd >= e.lineStart;
    }
    // lineEnd must be null when lineStart is null
    if (e.lineStart === null) return e.lineEnd === null;
    return true;
  },
  { message: 'lineEnd must be >= lineStart, and both must be null or both non-null' },
);

export type ValidatedCodeEvidence = z.infer<typeof CodeEvidenceSchema>;

// ---------------------------------------------------------------------------
// AcceptanceCriterion
// ---------------------------------------------------------------------------

export const AcceptanceCriterionSchema = z.object({
  key: z.string().min(1, 'key must not be empty'),
  description: z.string().min(1, 'description must not be empty'),
});

// ---------------------------------------------------------------------------
// FeatureRequest
// ---------------------------------------------------------------------------

export const FeatureRequestSchema = z.object({
  id: IdSchema,
  title: z.string().min(1, 'title must not be empty'),
  description: z.string().min(1, 'description must not be empty'),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  rules: z.array(z.string()),
  tags: z.array(z.string()),
  createdAt: ISODateStringSchema,
  submittedBy: z.string().min(1, 'submittedBy must not be empty'),
});

export type ValidatedFeatureRequest = z.infer<typeof FeatureRequestSchema>;

// ---------------------------------------------------------------------------
// BranchRef / RepositorySource
// ---------------------------------------------------------------------------

export const BranchRefSchema = z.object({
  name: z.string().min(1, 'branch name must not be empty'),
  sha: z
    .string()
    .regex(/^[0-9a-f]{40}$/, { message: 'sha must be a 40-character lowercase hex string' }),
});

export const RepositorySourceSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  cloneUrl: z.string().min(1, 'cloneUrl must not be empty'),
  provider: z.string().min(1, 'provider must not be empty'),
  baseBranch: BranchRefSchema,
  featureBranches: z
    .array(BranchRefSchema)
    .min(1, 'at least one feature branch is required'),
  resolvedAt: ISODateStringSchema,
});

export type ValidatedRepositorySource = z.infer<typeof RepositorySourceSchema>;

// ---------------------------------------------------------------------------
// ChangedFile
// ---------------------------------------------------------------------------

export const ChangedFileSchema = z.object({
  path: z.string().min(1, 'path must not be empty'),
  kind: ChangeKindSchema,
  previousPath: z.string().min(1).optional(),
  patch: z.string().nullable(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  branchName: z.string().min(1, 'branchName must not be empty'),
  language: z.string().nullable(),
}).refine(
  (f) => f.kind !== 'RENAMED' || f.previousPath !== undefined,
  { message: 'previousPath is required when kind is RENAMED' },
);

export type ValidatedChangedFile = z.infer<typeof ChangedFileSchema>;

// ---------------------------------------------------------------------------
// Assumption
// ---------------------------------------------------------------------------

export const AssumptionSchema = z.object({
  id: IdSchema,
  branchName: z.string().min(1),
  sourceFile: z.string().min(1),
  statement: z.string().min(1, 'statement must not be empty'),
  concept: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, { message: 'concept must be lowercase kebab-case' }),
  value: z.string().min(1, 'value must not be empty'),
  sourceAgent: AgentTypeSchema,
  evidence: z.array(CodeEvidenceSchema),
  confidence: ConfidenceLevelSchema,
  numericConfidence: z.number().min(0).max(1),
  relatedAssumptionIds: z.array(IdSchema),
  extractedAt: ISODateStringSchema,
});

export type ValidatedAssumption = z.infer<typeof AssumptionSchema>;

// ---------------------------------------------------------------------------
// DependencyReference
// ---------------------------------------------------------------------------

const DependencyKindSchema = z.enum([
  'IMPORT',
  'FUNCTION_CALL',
  'TYPE_EXTENDS',
  'SHARED_STATE',
  'EVENT',
  'DATA_REFERENCE',
  'OTHER',
]);

const DependencyEndpointSchema = z.object({
  filePath: z.string().min(1),
  symbolName: z.string().nullable(),
  branchName: z.string().min(1),
});

export const DependencyReferenceSchema = z.object({
  id: IdSchema,
  from: DependencyEndpointSchema,
  to: DependencyEndpointSchema,
  kind: DependencyKindSchema,
  isCrossModule: z.boolean(),
  description: z.string().nullable(),
});

export type ValidatedDependencyReference = z.infer<typeof DependencyReferenceSchema>;

// ---------------------------------------------------------------------------
// ConflictFinding
// ---------------------------------------------------------------------------

export const ConflictFindingSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(160, 'title should be < 160 characters'),
  description: z.string().min(1),
  severity: ConflictSeveritySchema,
  category: ConflictCategorySchema,
  affectedAssumptionIds: z.array(IdSchema).min(1, 'at least one affected assumption is required'),
  affectedFiles: z.array(z.string().min(1)),
  conflictEvidence: z.array(CodeEvidenceSchema),
  proposedResolution: z.string().nullable(),
  resolvedAt: ISODateStringSchema.nullable(),
}).refine(
  (c) => {
    // resolvedAt must be null when proposedResolution is null
    if (c.proposedResolution === null) return c.resolvedAt === null;
    return true;
  },
  { message: 'resolvedAt must be null when proposedResolution is null' },
);

export type ValidatedConflictFinding = z.infer<typeof ConflictFindingSchema>;

// ---------------------------------------------------------------------------
// VerificationSummary / VerificationResult
// ---------------------------------------------------------------------------

export const VerificationSummarySchema = z.object({
  assumptionsFound: z.number().int().nonnegative(),
  conflictsFound: z.number().int().nonnegative(),
  conflictsResolved: z.number().int().nonnegative(),
  filesChanged: z.number().int().nonnegative(),
  requirementCoverage: z.number().min(0).max(100).nullable(),
  conflictsBySeverity: z.object({
    CRITICAL: z.number().int().nonnegative(),
    HIGH: z.number().int().nonnegative(),
    MEDIUM: z.number().int().nonnegative(),
    LOW: z.number().int().nonnegative(),
  }),
}).refine(
  (s) => s.conflictsResolved <= s.conflictsFound,
  { message: 'conflictsResolved cannot exceed conflictsFound' },
);

export const VerificationResultSchema = z.object({
  id: IdSchema,
  schemaVersion: SemVerSchema,
  featureRequest: FeatureRequestSchema,
  repositorySource: RepositorySourceSchema,
  status: VerificationStatusSchema,
  startedAt: ISODateStringSchema,
  completedAt: ISODateStringSchema.nullable(),
  assumptions: z.array(AssumptionSchema),
  conflicts: z.array(ConflictFindingSchema),
  summary: VerificationSummarySchema,
  errorMessage: z.string().nullable(),
}).refine(
  (r) => {
    // completedAt must be null for non-terminal statuses
    const terminal = new Set(['PASS', 'FAIL', 'CANCELLED', 'ERROR'] as const);
    if (!terminal.has(r.status as 'PASS' | 'FAIL' | 'CANCELLED' | 'ERROR')) {
      return r.completedAt === null;
    }
    return true;
  },
  { message: 'completedAt must be null when status is PENDING or IN_PROGRESS' },
).refine(
  (r) => r.status !== 'ERROR' || r.errorMessage !== null,
  { message: 'errorMessage must be set when status is ERROR' },
);

export type ValidatedVerificationResult = z.infer<typeof VerificationResultSchema>;

// ---------------------------------------------------------------------------
// ChangePassportDraft
// ---------------------------------------------------------------------------

const RiskItemSchema = z.object({
  key: z.string().min(1),
  description: z.string().min(1),
  severity: ConflictSeveritySchema,
  sourceConflictId: IdSchema.nullable(),
});

export const ChangePassportDraftSchema = z.object({
  id: IdSchema,
  schemaVersion: SemVerSchema,
  verificationResultId: IdSchema,
  title: z.string().min(1),
  intentSummary: z.string().min(1),
  changedFiles: z.array(z.string().min(1)),
  remainingRisks: z.array(RiskItemSchema),
  notableDecisions: z.array(z.string()),
  verificationResult: VerificationResultSchema,
  generatedAt: ISODateStringSchema,
  approvedBy: z.string().nullable(),
  approvedAt: ISODateStringSchema.nullable(),
}).refine(
  (p) => {
    // If approved, both fields must be set
    if (p.approvedBy !== null) return p.approvedAt !== null;
    if (p.approvedAt !== null) return p.approvedBy !== null;
    return true;
  },
  { message: 'approvedBy and approvedAt must both be set or both be null' },
).refine(
  (p) => p.verificationResult.id === p.verificationResultId,
  { message: 'verificationResultId must match the embedded verificationResult.id' },
);

export type ValidatedChangePassportDraft = z.infer<typeof ChangePassportDraftSchema>;
