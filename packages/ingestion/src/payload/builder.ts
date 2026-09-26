/**
 * builder.ts — SemanticAnalysisInput payload assembler.
 *
 * Packages ingestion outputs into a single deterministic, size-controlled
 * payload ready for Awsemy's semantic engine.
 *
 * CONTRACT:
 * - Never discards high-value evidence (type-decl, function, route snippets)
 *   silently. Every dropped item produces a PayloadTruncationWarning.
 * - Deterministic: same inputs always produce the same payload (modulo
 *   payloadId and assembledAt which are intentionally unique per call).
 * - No semantic conclusions, no AI-provider fields.
 */

import { randomUUID } from "node:crypto";
import type {
  ChangeSet,
  ChangedFile,
  DiffHunk,
  EvidenceSnippet,
  EvidenceSourceType,
  FileSummary,
  IngestionWarning,
  PayloadBuildOptions,
  PayloadTruncationWarning,
  SemanticAnalysisInput,
  SourceLabel,
} from "../models/index.js";
import { summarizeRepository } from "../summary/repo-summarizer.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_REQUIREMENT_CHARS = 8_000;
const DEFAULT_MAX_SNIPPETS          = 200;
const DEFAULT_MAX_FILE_SUMMARIES    = 100;
const SCHEMA_VERSION                = "1.0";

// ---------------------------------------------------------------------------
// Snippet priority ordering (lower index = higher priority = kept first)
// ---------------------------------------------------------------------------

const SNIPPET_PRIORITY: Record<EvidenceSourceType, number> = {
  "type-decl":    0,
  "function":     1,
  "route":        2,
  "constant":     3,
  "unknown":      4,
  "diff-context": 5,
};

function snippetSortKey(s: EvidenceSnippet): string {
  // Primary: priority tier, Secondary: filePath, Tertiary: startLine, Quaternary: id
  return `${SNIPPET_PRIORITY[s.sourceType]}:${s.filePath}:${String(s.startLine).padStart(8, "0")}:${s.id}`;
}

// ---------------------------------------------------------------------------
// Requirement truncation
// ---------------------------------------------------------------------------

function truncateRequirement(
  requirement: string,
  maxChars: number,
  warnings: PayloadTruncationWarning[],
): string {
  if (requirement.length <= maxChars) return requirement;
  warnings.push({
    code: "REQUIREMENT_TRUNCATED",
    message: `Requirement text (${requirement.length} chars) exceeded limit of ${maxChars} chars and was truncated.`,
  });
  return requirement.slice(0, maxChars);
}

// ---------------------------------------------------------------------------
// Snippet budget enforcement
// ---------------------------------------------------------------------------

/**
 * Select up to `maxSnippets` from the combined pool.
 * High-priority sourceTypes are always kept first.
 * If any are dropped a SNIPPET_BUDGET_EXCEEDED warning is emitted.
 */
function enforceSnippetBudget(
  snippets: readonly EvidenceSnippet[],
  maxSnippets: number,
  warnings: PayloadTruncationWarning[],
): EvidenceSnippet[] {
  if (snippets.length <= maxSnippets) {
    return [...snippets].sort((a, b) => snippetSortKey(a).localeCompare(snippetSortKey(b)));
  }

  const sorted = [...snippets].sort((a, b) => snippetSortKey(a).localeCompare(snippetSortKey(b)));
  const kept = sorted.slice(0, maxSnippets);
  const dropped = sorted.slice(maxSnippets);

  const droppedHighValue = dropped.filter(
    (s) => SNIPPET_PRIORITY[s.sourceType] <= SNIPPET_PRIORITY["constant"],
  );

  warnings.push({
    code: "SNIPPET_BUDGET_EXCEEDED",
    message:
      `${dropped.length} snippet(s) dropped to stay within the limit of ${maxSnippets}.` +
      (droppedHighValue.length > 0
        ? ` ${droppedHighValue.length} high-value snippet(s) (type-decl/function/route/constant) were also dropped.`
        : ""),
    droppedCount: dropped.length,
  });

  return kept;
}

// ---------------------------------------------------------------------------
// File-summary budget enforcement
// ---------------------------------------------------------------------------

/**
 * Score for a FileSummary that determines keep priority when budget is tight.
 * Lower score = higher priority = kept first.
 *
 * Files that touch type declarations, routes, or are on auth paths rank higher.
 * Test-only and config-only files rank lowest.
 */
function fileSummaryScore(f: FileSummary): number {
  if (f.touchedSchemaNames.length > 0)   return 0; // type/schema touched
  if (f.changedExports.length > 0)        return 1; // exports changed
  if (f.touchedSymbols.some((s) => s.startsWith("route") || s.startsWith("handler"))) return 2;
  if (f.touchedSymbols.length > 0)        return 3;
  if (f.changedImports.length > 0)        return 4;
  if (f.isTestFile)                       return 6;
  if (f.isConfigFile)                     return 7;
  return 5;
}

function enforceFileSummaryBudget(
  files: readonly FileSummary[],
  maxFiles: number,
  warnings: PayloadTruncationWarning[],
): FileSummary[] {
  if (files.length <= maxFiles) return [...files];

  const sorted = [...files].sort((a, b) => {
    const scoreDiff = fileSummaryScore(a) - fileSummaryScore(b);
    if (scoreDiff !== 0) return scoreDiff;
    return a.filePath.localeCompare(b.filePath, undefined, { sensitivity: "base" });
  });
  const kept = sorted.slice(0, maxFiles);
  const dropped = sorted.slice(maxFiles);

  warnings.push({
    code: "FILE_SUMMARY_OMITTED",
    message: `${dropped.length} file summary entries omitted to stay within the limit of ${maxFiles}.`,
    droppedCount: dropped.length,
  });

  // Re-sort kept entries by filePath for deterministic output.
  return kept.sort((a, b) =>
    a.filePath.localeCompare(b.filePath, undefined, { sensitivity: "base" }),
  );
}

// ---------------------------------------------------------------------------
// Diff body stripping
// ---------------------------------------------------------------------------

function stripHunkBody(hunk: DiffHunk): DiffHunk {
  return {
    header:   hunk.header,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    body:     "",
    lines:    [],
  };
}

function stripChangedFileBodies(file: ChangedFile): ChangedFile {
  return {
    ...file,
    hunks: file.hunks.map(stripHunkBody),
  };
}

function stripChangeSetBodies(cs: ChangeSet): ChangeSet {
  return {
    ...cs,
    changedFiles: cs.changedFiles.map(stripChangedFileBodies),
  };
}

// ---------------------------------------------------------------------------
// Ingestion-warning deduplication
// ---------------------------------------------------------------------------

function deduplicateIngestionWarnings(
  warnings: readonly IngestionWarning[],
): IngestionWarning[] {
  const seen = new Set<string>();
  const result: IngestionWarning[] = [];
  for (const w of warnings) {
    const key = `${w.code}:${w.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(w);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Assemble a SemanticAnalysisInput payload from ingestion outputs.
 *
 * ```ts
 * const payload = buildSemanticAnalysisInput(
 *   "Only organization owners may manage subscriptions.",
 *   [authChangeSet, billingChangeSet],
 *   [...authSnippets, ...billingSnippets],
 *   {
 *     sourceLabels: [
 *       { id: "auth-agent",    description: "Authentication task", ref: "feature/auth" },
 *       { id: "billing-agent", description: "Billing task",        ref: "feature/billing" },
 *     ],
 *   },
 * );
 * ```
 *
 * @param requirement   The original feature/task requirement text (may be empty).
 * @param changeSets    One or more ChangeSets produced by ingestLocalGit / ingestChanges.
 * @param snippets      EvidenceSnippets produced by extractEvidence (all ChangeSets combined).
 * @param options       Size controls, source labels, and misc options.
 */
export function buildSemanticAnalysisInput(
  requirement: string,
  changeSets: readonly ChangeSet[],
  snippets: readonly EvidenceSnippet[],
  options: PayloadBuildOptions & { sourceLabels?: SourceLabel[]; requirementTitle?: string } = {},
): SemanticAnalysisInput {
  const truncationWarnings: PayloadTruncationWarning[] = [];

  const maxReqChars     = options.maxRequirementChars  ?? DEFAULT_MAX_REQUIREMENT_CHARS;
  const maxSnippets     = options.maxSnippets           ?? DEFAULT_MAX_SNIPPETS;
  const maxFileSummaries = options.maxFileSummaries     ?? DEFAULT_MAX_FILE_SUMMARIES;
  const stripBodies     = options.stripDiffBodies       ?? false;

  // 1. Truncate requirement if necessary.
  const finalRequirement = truncateRequirement(requirement, maxReqChars, truncationWarnings);

  // 2. Sort ChangeSets deterministically by id.
  const sortedChangeSets = [...changeSets].sort((a, b) => a.id.localeCompare(b.id));

  // 3. Apply diff-body stripping if requested — BEFORE building the summary
  //    so the summary reflects the payload's actual content.
  const payloadChangeSets = stripBodies
    ? sortedChangeSets.map(stripChangeSetBodies)
    : sortedChangeSets;

  if (stripBodies && sortedChangeSets.some((cs) => cs.changedFiles.some((f) => f.hunks.length > 0))) {
    truncationWarnings.push({
      code: "DIFF_BODY_STRIPPED",
      message: "Raw diff hunk bodies and parsed lines were removed from ChangeSets to reduce payload size. Hunk headers (position information) are preserved.",
    });
  }

  // 4. Build repository summary from the (potentially stripped) ChangeSets.
  //    Merge all ChangeSets into a synthetic one for the summary.
  //    If there is only one, use it directly.
  let summaryChangeSet: ChangeSet;
  if (payloadChangeSets.length === 1) {
    summaryChangeSet = payloadChangeSets[0];
  } else {
    // Merge: combine changedFiles (deduplicated by path) and all snippets.
    const seenPaths = new Set<string>();
    const mergedFiles: ChangedFile[] = [];
    for (const cs of payloadChangeSets) {
      for (const f of cs.changedFiles) {
        if (!seenPaths.has(f.path)) {
          seenPaths.add(f.path);
          mergedFiles.push(f);
        }
      }
    }
    summaryChangeSet = {
      id:              "merged-summary",
      source:          payloadChangeSets[0].source,
      repository:      payloadChangeSets[0].repository,
      changedFiles:    mergedFiles,
      totalAdditions:  mergedFiles.reduce((s, f) => s + (f.additions ?? 0), 0),
      totalDeletions:  mergedFiles.reduce((s, f) => s + (f.deletions ?? 0), 0),
      evidenceSnippets: [],
      warnings:        [],
      capturedAt:      payloadChangeSets[0].capturedAt,
    };
  }

  const rawSummary = summarizeRepository(summaryChangeSet, snippets);

  // 5. Enforce file-summary budget.
  const trimmedFiles = enforceFileSummaryBudget(rawSummary.files, maxFileSummaries, truncationWarnings);
  const repositorySummary = { ...rawSummary, files: trimmedFiles };

  // 6. Enforce snippet budget.
  const finalSnippets = enforceSnippetBudget(snippets, maxSnippets, truncationWarnings);

  // 7. Collect and deduplicate ingestion warnings from all ChangeSets.
  const allIngestionWarnings = deduplicateIngestionWarnings(
    sortedChangeSets.flatMap((cs) => [...cs.warnings]),
  );

  // 8. Sort source labels by id for determinism.
  const sourceLabels = [...(options.sourceLabels ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  return {
    payloadId:         randomUUID(),
    assembledAt:       new Date().toISOString(),
    schemaVersion:     SCHEMA_VERSION,
    requirement:       finalRequirement,
    requirementTitle:  options.requirementTitle,
    changeSets:        payloadChangeSets,
    evidenceSnippets:  finalSnippets,
    repositorySummary,
    sourceLabels,
    ingestionWarnings: allIngestionWarnings,
    truncationWarnings,
  };
}
