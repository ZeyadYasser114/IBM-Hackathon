/**
 * repo-summarizer.ts — repository-level rollup.
 *
 * Aggregates FileSummary entries into a RepositorySummary.
 * All values are deterministic and trace to specific files or hunks.
 * No semantic conclusions.
 */
import type { ChangeSet, EvidenceSnippet, RepositorySummary } from "../models/index.js";
/**
 * Build a RepositorySummary from a ChangeSet and its associated evidence
 * snippets (typically the output of extractEvidence).
 *
 * Snippets are optional — passing an empty array means symbol enrichment
 * from the evidence layer is skipped; diff-line scanning still runs.
 */
export declare function summarizeRepository(changeSet: ChangeSet, snippets?: readonly EvidenceSnippet[]): RepositorySummary;
//# sourceMappingURL=repo-summarizer.d.ts.map