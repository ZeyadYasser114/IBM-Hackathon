/**
 * file-summarizer.ts — per-file metadata extraction.
 *
 * Scans diff lines and evidence snippets to produce a FileSummary.
 * All fields trace to observable diff evidence. No semantic conclusions.
 */
import type { ChangedFile, EvidenceSnippet, FileSummary } from "../models/index.js";
/**
 * Produce a FileSummary for one ChangedFile.
 *
 * @param file           The changed file from the ChangeSet.
 * @param snippets       All EvidenceSnippets from the ChangeSet (used for enrichment).
 */
export declare function summarizeFile(file: ChangedFile, snippets: readonly EvidenceSnippet[]): FileSummary;
//# sourceMappingURL=file-summarizer.d.ts.map