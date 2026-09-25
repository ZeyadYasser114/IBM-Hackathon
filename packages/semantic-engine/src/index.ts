/**
 * index.ts — public barrel for @mergemind/semantic-engine
 */

// Enums
export { ConflictType, Severity, Confidence, SourceType } from "./types/enums";

// EvidenceReference
export type { EvidenceReference, EvidenceValidationError } from "./types/evidence";
export { validateEvidenceReference, assertValidEvidenceReference } from "./types/evidence";

// SemanticAssumption
export type { SemanticAssumption, AssumptionValidationError } from "./types/assumption";
export { validateSemanticAssumption, normalizeAssumption, assertValidSemanticAssumption } from "./types/assumption";

// ConflictCandidate
export { CandidateStatus } from "./types/candidate";
export type { ConflictCandidate, CandidateValidationError } from "./types/candidate";
export { validateConflictCandidate, assertValidConflictCandidate } from "./types/candidate";

// SemanticConflict
export type { SemanticConflict, ConflictValidationError } from "./types/conflict";
export { validateSemanticConflict, assertValidSemanticConflict } from "./types/conflict";

// AnalysisInput
export type { AnalysisInput, ChangeDescription, FileSnippet, InputValidationError } from "./types/input";
export { validateAnalysisInput, assertValidAnalysisInput } from "./types/input";

// SemanticAnalysisResult
export { AnalysisStatus } from "./types/result";
export type { SemanticAnalysisResult } from "./types/result";
export { hasConflicts, highSeverityConflicts, resultSummaryStats } from "./types/result";

// ---------------------------------------------------------------------------
// Extraction pipeline (prompt 2)
// ---------------------------------------------------------------------------

export { AssumptionCategory } from "./extraction/assumption-category";

export type { AssumptionExtractorProvider, ExtractionUnit, ExtractionResult } from "./extraction/extractor-provider";

export type { RulePattern, PatternMatch } from "./extraction/rule-patterns";
export {
  ALL_RULE_PATTERNS, AUTH_PATTERNS, BUSINESS_RULE_PATTERNS,
  CONTRACT_PATTERNS, SCHEMA_PATTERNS, DEPENDENCY_PATTERNS, toSubjectKey,
} from "./extraction/rule-patterns";

export { DeterministicExtractor } from "./extraction/deterministic-extractor";

export type { PipelineExtractionResult } from "./extraction/extraction-pipeline";
export { ExtractionPipeline } from "./extraction/extraction-pipeline";

// ---------------------------------------------------------------------------
// Normalization layer (prompt 3)
// ---------------------------------------------------------------------------

export type { EntityNormalizationResult } from "./normalization/entity-normalizer";
export { normalizeEntity } from "./normalization/entity-normalizer";

export type { ValueNormalizationResult } from "./normalization/value-normalizer";
export { normalizeValue, normalizeValueString } from "./normalization/value-normalizer";

export type { PredicateNormalizationResult } from "./normalization/predicate-normalizer";
export { normalizePredicate } from "./normalization/predicate-normalizer";

export type {
  EvidenceAnchor, NormalizationStep, NormalizationTrace, NormalizedAssumption,
} from "./normalization/evidence-anchor";
export { buildEvidenceAnchor } from "./normalization/evidence-anchor";

export { normalizeAssumptions, normalizeAssumptionsWithWarnings } from "./normalization/normalization-pipeline";

// ---------------------------------------------------------------------------
// Conflict detection (prompt 4)
// ---------------------------------------------------------------------------

export type { ClassificationResult } from "./detection/conflict-classifier";
export { classify } from "./detection/conflict-classifier";
export { buildConflict } from "./detection/conflict-builder";
export { detectConflicts, explainConflicts } from "./detection/conflict-detector";

// Prompt 5 — explainable report shape
export type { ConflictReport, EvidenceSide } from "./detection/conflict-report";
export type { SeverityRuling } from "./detection/severity-rules";
export { assignSeverityAndConfidence } from "./detection/severity-rules";
export { buildReport } from "./detection/report-builder";
