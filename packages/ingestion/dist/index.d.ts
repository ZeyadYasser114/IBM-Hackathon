/**
 * @mergemind/ingestion — public API
 *
 * Everything a downstream consumer needs is exported from this single file.
 * Internal helpers (parse.ts, providers/git.ts internals) are NOT re-exported
 * so the public surface stays stable as providers evolve.
 */
export type { BranchComparison, ChangeSet, ChangeSource, ChangedFile, DiffHunk, DiffLine, DiffLineKind, EvidenceDiffRelation, EvidenceSnippet, EvidenceSourceType, FileStatus, GitHubPRSource, GitRef, ISOTimestamp, IngestionWarning, IngestionWarningCode, LocalGitSource, RepositoryDescriptor, UnknownSource, } from "./models/index.js";
export { compareBranches, ingestChanges, ingestLocalGit, WORKING_TREE, } from "./providers/git.js";
export type { LocalGitIngestionOptions } from "./providers/git.js";
export { extractEvidence } from "./evidence/extractor.js";
export type { ExtractionOptions, ExtractionResult } from "./evidence/extractor.js";
export { summarizeRepository } from "./summary/index.js";
export type { AnalysisPriority, FileSummary, FileLanguage, PriorityReason, RepositorySummary, } from "./models/index.js";
export { buildSemanticAnalysisInput } from "./payload/builder.js";
export type { PayloadBuildOptions, PayloadTruncationCode, PayloadTruncationWarning, SemanticAnalysisInput, SourceLabel, } from "./models/index.js";
//# sourceMappingURL=index.d.ts.map