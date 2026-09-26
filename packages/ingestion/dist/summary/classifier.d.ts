/**
 * classifier.ts — deterministic file classification utilities.
 *
 * Maps file paths and diff statistics to FileLanguage, test/config flags,
 * and directory groupings. No semantic conclusions are made here.
 */
import type { AnalysisPriority, FileLanguage, FileSummary, PriorityReason } from "../models/index.js";
/**
 * Detect the file language from its path.
 */
export declare function detectLanguage(filePath: string): FileLanguage;
/**
 * Returns true when the file looks like a test file.
 */
export declare function isTestFile(filePath: string): boolean;
/**
 * Returns true when the file looks like a configuration file.
 */
export declare function isConfigFile(filePath: string): boolean;
/**
 * Returns true when the file path contains auth/security indicators.
 */
export declare function isAuthOrSecurityPath(filePath: string): boolean;
/**
 * Extract the top-level directory from a repository-relative file path.
 *
 * Examples:
 *   "src/auth/roles.ts"        → "src/auth"
 *   "tests/auth.test.ts"       → "tests"
 *   "package.json"             → "."
 */
export declare function topDirectory(filePath: string): string;
/**
 * Collect unique top-level directories from a list of file paths.
 * Returns a sorted array.
 */
export declare function collectDirectories(filePaths: readonly string[]): string[];
interface PriorityInput {
    files: readonly FileSummary[];
    totalAdditions: number;
    totalDeletions: number;
    evidenceSnippetCount: number;
}
/**
 * Compute the structural AnalysisPriority and explanatory PriorityReason list
 * from observable metadata only.
 *
 * Rules (evaluated top-to-bottom, first match wins for priority, all
 * applicable reasons are collected):
 *
 * HIGH triggers:
 *   - Any file touches type declarations (type-decl snippets or schema names)
 *   - Any file touches API routes
 *   - Any file is on an auth/security path
 *   - Any schema file is modified
 *
 * MEDIUM triggers (default when any non-trivial code change, no HIGH):
 *   - Exports or imports changed
 *   - High total diff volume (≥ threshold)
 *
 * LOW:
 *   - All changes are in test files only
 *   - All changes are in config files only
 *   - All changes are in documentation only
 *   - Very small diff volume
 */
export declare function computePriority(input: PriorityInput): {
    priority: AnalysisPriority;
    reasons: PriorityReason[];
};
export declare function sortedUnique(items: string[]): string[];
export {};
//# sourceMappingURL=classifier.d.ts.map