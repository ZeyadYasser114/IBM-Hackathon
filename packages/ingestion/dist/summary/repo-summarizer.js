"use strict";
/**
 * repo-summarizer.ts — repository-level rollup.
 *
 * Aggregates FileSummary entries into a RepositorySummary.
 * All values are deterministic and trace to specific files or hunks.
 * No semantic conclusions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeRepository = summarizeRepository;
const file_summarizer_js_1 = require("./file-summarizer.js");
const classifier_js_1 = require("./classifier.js");
/**
 * Build a RepositorySummary from a ChangeSet and its associated evidence
 * snippets (typically the output of extractEvidence).
 *
 * Snippets are optional — passing an empty array means symbol enrichment
 * from the evidence layer is skipped; diff-line scanning still runs.
 */
function summarizeRepository(changeSet, snippets = []) {
    // Build per-file summaries.
    const files = changeSet.changedFiles
        .map((f) => (0, file_summarizer_js_1.summarizeFile)(f, snippets))
        .sort((a, b) => a.filePath.localeCompare(b.filePath, undefined, { sensitivity: "base" }));
    // Aggregate across all files.
    const totalAdditions = files.reduce((s, f) => s + (f.additions ?? 0), 0);
    const totalDeletions = files.reduce((s, f) => s + (f.deletions ?? 0), 0);
    const touchedDirectories = (0, classifier_js_1.collectDirectories)(files.map((f) => f.filePath));
    const languages = (0, classifier_js_1.sortedUnique)(files.map((f) => f.language));
    const allTouchedSymbols = (0, classifier_js_1.sortedUnique)(files.flatMap((f) => [...f.touchedSymbols]));
    const allChangedImports = (0, classifier_js_1.sortedUnique)(files.flatMap((f) => [...f.changedImports]));
    const allChangedExports = (0, classifier_js_1.sortedUnique)(files.flatMap((f) => [...f.changedExports]));
    const allTouchedSchemaNames = (0, classifier_js_1.sortedUnique)(files.flatMap((f) => [...f.touchedSchemaNames]));
    const testFileCount = files.filter((f) => f.isTestFile).length;
    const configFileCount = files.filter((f) => f.isConfigFile).length;
    const { priority, reasons } = (0, classifier_js_1.computePriority)({
        files,
        totalAdditions,
        totalDeletions,
        evidenceSnippetCount: snippets.length,
    });
    return {
        changeSetId: changeSet.id,
        totalFiles: changeSet.changedFiles.length,
        totalAdditions,
        totalDeletions,
        touchedDirectories,
        languages,
        allTouchedSymbols,
        allChangedImports,
        allChangedExports,
        allTouchedSchemaNames,
        testFileCount,
        configFileCount,
        evidenceSnippetCount: snippets.length,
        warningCount: changeSet.warnings.length,
        analysisPriority: priority,
        priorityReasons: reasons,
        files,
    };
}
//# sourceMappingURL=repo-summarizer.js.map