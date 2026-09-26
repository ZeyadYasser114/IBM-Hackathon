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
import type { ChangeSet, EvidenceSnippet, PayloadBuildOptions, SemanticAnalysisInput, SourceLabel } from "../models/index.js";
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
export declare function buildSemanticAnalysisInput(requirement: string, changeSets: readonly ChangeSet[], snippets: readonly EvidenceSnippet[], options?: PayloadBuildOptions & {
    sourceLabels?: SourceLabel[];
    requirementTitle?: string;
}): SemanticAnalysisInput;
//# sourceMappingURL=builder.d.ts.map