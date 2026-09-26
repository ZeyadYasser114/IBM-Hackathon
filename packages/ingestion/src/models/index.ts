/**
 * @mergemind/ingestion — typed models
 *
 * All types in this file are pure data contracts.
 * They carry no logic and make no semantic conclusions.
 * Downstream consumers (conflict-detection, UI, Bob agents) import from here.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 timestamp string. */
export type ISOTimestamp = string;

/** A Git object reference: SHA, branch name, tag, or symbolic ref. */
export type GitRef = string;

// ---------------------------------------------------------------------------
// ChangeSource
// ---------------------------------------------------------------------------

/**
 * Identifies where a ChangeSet originated.
 * Additional source kinds (GitHub PR, GitLab MR, Bitbucket, etc.)
 * can be added as union members without touching existing consumers.
 */
export type ChangeSource =
  | LocalGitSource
  | GitHubPRSource   // reserved — not yet populated by any provider
  | UnknownSource;

export interface LocalGitSource {
  readonly kind: "local-git";
  /** Absolute path to the repository root on disk. */
  readonly repositoryPath: string;
  /** The base ref used for the comparison (e.g. "main"). */
  readonly baseRef: GitRef;
  /** The head ref being compared (e.g. a feature branch or commit SHA). */
  readonly headRef: GitRef;
}

/** Placeholder — populated by a future GitHub provider. */
export interface GitHubPRSource {
  readonly kind: "github-pr";
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
  readonly baseRef: GitRef;
  readonly headRef: GitRef;
  readonly prUrl: string;
}

export interface UnknownSource {
  readonly kind: "unknown";
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// RepositoryDescriptor
// ---------------------------------------------------------------------------

/**
 * Lightweight description of the repository being analysed.
 * Intentionally decoupled from any host (local path, remote URL, etc.)
 * so the same type can be reused regardless of provider.
 */
export interface RepositoryDescriptor {
  /** Human-readable name (e.g. derived from remote URL or directory name). */
  readonly name: string;
  /**
   * Primary remote URL when available (https or ssh).
   * Undefined for purely local repositories with no remotes.
   */
  readonly remoteUrl?: string;
  /** Default branch name if determinable (e.g. "main", "master"). */
  readonly defaultBranch?: string;
  /** Extra provider-specific metadata — keep this opaque. */
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// DiffLine
// ---------------------------------------------------------------------------

/** Discriminated type of a single line within a diff hunk. */
export type DiffLineKind = "added" | "removed" | "context";

/**
 * A single line inside a DiffHunk, with its kind and exact line numbers.
 *
 * Line numbers follow these rules:
 * - "added"   lines have newLine set, oldLine is undefined.
 * - "removed" lines have oldLine set, newLine is undefined.
 * - "context" lines have both oldLine and newLine set.
 *
 * Both are 1-based.
 */
export interface DiffLine {
  readonly kind: DiffLineKind;
  /** Raw content of the line, WITHOUT the leading +/-/space prefix. */
  readonly content: string;
  /** 1-based line number in the old file. Undefined for "added" lines. */
  readonly oldLine?: number;
  /** 1-based line number in the new file. Undefined for "removed" lines. */
  readonly newLine?: number;
}

// ---------------------------------------------------------------------------
// DiffHunk
// ---------------------------------------------------------------------------

/**
 * A single contiguous changed block inside a file diff.
 * Mirrors the @@ -a,b +c,d @@ structure from unified diffs.
 */
export interface DiffHunk {
  /**
   * Raw unified-diff header for this hunk.
   * Example: "@@ -10,6 +10,8 @@ function authorise(user: User)"
   */
  readonly header: string;
  /** 1-based line number in the old file where this hunk begins. */
  readonly oldStart: number;
  /** Number of lines from the old file included in the hunk. */
  readonly oldLines: number;
  /** 1-based line number in the new file where this hunk begins. */
  readonly newStart: number;
  /** Number of lines in the new file included in the hunk. */
  readonly newLines: number;
  /**
   * Full text of the hunk including context, additions (+) and deletions (-).
   * Preserves the original diff format for downstream consumers.
   */
  readonly body: string;
  /**
   * Parsed lines of the hunk with their kind and line numbers.
   * Downstream consumers should prefer this over re-parsing `body`.
   */
  readonly lines: readonly DiffLine[];
}

// ---------------------------------------------------------------------------
// FileStatus
// ---------------------------------------------------------------------------

/** Normalised file-change status. */
export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";

// ---------------------------------------------------------------------------
// ChangedFile
// ---------------------------------------------------------------------------

/**
 * Represents one file that was changed as part of a ChangeSet.
 */
export interface ChangedFile {
  /** File path relative to the repository root in the head revision. */
  readonly path: string;
  /**
   * Previous path, only present when status is "renamed" or "copied".
   * Undefined for all other statuses.
   */
  readonly previousPath?: string;
  /** Normalised change status. */
  readonly status: FileStatus;
  /** Number of lines added in this file. Undefined if not available (e.g. binary). */
  readonly additions?: number;
  /** Number of lines deleted in this file. Undefined if not available (e.g. binary). */
  readonly deletions?: number;
  /** Whether the file is detected as binary (no text diff available). */
  readonly isBinary: boolean;
  /** Parsed diff hunks for this file. Empty array when isBinary is true. */
  readonly hunks: readonly DiffHunk[];
}

// ---------------------------------------------------------------------------
// EvidenceSnippet
// ---------------------------------------------------------------------------

/**
 * The structural kind of construct the snippet was extracted from.
 * Used for routing — not a semantic conclusion.
 *
 * - "function"      A function or method declaration/body.
 * - "type-decl"     An interface, type alias, class, or enum declaration.
 * - "constant"      A const/let/var, enum member, or named constant.
 * - "route"         An API route registration or handler signature.
 * - "diff-context"  Raw diff hunk lines — fallback when richer extraction is
 *                   not safe or not applicable.
 * - "unknown"       Source type could not be determined.
 */
export type EvidenceSourceType =
  | "function"
  | "type-decl"
  | "constant"
  | "route"
  | "diff-context"
  | "unknown";

/**
 * How the snippet relates to the diff.
 *
 * - "added"           Lines present only in the new version.
 * - "removed"         Lines present only in the old version.
 * - "context"         Unchanged lines immediately surrounding a change.
 * - "surrounding"     Lines outside the diff window that provide structural
 *                     context (e.g. the function signature for a changed body).
 */
export type EvidenceDiffRelation =
  | "added"
  | "removed"
  | "context"
  | "surrounding";

/**
 * A targeted excerpt of code or text extracted for a specific purpose.
 * Used to attach relevant context to a ChangeSet for downstream Bob agents
 * without embedding the entire file content.
 *
 * INVARIANTS:
 * - Does NOT carry semantic conclusions.
 * - Line numbers are never fabricated: when unknown they must be omitted via
 *   the sentinel value 0 (zero is never a valid 1-based line number).
 * - Content preserves the original source text exactly.
 */
export interface EvidenceSnippet {
  /** Stable unique identifier for this snippet (deterministic hash or UUID). */
  readonly id: string;
  /** The ID of the ChangeSet this snippet belongs to. */
  readonly changeSetId: string;
  /** Path of the file this snippet was extracted from. */
  readonly filePath: string;
  /**
   * Structural kind of the extracted construct.
   * Never a semantic conclusion — only describes the code shape.
   */
  readonly sourceType: EvidenceSourceType;
  /**
   * Relation to the diff that triggered this snippet's extraction.
   */
  readonly diffRelation: EvidenceDiffRelation;
  /**
   * 1-based start line in the HEAD version of the file.
   * 0 when the line number is genuinely unknown (e.g. diff-only fallback
   * from a file that has been deleted).
   */
  readonly startLine: number;
  /**
   * 1-based end line in the HEAD version of the file (inclusive).
   * 0 when unknown.
   */
  readonly endLine: number;
  /** The raw source text of the excerpt. Never modified or summarised. */
  readonly content: string;
  /**
   * Human-readable label for the snippet within its sourceType.
   * Examples: "function authorise", "interface UserRole", "const ROLE".
   * Purely informational — not a semantic conclusion.
   */
  readonly label?: string;
}

// ---------------------------------------------------------------------------
// IngestionWarning
// ---------------------------------------------------------------------------

/**
 * A non-fatal issue encountered during ingestion.
 * Warnings do not abort the process; they are collected and surfaced
 * so downstream consumers can decide how to handle incomplete data.
 */
export type IngestionWarningCode =
  | "BINARY_FILE_SKIPPED"
  | "DIFF_PARSE_ERROR"
  | "EVIDENCE_EXTRACTION_FAILED"
  | "STAT_UNAVAILABLE"
  | "REF_NOT_FOUND"
  | "TRUNCATED_DIFF"
  | "UNKNOWN";

export interface IngestionWarning {
  readonly code: IngestionWarningCode;
  /** Human-readable description of the issue. */
  readonly message: string;
  /** File path this warning relates to, when applicable. */
  readonly filePath?: string;
}

// ---------------------------------------------------------------------------
// BranchComparison
// ---------------------------------------------------------------------------

/**
 * High-level metadata about a two-ref comparison before full diff data
 * is loaded. Useful for cheap pre-flight checks and UI summaries.
 */
export interface BranchComparison {
  readonly repository: RepositoryDescriptor;
  readonly baseRef: GitRef;
  readonly headRef: GitRef;
  /**
   * Merge-base commit SHA between baseRef and headRef.
   * Undefined when the refs share no common ancestor.
   */
  readonly mergeBase?: string;
  /** Total number of commits reachable from headRef but not baseRef. */
  readonly aheadBy?: number;
  /** Total number of commits reachable from baseRef but not headRef. */
  readonly behindBy?: number;
  readonly capturedAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// ChangeSet
// ---------------------------------------------------------------------------

/**
 * The central evidence unit produced by an ingestion run.
 *
 * A ChangeSet is a complete, self-contained description of what changed
 * between two refs. It contains facts only — no semantic conclusions.
 *
 * Downstream consumers (Bob agents, conflict-detection, UI) read from this
 * type. The shape is intentionally stable so adding a new provider (e.g.
 * GitHubPRSource) does not require changes in consumers.
 */
export interface ChangeSet {
  /** Globally unique identifier for this ingestion run (UUID v4). */
  readonly id: string;
  /** Human-readable title for the change, if provided by the caller. */
  readonly title?: string;
  /** Which provider and refs produced this ChangeSet. */
  readonly source: ChangeSource;
  /** Description of the repository. */
  readonly repository: RepositoryDescriptor;
  /**
   * The merge-base commit SHA between baseRef and headRef.
   * Undefined when refs share no common ancestor (e.g. orphan branches)
   * or when ingesting working-tree changes.
   */
  readonly mergeBase?: string;
  /**
   * Optional human-readable summary of what was changed.
   * This field is intended for caller-supplied descriptions
   * (e.g. a PR title, a task description).
   * It MUST NOT contain AI-generated semantic conclusions.
   */
  readonly summary?: string;
  /** All files that differ between baseRef and headRef. */
  readonly changedFiles: readonly ChangedFile[];
  /** Total additions across all changed files. */
  readonly totalAdditions: number;
  /** Total deletions across all changed files. */
  readonly totalDeletions: number;
  /**
   * Evidence snippets collected during ingestion.
   * Initially empty; enriched by callers or higher-level pipeline stages.
   */
  readonly evidenceSnippets: readonly EvidenceSnippet[];
  /** Non-fatal issues encountered during ingestion. */
  readonly warnings: readonly IngestionWarning[];
  /** When this ChangeSet was captured (ISO-8601). */
  readonly capturedAt: ISOTimestamp;
}

// ---------------------------------------------------------------------------
// Summary models
// ---------------------------------------------------------------------------

/**
 * Coarse language / file-type category derived from the file extension.
 * Used only for grouping and routing — not a semantic conclusion.
 */
export type FileLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "csharp"
  | "ruby"
  | "php"
  | "graphql"
  | "prisma"
  | "sql"
  | "json"
  | "yaml"
  | "toml"
  | "markdown"
  | "shell"
  | "dockerfile"
  | "config"
  | "test"      // test file regardless of base language
  | "unknown";

/**
 * Structural priority hint for downstream analyzers.
 *
 * Based purely on observable structural impact — NOT on business semantics.
 * Values trace back to specific file categories and diff volumes.
 *
 * - "high"   Type declarations, API routes, auth/security paths, schemas touched.
 * - "medium" Logic files, services, utilities with moderate diff volume.
 * - "low"    Test-only changes, documentation, configuration with small diffs.
 */
export type AnalysisPriority = "high" | "medium" | "low";

/**
 * Reason codes that explain why a particular AnalysisPriority was assigned.
 * Every reason traces to an observable structural fact.
 */
export type PriorityReason =
  | "type-declarations-changed"
  | "api-routes-changed"
  | "auth-or-security-path"
  | "schema-file-changed"
  | "exports-changed"
  | "imports-changed"
  | "high-diff-volume"
  | "test-only-changes"
  | "config-only-changes"
  | "documentation-only"
  | "low-diff-volume";

// ---------------------------------------------------------------------------
// FileSummary
// ---------------------------------------------------------------------------

/**
 * Structured metadata for a single changed file.
 *
 * Every field traces back to the file path, diff hunks, or evidence snippets.
 * No field contains a semantic conclusion.
 */
export interface FileSummary {
  /** Repository-relative file path (HEAD version). */
  readonly filePath: string;
  /** Normalised change status from the diff. */
  readonly fileStatus: FileStatus;
  /** Detected language / file-type category. */
  readonly language: FileLanguage;
  /** True when the file is identified as a test file. */
  readonly isTestFile: boolean;
  /** True when the file is identified as a configuration file. */
  readonly isConfigFile: boolean;
  /**
   * Symbol names touched by the diff (functions, classes, interfaces, enums,
   * constants) derived from evidence snippets or pattern scanning.
   * Sorted and deduplicated. Empty when undetectable.
   */
  readonly touchedSymbols: readonly string[];
  /**
   * Import/dependency names that were added or removed.
   * Derived from added/removed lines matching import patterns.
   * Empty when undetectable.
   */
  readonly changedImports: readonly string[];
  /**
   * Top-level exported names that were added or removed.
   * Derived from added/removed lines matching export patterns.
   * Empty when undetectable.
   */
  readonly changedExports: readonly string[];
  /**
   * Schema, type, or constant names touched (interfaces, type aliases, enums,
   * const declarations found in added/removed lines).
   * Empty when undetectable.
   */
  readonly touchedSchemaNames: readonly string[];
  /** Net line additions in this file. Undefined for binary files. */
  readonly additions?: number;
  /** Net line deletions in this file. Undefined for binary files. */
  readonly deletions?: number;
}

// ---------------------------------------------------------------------------
// RepositorySummary
// ---------------------------------------------------------------------------

/**
 * Repository-level technical summary of a ChangeSet.
 *
 * Aggregates across all FileSummary entries. All counts and lists are
 * deterministic and traceable to specific files or hunks.
 *
 * MUST NOT contain semantic conclusions such as "breaks auth" or
 * "conflicts with billing". Those belong to the semantic engine.
 */
export interface RepositorySummary {
  /** The ID of the ChangeSet this summary was computed from. */
  readonly changeSetId: string;
  /** Total number of changed files (including binary and renamed). */
  readonly totalFiles: number;
  /** Total line additions across all text files. */
  readonly totalAdditions: number;
  /** Total line deletions across all text files. */
  readonly totalDeletions: number;
  /**
   * Top-level directories that contain at least one changed file.
   * Sorted alphabetically.
   * Example: ["src/auth", "src/billing", "tests"]
   */
  readonly touchedDirectories: readonly string[];
  /**
   * Distinct language categories present in the changed files.
   * Sorted alphabetically.
   */
  readonly languages: readonly FileLanguage[];
  /**
   * All symbol names touched across every changed file.
   * Deduplicated and sorted. Empty when none detected.
   */
  readonly allTouchedSymbols: readonly string[];
  /**
   * All import/dependency names changed across every changed file.
   * Deduplicated and sorted.
   */
  readonly allChangedImports: readonly string[];
  /**
   * All exported names changed across every changed file.
   * Deduplicated and sorted.
   */
  readonly allChangedExports: readonly string[];
  /**
   * All schema/type/constant names touched across every changed file.
   * Deduplicated and sorted.
   */
  readonly allTouchedSchemaNames: readonly string[];
  /** Number of files identified as test files. */
  readonly testFileCount: number;
  /** Number of files identified as configuration files. */
  readonly configFileCount: number;
  /** Number of EvidenceSnippet records in the source ChangeSet. */
  readonly evidenceSnippetCount: number;
  /** Number of IngestionWarning records in the source ChangeSet. */
  readonly warningCount: number;
  /**
   * Structural analysis priority for this change.
   * Derived from observable file categories and diff volumes only.
   */
  readonly analysisPriority: AnalysisPriority;
  /**
   * Ordered list of reasons that justify the assigned analysisPriority.
   * Each reason traces to a specific observable fact.
   */
  readonly priorityReasons: readonly PriorityReason[];
  /** Per-file summaries, sorted by filePath. */
  readonly files: readonly FileSummary[];
}

// ---------------------------------------------------------------------------
// Semantic Analysis Payload models
// ---------------------------------------------------------------------------

/**
 * A human-readable label identifying one branch or agent task that produced
 * a set of changes. Used when multiple ChangeSets are packaged together.
 *
 * Example: { id: "auth-agent", description: "Authentication refactor on branch feature/auth" }
 */
export interface SourceLabel {
  /**
   * Short machine-readable identifier for the branch / agent task.
   * Must be unique within a single SemanticAnalysisInput.
   */
  readonly id: string;
  /** Human-readable description. */
  readonly description?: string;
  /** The Git ref this label corresponds to, when known. */
  readonly ref?: GitRef;
}

/**
 * Warning codes specific to payload assembly and size enforcement.
 */
export type PayloadTruncationCode =
  | "SNIPPET_BUDGET_EXCEEDED"   // some snippets were dropped to stay within budget
  | "REQUIREMENT_TRUNCATED"     // requirement text was longer than maxRequirementChars
  | "FILE_SUMMARY_OMITTED"      // low-priority file summaries omitted to reduce size
  | "DIFF_BODY_STRIPPED";       // raw hunk bodies removed from payload to save space

export interface PayloadTruncationWarning {
  readonly code: PayloadTruncationCode;
  readonly message: string;
  /** Number of items dropped, when applicable. */
  readonly droppedCount?: number;
  /** File path the truncation applies to, when applicable. */
  readonly filePath?: string;
}

/**
 * Options controlling how the payload is assembled and trimmed.
 */
export interface PayloadBuildOptions {
  /**
   * Maximum UTF-16 character length for the requirement text.
   * Requirement is hard-truncated at this limit with a warning appended.
   * Default: 8_000.
   */
  maxRequirementChars?: number;
  /**
   * Maximum total number of EvidenceSnippets to include across all ChangeSets.
   * High-priority snippets (type-decl, function, route) are kept first.
   * Default: 200.
   */
  maxSnippets?: number;
  /**
   * Maximum number of FileSummary entries to include.
   * Files with higher structural priority are kept first.
   * Default: 100.
   */
  maxFileSummaries?: number;
  /**
   * When true, strip the raw `body` and `lines` fields from DiffHunks to
   * reduce payload size. The hunk header (position information) is always
   * preserved. Default: false.
   */
  stripDiffBodies?: boolean;
}

// ---------------------------------------------------------------------------
// SemanticAnalysisInput
// ---------------------------------------------------------------------------

/**
 * The complete, self-contained handoff payload from the ingestion layer to
 * MergeMind's semantic engine (Awsemy).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW THE SEMANTIC ENGINE SHOULD CONSUME THIS PAYLOAD
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. START WITH THE REQUIREMENT
 *    `requirement` is the ground truth for all analysis.
 *    Every conflict or assumption the engine identifies must be tested
 *    against this text.  If `requirement` is empty the engine should
 *    note this in its output and reduce confidence accordingly.
 *
 * 2. ITERATE OVER changeSets
 *    Each entry in `changeSets` represents one independently developed
 *    set of changes (one branch, one agent task).  The engine should
 *    treat each ChangeSet as a separate "voice" and later compare them.
 *
 * 3. USE evidenceSnippets AS PRIMARY EVIDENCE
 *    Snippets are pre-filtered, deduplicated, and capped.  They contain
 *    the source constructs most likely to be relevant to the requirement.
 *    The engine should anchor its assumption extraction to snippet content
 *    rather than re-reading raw diff bodies.
 *    Field mapping:
 *      snippet.sourceType       → what kind of construct this is
 *      snippet.diffRelation     → whether the code was added, removed,
 *                                 or is surrounding context
 *      snippet.label            → short name of the construct
 *      snippet.content          → verbatim source text to analyse
 *      snippet.changeSetId      → links back to the originating ChangeSet
 *
 * 4. USE repositorySummary FOR SCOPE
 *    `repositorySummary` gives the engine a fast overview:
 *      - which directories were touched
 *      - which languages are present
 *      - which symbols, exports, and imports changed
 *      - structural priority (high/medium/low) and the reasons behind it
 *    Use this to decide how deeply to analyse each area.
 *
 * 5. RESPECT TRUNCATION WARNINGS
 *    `truncationWarnings` lists everything that was dropped or shortened
 *    to fit within payload limits.  High-priority evidence is never dropped
 *    silently — if something was omitted it appears here.
 *    The engine should surface these warnings in its output so the caller
 *    knows the analysis may be incomplete.
 *
 * 6. USE sourceLabels TO NAME THE AGENTS/BRANCHES
 *    `sourceLabels` maps a ChangeSet's source ref to a human-readable name
 *    such as "Authentication Agent" or "feature/org-billing".  Use these
 *    labels when describing which branch or agent introduced an assumption.
 *
 * 7. DO NOT INVENT EVIDENCE
 *    The engine must only draw conclusions from content present in this
 *    payload.  If a file or symbol is not represented in `evidenceSnippets`
 *    or `repositorySummary`, the engine must not speculate about it.
 *
 * 8. OUTPUT FORMAT CONTRACT
 *    The engine's output should reference:
 *      - `payloadId`       (to correlate findings with this specific payload)
 *      - snippet `id`s     (to cite the exact evidence behind each finding)
 *      - `changeSetId`s    (to attribute findings to the right branch)
 *    This contract enables the UI to highlight exact source locations.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * INVARIANTS (must hold for every valid payload):
 *   - No field contains a semantic conclusion.
 *   - No AI-provider-specific fields or prompt templates.
 *   - All arrays are sorted deterministically.
 *   - payloadId is a UUID v4 that uniquely identifies this assembly run.
 *   - assembledAt is the ISO-8601 timestamp of assembly, not of ingestion.
 */
export interface SemanticAnalysisInput {
  /**
   * Stable UUID v4 that uniquely identifies this payload assembly.
   * Use this to correlate the engine's findings back to the payload.
   */
  readonly payloadId: string;

  /** ISO-8601 timestamp when this payload was assembled. */
  readonly assembledAt: ISOTimestamp;

  /**
   * Schema version for forward-compatibility.
   * Increment the minor version when fields are added.
   * Increment the major version when fields are removed or renamed.
   * Current value: "1.0".
   */
  readonly schemaVersion: string;

  // ── Requirement ────────────────────────────────────────────────────────

  /**
   * The original feature/task requirement supplied by the caller.
   * This is the reference point for all assumption extraction.
   *
   * May be empty string when the caller did not provide a requirement.
   * May be truncated when longer than `PayloadBuildOptions.maxRequirementChars`;
   * a REQUIREMENT_TRUNCATED warning is added in that case.
   */
  readonly requirement: string;

  /**
   * Optional short title for the requirement (e.g. PR title or task name).
   * Not used for analysis — only for display.
   */
  readonly requirementTitle?: string;

  // ── Change data ─────────────────────────────────────────────────────────

  /**
   * All ChangeSets included in this payload.
   * Typically one per branch or agent task.
   * Sorted by changeSet.id for determinism.
   *
   * NOTE: DiffHunk.body and .lines may be stripped when
   * PayloadBuildOptions.stripDiffBodies is true.
   */
  readonly changeSets: readonly ChangeSet[];

  /**
   * Evidence snippets drawn from all ChangeSets.
   * Capped at PayloadBuildOptions.maxSnippets.
   * Sorted by: filePath → startLine → id.
   * High-priority sourceTypes (type-decl, function, route) are kept when
   * the budget is exceeded; diff-context snippets are dropped first.
   */
  readonly evidenceSnippets: readonly EvidenceSnippet[];

  /**
   * Repository-level technical summary covering all ChangeSets.
   * The engine should use this for scope assessment before diving into snippets.
   */
  readonly repositorySummary: RepositorySummary;

  // ── Metadata ────────────────────────────────────────────────────────────

  /**
   * Human-readable labels for each branch or agent task.
   * Keyed by the source ref (branch name or commit SHA) of each ChangeSet.
   * The engine should use these labels when attributing findings.
   */
  readonly sourceLabels: readonly SourceLabel[];

  /**
   * All IngestionWarnings from every ChangeSet, deduplicated by message.
   * The engine should surface these in its output when they may affect
   * analysis completeness.
   */
  readonly ingestionWarnings: readonly IngestionWarning[];

  /**
   * Warnings produced during payload assembly (size enforcement, truncation).
   * The engine MUST surface these — they indicate evidence that was dropped.
   */
  readonly truncationWarnings: readonly PayloadTruncationWarning[];
}
