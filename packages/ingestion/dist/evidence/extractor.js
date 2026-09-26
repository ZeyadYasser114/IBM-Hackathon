"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractEvidence = extractEvidence;
const node_crypto_1 = require("node:crypto");
const patterns_js_1 = require("./patterns.js");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_MAX_SNIPPET_LINES = 60;
const DEFAULT_DIFF_CONTEXT_LINES = 5;
// ---------------------------------------------------------------------------
// Snippet ID generation
// ---------------------------------------------------------------------------
/**
 * Produce a stable, deterministic ID for a snippet.
 * Uses a short SHA-256 prefix over the defining fields so the same code
 * fragment always gets the same ID across runs.
 */
function snippetId(changeSetId, filePath, startLine, content) {
    const hash = (0, node_crypto_1.createHash)("sha256")
        .update(`${changeSetId}:${filePath}:${startLine}:${content}`)
        .digest("hex")
        .slice(0, 16);
    return `snip-${hash}`;
}
// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------
/**
 * Two snippets overlap when they share the same file path AND their line
 * ranges intersect.  When two snippets overlap we keep the one with broader
 * context (larger range) and prefer the richer sourceType.
 *
 * Source-type priority (higher index = prefer to keep):
 *   diff-context < unknown < constant < route < function < type-decl
 */
const SOURCE_TYPE_PRIORITY = {
    "diff-context": 0,
    "unknown": 1,
    "constant": 2,
    "route": 3,
    "function": 4,
    "type-decl": 5,
};
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    // Treat line 0 (unknown) as non-overlapping with real ranges.
    if (aStart === 0 || bStart === 0)
        return false;
    return aStart <= bEnd && bStart <= aEnd;
}
function deduplicateSnippets(snippets) {
    // Group by file path then sweep for overlaps.
    const byFile = new Map();
    for (const s of snippets) {
        const list = byFile.get(s.filePath) ?? [];
        list.push(s);
        byFile.set(s.filePath, list);
    }
    const result = [];
    for (const [, group] of byFile) {
        // Sort by startLine ascending, then by priority descending so the
        // "winner" of an overlap comparison is the first one we encounter.
        const sorted = [...group].sort((a, b) => {
            if (a.startLine !== b.startLine)
                return a.startLine - b.startLine;
            return SOURCE_TYPE_PRIORITY[b.sourceType] - SOURCE_TYPE_PRIORITY[a.sourceType];
        });
        const kept = [];
        for (const candidate of sorted) {
            let dominated = false;
            for (const existing of kept) {
                if (!rangesOverlap(candidate.startLine, candidate.endLine, existing.startLine, existing.endLine)) {
                    continue;
                }
                // They overlap. Keep the one with the richer sourceType; if equal,
                // keep the broader range.
                const existingPri = SOURCE_TYPE_PRIORITY[existing.sourceType];
                const candidatePri = SOURCE_TYPE_PRIORITY[candidate.sourceType];
                if (candidatePri > existingPri) {
                    // Candidate wins — remove existing from kept, will add candidate.
                    const idx = kept.indexOf(existing);
                    kept.splice(idx, 1);
                }
                else if (candidatePri === existingPri) {
                    // Same priority — keep broader range.
                    const existingSpan = existing.endLine - existing.startLine;
                    const candidateSpan = candidate.endLine - candidate.startLine;
                    if (candidateSpan > existingSpan) {
                        const idx = kept.indexOf(existing);
                        kept.splice(idx, 1);
                    }
                    else {
                        dominated = true;
                        break;
                    }
                }
                else {
                    // Existing wins — skip candidate.
                    dominated = true;
                    break;
                }
            }
            if (!dominated)
                kept.push(candidate);
        }
        result.push(...kept);
    }
    // Final stable sort: file path → startLine → id (for ties).
    result.sort((a, b) => {
        const fp = a.filePath.localeCompare(b.filePath, undefined, { sensitivity: "base" });
        if (fp !== 0)
            return fp;
        if (a.startLine !== b.startLine)
            return a.startLine - b.startLine;
        return a.id.localeCompare(b.id);
    });
    return result;
}
// ---------------------------------------------------------------------------
// Diff-context fallback
// ---------------------------------------------------------------------------
/**
 * Build one EvidenceSnippet per hunk using the raw diff lines.
 * This is the safe fallback used when:
 * - The file is not TS/JS, or
 * - No structural pattern matched on any changed line.
 */
function diffContextSnippets(changeSetId, file, hunk, maxLines) {
    const snippets = [];
    // Collect added lines as one snippet, removed as another.
    const addedLines = hunk.lines.filter((l) => l.kind === "added");
    const removedLines = hunk.lines.filter((l) => l.kind === "removed");
    const contextLines = hunk.lines.filter((l) => l.kind === "context");
    // Helper to build a snippet from a group of DiffLines.
    const build = (lines, relation) => {
        if (lines.length === 0)
            return null;
        const relevant = lines.slice(0, maxLines);
        const content = relevant.map((l) => l.content).join("\n");
        const lineNumbers = relevant.map((l) => l.newLine ?? l.oldLine ?? 0).filter((n) => n > 0);
        const startLine = lineNumbers.length > 0 ? Math.min(...lineNumbers) : 0;
        const endLine = lineNumbers.length > 0 ? Math.max(...lineNumbers) : 0;
        return {
            id: snippetId(changeSetId, file.path, startLine, content),
            changeSetId,
            filePath: file.path,
            sourceType: "diff-context",
            diffRelation: relation,
            startLine,
            endLine,
            content,
        };
    };
    const added = build(addedLines, "added");
    if (added)
        snippets.push(added);
    const removed = build(removedLines, "removed");
    if (removed)
        snippets.push(removed);
    // Include context only when there are no structural snippets to avoid noise.
    if (snippets.length === 0 && contextLines.length > 0) {
        const ctx = build(contextLines, "context");
        if (ctx)
            snippets.push(ctx);
    }
    return snippets;
}
// ---------------------------------------------------------------------------
// TS/JS structural extraction
// ---------------------------------------------------------------------------
/**
 * Given the content of a file as an array of lines (0-indexed) and a set of
 * 1-based "touched" line numbers from the diff, extract structural snippets.
 *
 * Strategy:
 * 1. For each touched line, scan backwards to find the nearest construct
 *    opening above it (within a bounded window).
 * 2. Classify that opening line.
 * 3. If it opens a block, find the closing brace.
 * 4. Clamp the range to maxSnippetLines.
 * 5. Emit a snippet with the appropriate sourceType and diffRelation.
 */
function structuralSnippets(changeSetId, file, hunk, fileLines, maxLines) {
    const snippets = [];
    // Collect changed (non-context) new-side line numbers.
    const touchedNewLines = hunk.lines
        .filter((l) => l.kind !== "context")
        .map((l) => l.newLine ?? l.oldLine ?? 0)
        .filter((n) => n > 0);
    if (touchedNewLines.length === 0)
        return [];
    for (const touchedLine of touchedNewLines) {
        const touchedIdx = touchedLine - 1; // 0-based
        // Scan backwards up to 80 lines for a construct opener.
        const scanStart = Math.max(0, touchedIdx - 80);
        let openerIdx = null;
        let classification = null;
        for (let i = touchedIdx; i >= scanStart; i--) {
            const cl = (0, patterns_js_1.classifyLine)(fileLines[i] ?? "");
            if (cl) {
                openerIdx = i;
                classification = cl;
                break;
            }
        }
        if (openerIdx === null || classification === null)
            continue;
        // Find where this block ends.
        let endIdx;
        if (classification.opensBlock) {
            endIdx = (0, patterns_js_1.findBlockEnd)(fileLines, openerIdx, maxLines) ?? Math.min(openerIdx + maxLines - 1, fileLines.length - 1);
        }
        else {
            endIdx = openerIdx;
        }
        // Clamp to maxLines.
        if (endIdx - openerIdx + 1 > maxLines) {
            endIdx = openerIdx + maxLines - 1;
        }
        const startLine = openerIdx + 1; // back to 1-based
        const endLine = endIdx + 1;
        const content = fileLines.slice(openerIdx, endIdx + 1).join("\n");
        // Determine diffRelation from the hunk lines that fall inside this range.
        const hunkLinesInRange = hunk.lines.filter((l) => {
            const ln = l.newLine ?? l.oldLine ?? 0;
            return ln >= startLine && ln <= endLine;
        });
        const hasAdded = hunkLinesInRange.some((l) => l.kind === "added");
        const hasRemoved = hunkLinesInRange.some((l) => l.kind === "removed");
        let diffRelation;
        if (hasAdded && hasRemoved)
            diffRelation = "added"; // mixed — default to "added"
        else if (hasAdded)
            diffRelation = "added";
        else if (hasRemoved)
            diffRelation = "removed";
        else
            diffRelation = "surrounding";
        snippets.push({
            id: snippetId(changeSetId, file.path, startLine, content),
            changeSetId,
            filePath: file.path,
            sourceType: classification.sourceType,
            diffRelation,
            startLine,
            endLine,
            content,
            label: classification.label,
        });
    }
    return snippets;
}
// ---------------------------------------------------------------------------
// Per-file extraction
// ---------------------------------------------------------------------------
/**
 * Produce snippets for one changed file across all its diff hunks.
 *
 * If the file content is provided (headContent), attempts structural
 * extraction for TS/JS files. Otherwise falls back to diff-context only.
 */
function extractFromFile(changeSetId, file, headContent, options, warnings) {
    if (file.isBinary || file.hunks.length === 0)
        return [];
    const snippets = [];
    const fileLines = headContent ? headContent.split("\n") : undefined;
    const canExtractStructural = fileLines !== undefined && (0, patterns_js_1.isTsJsFile)(file.path);
    for (const hunk of file.hunks) {
        try {
            let hunkSnippets = [];
            if (canExtractStructural && fileLines) {
                hunkSnippets = structuralSnippets(changeSetId, file, hunk, fileLines, options.maxSnippetLines);
            }
            // Always add diff-context snippets when structural extraction yields nothing.
            if (hunkSnippets.length === 0) {
                hunkSnippets = diffContextSnippets(changeSetId, file, hunk, options.diffContextLines);
            }
            snippets.push(...hunkSnippets);
        }
        catch (err) {
            warnings.push({
                code: "EVIDENCE_EXTRACTION_FAILED",
                message: `Extraction failed for hunk in "${file.path}": ${String(err)}`,
                filePath: file.path,
            });
            // Fall back to diff-context for this hunk.
            snippets.push(...diffContextSnippets(changeSetId, file, hunk, options.diffContextLines));
        }
    }
    return snippets;
}
// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
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
function extractEvidence(changeSet, 
/**
 * Map of repository-relative file path → full HEAD file content (text).
 * Populate this for TS/JS files to enable structural extraction.
 * Files absent from the map fall back to diff-context extraction.
 */
headContents = new Map(), options = {}) {
    const opts = {
        maxSnippetLines: options.maxSnippetLines ?? DEFAULT_MAX_SNIPPET_LINES,
        diffContextLines: options.diffContextLines ?? DEFAULT_DIFF_CONTEXT_LINES,
    };
    const warnings = [];
    const allSnippets = [];
    for (const file of changeSet.changedFiles) {
        const headContent = headContents.get(file.path);
        const fileSnippets = extractFromFile(changeSet.id, file, headContent, opts, warnings);
        allSnippets.push(...fileSnippets);
    }
    const deduplicated = deduplicateSnippets(allSnippets);
    return { snippets: deduplicated, warnings };
}
//# sourceMappingURL=extractor.js.map