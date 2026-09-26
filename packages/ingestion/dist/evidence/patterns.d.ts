/**
 * patterns.ts — line-level structural pattern recognition for TypeScript/JavaScript.
 *
 * Every exported function operates on a single LINE of source text (string).
 * No AST is used; these are conservative regex patterns intended to avoid
 * false positives. When in doubt, return null rather than a wrong label.
 *
 * These patterns are used by the extractor to identify construct boundaries.
 * They MUST NOT interpret business meaning — they only detect code shapes.
 */
import type { EvidenceSourceType } from "../models/index.js";
export interface LineClassification {
    /** The coarse structural type of the construct starting on this line. */
    sourceType: EvidenceSourceType;
    /**
     * Short label derived from the line.
     * Example: "function authorise", "interface UserRole", "const ROLE".
     */
    label: string;
    /**
     * True when this line appears to open a block (ends with `{` or `=>`
     * followed by `{`), meaning the extractor should try to find the
     * matching closing brace.
     */
    opensBlock: boolean;
}
/**
 * Attempt to classify the structural type of a source line.
 *
 * Returns null when the line does not match any known construct pattern,
 * which means the extractor should treat it as plain diff-context.
 *
 * Patterns are intentionally conservative — they match common, unambiguous
 * forms only. Unusual or multi-line signatures are handled by the
 * diff-context fallback.
 */
export declare function classifyLine(line: string): LineClassification | null;
/**
 * Given an array of source lines and the 0-based index of an opening line,
 * return the 0-based index of the matching closing brace.
 *
 * Uses a simple brace counter — sufficient for the constructs we care about.
 * Returns null when no matching close is found within maxLines.
 */
export declare function findBlockEnd(lines: string[], startIdx: number, maxLines?: number): number | null;
/**
 * Returns true when the file path looks like TypeScript or JavaScript.
 * Used to gate pattern-based extraction.
 */
export declare function isTsJsFile(filePath: string): boolean;
/**
 * Returns true when the file path looks like a schema / data-model file.
 * (JSON Schema, Prisma, GraphQL SDL, etc.)
 */
export declare function isSchemaFile(filePath: string): boolean;
//# sourceMappingURL=patterns.d.ts.map