/**
 * extractor.ts — evidence-extraction engine
 *
 * Converts raw ChangedFile/DiffHunk data into compact EvidenceSnippet records
 * suitable for downstream semantic analysis.
 *
 * CONTRACT:
 * - Never claims semantic conflicts.
 * - Preserves original source text exactly.
 * - Never fabricates line numbers (0 = unknown).
 * - Deduplicates overlapping snippets before returning.
 * - Falls back to diff-context snippets when richer extraction is not safe.
 * - Returns warnings for unsupported or failed extractions.
 */
import type { ChangeSet, EvidenceSnippet, IngestionWarning } from "../models/index.js";
export interface ExtractionResult {
    /** Extracted snippets, deduplicated and stably ordered. */
    readonly snippets: readonly EvidenceSnippet[];
    /** Non-fatal issues encountered during extraction. */
    readonly warnings: readonly IngestionWarning[];
}
export interface ExtractionOptions {
    /**
     * Maximum number of lines per snippet.
     * Keeps individual snippets short enough for AI analysis.
     * Defaults to 60.
     */
    maxSnippetLines?: number;
    /**
     * Maximum number of context lines to include around a hunk
     * when falling back to diff-context extraction.
     * Defaults to 5.
     */
    diffContextLines?: number;
}
/**
 * Extract evidence snippets from a ChangeSet.
 *
 * Accepts an optional map of file path → HEAD file content for structural
 * extraction. When a file's content is not provided, diff-context fallback
 * is used automatically.
 *
 * ```ts
 * const { snippets, warnings } = extractEvidence(changeSet, headContents);
 * ```
 */
export declare function extractEvidence(changeSet: ChangeSet, 
/**
 * Map of repository-relative file path → full HEAD file content (text).
 * Populate this for TS/JS files to enable structural extraction.
 * Files absent from the map fall back to diff-context extraction.
 */
headContents?: ReadonlyMap<string, string>, options?: ExtractionOptions): ExtractionResult;
//# sourceMappingURL=extractor.d.ts.map