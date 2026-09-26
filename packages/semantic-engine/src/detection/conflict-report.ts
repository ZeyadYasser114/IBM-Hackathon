/**
 * conflict-report.ts
 *
 * ConflictReport — the UI-ready output shape for prompt 5.
 *
 * This is the public contract between the semantic engine and any consumer
 * (UI, API route, CI check, AI agent).  It is designed so the consumer
 * needs zero knowledge of internal types like NormalizedAssumption or
 * ClassificationResult.
 *
 * All fields are plain serializable values (strings, enums, arrays).
 * The shape can be round-tripped through JSON without loss.
 */

import { ConflictType, Severity, Confidence } from "../types/enums";
import { EvidenceReference } from "../types/evidence";

// ---------------------------------------------------------------------------
// EvidenceSide
// ---------------------------------------------------------------------------

/**
 * One side of a conflict — what one change/component asserts, backed by
 * its exact source evidence.
 */
export interface EvidenceSide {
  /**
   * Human-readable label for the source of this side.
   * Example: "auth/roles.ts", "billing agent", "requirement".
   */
  readonly sourceLabel: string;

  /**
   * The assumption's natural-language statement.
   * Example: "The privileged role is 'owner'."
   */
  readonly statement: string;

  /**
   * The canonical predicate that was compared.
   * Example: "required_role = owner"
   */
  readonly canonicalPredicate: string;

  /** The verbatim evidence text, never modified. */
  readonly evidenceText: string;

  /** Repository-relative file path, when known. */
  readonly filePath?: string;

  /** The structured evidence references for this side. */
  readonly evidenceReferences: readonly EvidenceReference[];
}

// ---------------------------------------------------------------------------
// ConflictReport
// ---------------------------------------------------------------------------

/**
 * A fully self-contained, human-readable conflict finding.
 *
 * Designed for direct consumption by a UI, a PR comment generator,
 * a CI failure report, or an AI agent — without any further processing.
 */
export interface ConflictReport {
  /** Stable unique identifier for this conflict. */
  readonly id: string;

  /**
   * Concise one-line title suitable for a heading or alert banner.
   * Example: "Authorization contradiction on user_role"
   */
  readonly title: string;

  /** The conflict class. */
  readonly conflictType: ConflictType;

  /**
   * The normalized entity at the center of the conflict.
   * Example: "user_role", "api_response_field", "email"
   */
  readonly affectedEntity: string;

  /**
   * What assumption A (the left side) says.
   * This is typically the requirement or the first change encountered.
   */
  readonly assumptionA: EvidenceSide;

  /**
   * What assumption B (the right side) says.
   * This is typically the conflicting change.
   */
  readonly assumptionB: EvidenceSide;

  /**
   * Why these two assumptions cannot both be true at the same time.
   * Written in plain developer language, referencing the actual values.
   */
  readonly whyIncompatible: string;

  /** Assessed severity of this conflict if deployed to production. */
  readonly severity: Severity;

  /** How confident the engine is that this is a real conflict. */
  readonly confidence: Confidence;

  /**
   * The named rule that determined severity.
   * Allows developers to understand and challenge the ruling.
   * Example: "BUSINESS_RULE:auth_contradiction"
   */
  readonly severityRule: string;

  /**
   * The named rule that determined confidence.
   * Example: "direct_contradiction_with_file_evidence"
   */
  readonly confidenceRule: string;

  /**
   * All files directly implicated by this conflict.
   * Empty array when no file paths were available.
   */
  readonly affectedFiles: readonly string[];

  /**
   * All deduplicated evidence references from both sides.
   */
  readonly allEvidenceReferences: readonly EvidenceReference[];

  /**
   * What a developer should inspect or test next to verify or resolve
   * this conflict.  Concrete and actionable.
   */
  readonly verificationHint: string;

  /** ISO-8601 timestamp of when this report was generated. */
  readonly detectedAt: string;
}
