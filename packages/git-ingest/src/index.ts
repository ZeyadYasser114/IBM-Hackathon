/**
 * @mergemind/git-ingest
 *
 * Deterministic repository-ingestion layer for MergeMind.
 *
 * Turns a repository source (on-disk Git repo, pasted diff, or pre-built records)
 * into structured `ChangedFile` and `CodeEvidence` contracts that analysis agents
 * can trust without knowing anything about Git.
 *
 * Public API surface:
 *
 *   // Core orchestrator
 *   createRepositoryContext(adapter, repo, base, features) → RepositoryIngestResult
 *
 *   // Adapters — pick one per run
 *   LocalGitAdapter       — on-disk Git repository (real `git` CLI)
 *   InMemoryAdapter       — pre-built records for tests / tRPC API path
 *   PastedDiffAdapter     — raw unified-diff string
 *
 *   // Low-level utilities (exposed for testing and direct use)
 *   parseDiff(raw)                      → ParsedFile[]
 *   buildEvidenceForFile(file, branch)  → CodeEvidence[]
 *   buildAllEvidence(files, branch)     → CodeEvidence[]
 *   buildEvidenceFromChangedFiles(files)→ CodeEvidence[]
 *   inferLanguage(path)                 → string | null
 *
 *   // Types
 *   IngestAdapter, RepositoryDescriptor, RepositoryIngestResult
 *   ParsedFile, DiffHunk
 *   GitRunner, RealGitRunner
 */

// ---------------------------------------------------------------------------
// Orchestrator + adapter contract
// ---------------------------------------------------------------------------
export {
  createRepositoryContext,
  buildEvidenceFromChangedFiles,
  buildAllEvidence,
} from './ingest.js';
export type { IngestAdapter, RepositoryDescriptor, RepositoryIngestResult } from './ingest.js';

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------
export { LocalGitAdapter, RealGitRunner } from './adapters/local-git.js';
export type { GitRunner } from './adapters/local-git.js';

export { InMemoryAdapter } from './adapters/in-memory.js';

export { PastedDiffAdapter } from './adapters/pasted-diff.js';

// ---------------------------------------------------------------------------
// Diff parser
// ---------------------------------------------------------------------------
export { parseDiff, inferLanguage } from './diff-parser.js';
export type { ParsedFile, DiffHunk } from './diff-parser.js';

// ---------------------------------------------------------------------------
// Evidence builder
// ---------------------------------------------------------------------------
export { buildEvidenceForFile } from './evidence-builder.js';
