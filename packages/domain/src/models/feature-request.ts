/**
 * feature-request.ts
 *
 * Represents the developer's original intent as provided at the top of a
 * MergeMind verification run.  This is the single source of truth for *what*
 * was requested; all analysis agents and conflict detectors refer back to it.
 *
 * Serialization notes
 * -------------------
 * - All fields are plain JSON-safe primitives.
 * - `id` is always a UUID v4 string — never auto-generated here; callers supply it.
 * - `acceptanceCriteria` and `tags` default to empty arrays when absent; omitting
 *   them from JSON is valid and must deserialize to `[]`.
 */

import type { Id, ISODateString } from '../primitives.js';

/**
 * A single verifiable acceptance criterion extracted from the feature request.
 * Structured separately so agents can attach evidence to individual criteria.
 */
export type AcceptanceCriterion = {
  /**
   * Short unique key within this request, e.g. "AC-1".
   * Used to cross-reference evidence and coverage reports.
   */
  key: string;
  /** Human-readable description of the criterion, e.g. "Only owners can cancel subscriptions." */
  description: string;
};

/**
 * The developer's feature request as it enters the MergeMind pipeline.
 *
 * Design intent: this type is intentionally kept minimal and human-authored.
 * It should never be machine-generated — agents read it, not write it.
 */
export type FeatureRequest = {
  /** UUID v4 — must be stable across retries of the same logical request */
  id: Id;
  /**
   * Short title of the request for display in the UI and audit logs.
   * Example: "Add organization billing"
   */
  title: string;
  /**
   * Full free-text description authored by the developer or product team.
   * This is the primary input to the Intent Agent.
   */
  description: string;
  /**
   * Structured acceptance criteria derived (manually or by an agent) from the
   * description.  The Intent Agent MUST populate this field; it starts empty
   * when the request first enters the system.
   */
  acceptanceCriteria: AcceptanceCriterion[];
  /**
   * Explicit business rules extracted from the description.
   * One rule = one independently falsifiable statement.
   * Example: "Only organization owners can manage subscriptions."
   */
  rules: string[];
  /**
   * Free-form labels for routing, filtering, and metrics.
   * Example: ["billing", "permissions", "multi-tenant"]
   */
  tags: string[];
  /** When the request was submitted to the system (ISO-8601 UTC) */
  createdAt: ISODateString;
  /**
   * The user or system identity that submitted this request.
   * Stored for audit purposes; not used in analysis logic.
   */
  submittedBy: string;
};
