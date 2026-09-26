/**
 * repo-summarizer.ts — repository-level rollup.
 *
 * Aggregates FileSummary entries into a RepositorySummary.
 * All values are deterministic and trace to specific files or hunks.
 * No semantic conclusions.
 */

import type {
  ChangeSet,
  EvidenceSnippet,
  FileSummary,
  FileLanguage,
  RepositorySummary,
} from "../models/index.js";
import { summarizeFile } from "./file-summarizer.js";
import {
  collectDirectories,
  computePriority,
  sortedUnique,
} from "./classifier.js";

/**
 * Build a RepositorySummary from a ChangeSet and its associated evidence
 * snippets (typically the output of extractEvidence).
 *
 * Snippets are optional — passing an empty array means symbol enrichment
 * from the evidence layer is skipped; diff-line scanning still runs.
 */
export function summarizeRepository(
  changeSet: ChangeSet,
  snippets: readonly EvidenceSnippet[] = [],
): RepositorySummary {
  // Build per-file summaries.
  const files: FileSummary[] = changeSet.changedFiles
    .map((f) => summarizeFile(f, snippets))
    .sort((a, b) => a.filePath.localeCompare(b.filePath, undefined, { sensitivity: "base" }));

  // Aggregate across all files.
  const totalAdditions = files.reduce((s, f) => s + (f.additions ?? 0), 0);
  const totalDeletions = files.reduce((s, f) => s + (f.deletions ?? 0), 0);

  const touchedDirectories = collectDirectories(files.map((f) => f.filePath));

  const languages: FileLanguage[] = sortedUnique(
    files.map((f) => f.language),
  ) as FileLanguage[];

  const allTouchedSymbols   = sortedUnique(files.flatMap((f) => [...f.touchedSymbols]));
  const allChangedImports   = sortedUnique(files.flatMap((f) => [...f.changedImports]));
  const allChangedExports   = sortedUnique(files.flatMap((f) => [...f.changedExports]));
  const allTouchedSchemaNames = sortedUnique(files.flatMap((f) => [...f.touchedSchemaNames]));

  const testFileCount   = files.filter((f) => f.isTestFile).length;
  const configFileCount = files.filter((f) => f.isConfigFile).length;

  const { priority, reasons } = computePriority({
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
