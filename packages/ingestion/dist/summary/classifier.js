"use strict";
/**
 * classifier.ts — deterministic file classification utilities.
 *
 * Maps file paths and diff statistics to FileLanguage, test/config flags,
 * and directory groupings. No semantic conclusions are made here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLanguage = detectLanguage;
exports.isTestFile = isTestFile;
exports.isConfigFile = isConfigFile;
exports.isAuthOrSecurityPath = isAuthOrSecurityPath;
exports.topDirectory = topDirectory;
exports.collectDirectories = collectDirectories;
exports.computePriority = computePriority;
exports.sortedUnique = sortedUnique;
// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------
/** Extension → language mapping. Order matters only for uniqueness. */
const EXT_MAP = [
    [/\.(ts|tsx|mts|cts)$/, "typescript"],
    [/\.(js|jsx|mjs|cjs)$/, "javascript"],
    [/\.py$/, "python"],
    [/\.go$/, "go"],
    [/\.rs$/, "rust"],
    [/\.java$/, "java"],
    [/\.(cs|csx)$/, "csharp"],
    [/\.rb$/, "ruby"],
    [/\.php$/, "php"],
    [/\.(graphql|gql)$/, "graphql"],
    [/\.prisma$/, "prisma"],
    [/\.(sql|psql)$/, "sql"],
    [/\.json$/, "json"],
    [/\.ya?ml$/, "yaml"],
    [/\.toml$/, "toml"],
    [/\.(md|mdx|rst)$/, "markdown"],
    [/\.(sh|bash|zsh|fish)$/, "shell"],
    [/^dockerfile$/i, "dockerfile"],
    [/dockerfile/i, "dockerfile"],
];
/** Path segments / name patterns that indicate a configuration file. */
const CONFIG_PATTERNS = [
    /\.(env|env\.\w+)$/,
    /\.(config|cfg|conf|ini)(\.\w+)?$/,
    /^\..*rc(\.\w+)?$/, // .eslintrc, .eslintrc.js, .babelrc, etc.
    /^jest\.config\./,
    /^vitest\.config\./,
    /^tsconfig/,
    /^package\.json$/,
    /^(?:webpack|rollup|vite|babel|prettier|eslint|stylelint)\.config\./,
    /^docker-compose/i,
    /(?:^|\/)\.github\//,
    /(?:^|\/)\.husky\//,
    /^Makefile$/,
];
/** Path segments / name patterns that indicate a test file. */
const TEST_PATTERNS = [
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/,
    /\/__tests__\//,
    /(?:^|\/)tests?\//, // matches "test/..." and "tests/..." at any depth
    /\.test$/,
    /\.spec$/,
];
/** Path segments indicating auth/security — raises priority. */
const AUTH_PATH_PATTERNS = [
    /(?:^|\/)auth\//i,
    /(?:^|\/)security\//i,
    /(?:^|\/)permissions?\//i,
    /(?:^|\/)roles?\//i,
    /(?:^|\/)access\//i,
    /(?:^|\/)middleware\//i,
    /auth\.(ts|js)$/i,
    /roles?\.(ts|js)$/i,
    /permissions?\.(ts|js)$/i,
    /guards?\.(ts|js)$/i,
];
/**
 * Detect the file language from its path.
 */
function detectLanguage(filePath) {
    const base = filePath.split("/").pop() ?? filePath;
    for (const [pattern, lang] of EXT_MAP) {
        if (pattern.test(base))
            return lang;
    }
    return "unknown";
}
/**
 * Returns true when the file looks like a test file.
 */
function isTestFile(filePath) {
    return TEST_PATTERNS.some((p) => p.test(filePath));
}
/**
 * Returns true when the file looks like a configuration file.
 */
function isConfigFile(filePath) {
    const base = filePath.split("/").pop() ?? filePath;
    return CONFIG_PATTERNS.some((p) => p.test(base) || p.test(filePath));
}
/**
 * Returns true when the file path contains auth/security indicators.
 */
function isAuthOrSecurityPath(filePath) {
    return AUTH_PATH_PATTERNS.some((p) => p.test(filePath));
}
// ---------------------------------------------------------------------------
// Directory grouping
// ---------------------------------------------------------------------------
/**
 * Extract the top-level directory from a repository-relative file path.
 *
 * Examples:
 *   "src/auth/roles.ts"        → "src/auth"
 *   "tests/auth.test.ts"       → "tests"
 *   "package.json"             → "."
 */
function topDirectory(filePath) {
    const parts = filePath.split("/");
    if (parts.length <= 1)
        return ".";
    // Use up to 2 path segments as the directory label for grouping.
    return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}
/**
 * Collect unique top-level directories from a list of file paths.
 * Returns a sorted array.
 */
function collectDirectories(filePaths) {
    const dirs = new Set(filePaths.map(topDirectory));
    return [...dirs].sort();
}
// ---------------------------------------------------------------------------
// Priority scoring
// ---------------------------------------------------------------------------
const HIGH_DIFF_VOLUME_THRESHOLD = 200; // lines changed across the whole set
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
function computePriority(input) {
    const reasons = [];
    const totalLines = input.totalAdditions + input.totalDeletions;
    const nonBinary = input.files.filter((f) => f.additions !== undefined || f.deletions !== undefined);
    const allTest = nonBinary.length > 0 && nonBinary.every((f) => f.isTestFile);
    const allConfig = nonBinary.length > 0 && nonBinary.every((f) => f.isConfigFile);
    const allDocs = nonBinary.length > 0 && nonBinary.every((f) => f.language === "markdown");
    const hasTypeDecls = input.files.some((f) => f.touchedSchemaNames.length > 0);
    const hasRoutes = input.files.some((f) => f.touchedSymbols.some((s) => s.startsWith("route ") || s.startsWith("handler ")));
    const hasAuthPath = input.files.some((f) => isAuthOrSecurityPath(f.filePath));
    const hasSchemaFile = input.files.some((f) => ["graphql", "prisma", "sql", "json", "yaml"].includes(f.language) &&
        !f.isTestFile &&
        !f.isConfigFile);
    const hasExportChanges = input.files.some((f) => f.changedExports.length > 0);
    const hasImportChanges = input.files.some((f) => f.changedImports.length > 0);
    const highVolume = totalLines >= HIGH_DIFF_VOLUME_THRESHOLD;
    // Collect all applicable reasons.
    if (hasTypeDecls)
        reasons.push("type-declarations-changed");
    if (hasRoutes)
        reasons.push("api-routes-changed");
    if (hasAuthPath)
        reasons.push("auth-or-security-path");
    if (hasSchemaFile)
        reasons.push("schema-file-changed");
    if (hasExportChanges)
        reasons.push("exports-changed");
    if (hasImportChanges)
        reasons.push("imports-changed");
    if (highVolume)
        reasons.push("high-diff-volume");
    if (allTest)
        reasons.push("test-only-changes");
    if (allConfig)
        reasons.push("config-only-changes");
    if (allDocs)
        reasons.push("documentation-only");
    if (!highVolume && !hasTypeDecls && !hasRoutes && !hasAuthPath && !hasSchemaFile)
        reasons.push("low-diff-volume");
    // Assign priority.
    if (hasTypeDecls || hasRoutes || hasAuthPath || hasSchemaFile) {
        return { priority: "high", reasons };
    }
    if (allTest && !allConfig)
        return { priority: "low", reasons };
    if (allConfig)
        return { priority: "low", reasons };
    if (allDocs)
        return { priority: "low", reasons };
    if (hasExportChanges || hasImportChanges || highVolume) {
        return { priority: "medium", reasons };
    }
    return { priority: "low", reasons };
}
// ---------------------------------------------------------------------------
// Utility: sorted unique string array
// ---------------------------------------------------------------------------
function sortedUnique(items) {
    return [...new Set(items)].sort();
}
//# sourceMappingURL=classifier.js.map