/**
 * code-evidence.ts
 *
 * A concrete reference that supports or contradicts a claim (Assumption,
 * ConflictFinding, DependencyReference, etc.).  Think of CodeEvidence as a
 * citation: every non-trivial claim should have at least one.
 *
 * Serialization notes
 * -------------------
 * - `lineStart` / `lineEnd` are 1-based line numbers in the file at the
 *   commit captured by the parent `RepositorySource.featureBranches[n].sha`.
 * - `snippet` should be a short excerpt (≤ 5 lines) — not the entire file.
 * - `metadata` is an escape hatch for source-specific data; keep it small and
 *   document its keys in the producing agent.
 */

import type { EvidenceSource } from '../enums.js';

/**
 * A single traceable reference to code, configuration, or an AI inference.
 */
export type CodeEvidence = {
  /**
   * Category of the location where this evidence was found.
   * @see EvidenceSource
   */
  source: EvidenceSource;
  /**
   * Repository-relative path of the file containing the evidence.
   * Example: "src/billing/permissions.ts"
   */
  filePath: string;
  /**
   * 1-based line number where the evidence starts.
   * Null when line precision is unavailable (e.g. whole-file inferences).
   */
  lineStart: number | null;
  /**
   * 1-based line number where the evidence ends (inclusive).
   * Equal to `lineStart` for single-line evidence.
   * Null when `lineStart` is null.
   */
  lineEnd: number | null;
  /**
   * Short verbatim excerpt of the relevant code or configuration.
   * Should be ≤ 5 lines.  Null for purely inferred evidence.
   */
  snippet: string | null;
  /**
   * Branch this evidence was found on.
   * Matches a `BranchRef.name` in the parent `RepositorySource`.
   */
  branchName: string;
  /**
   * Arbitrary key-value pairs for source-specific metadata.
   * Examples:
   *   - For INFERRED: { "model": "claude-3-7-sonnet", "promptVersion": "1.2" }
   *   - For SOURCE_CODE: { "symbolKind": "FunctionDeclaration", "symbolName": "checkRole" }
   * Must be serializable to JSON; avoid circular references.
   */
  metadata: Record<string, string>;
};
