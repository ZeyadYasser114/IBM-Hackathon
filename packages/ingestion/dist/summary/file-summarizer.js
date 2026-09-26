"use strict";
/**
 * file-summarizer.ts — per-file metadata extraction.
 *
 * Scans diff lines and evidence snippets to produce a FileSummary.
 * All fields trace to observable diff evidence. No semantic conclusions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeFile = summarizeFile;
const patterns_js_1 = require("../evidence/patterns.js");
const classifier_js_1 = require("./classifier.js");
// ---------------------------------------------------------------------------
// Import pattern extraction
// ---------------------------------------------------------------------------
/**
 * Extract imported module/symbol names from a single diff line.
 *
 * Handles:
 *   import { Foo, Bar } from 'module'
 *   import Foo from 'module'
 *   import * as Foo from 'module'
 *   require('module')
 *   import('module')
 *
 * Returns the module specifier (the string after `from` or inside `require`).
 */
function extractImportSpecifier(line) {
    const trimmed = line.trimStart();
    // ES import from 'module'
    let m = trimmed.match(/\bfrom\s+['"`]([^'"`]+)['"`]/);
    if (m)
        return m[1];
    // require('module') / import('module')
    m = trimmed.match(/\b(?:require|import)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    if (m)
        return m[1];
    return null;
}
/**
 * Extract exported name from a single diff line (best-effort).
 * Returns the exported identifier or null.
 */
function extractExportName(line) {
    const trimmed = line.trimStart();
    // export { Foo, Bar } — pick up individual names
    let m = trimmed.match(/^export\s*\{([^}]+)\}/);
    if (m) {
        // Take first name for simplicity; caller calls this per-line
        const names = m[1].split(",").map((s) => s.trim().replace(/\s+as\s+\w+/, "")).filter(Boolean);
        return names[0] ?? null;
    }
    // export default class/function/const Foo
    m = trimmed.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum|abstract\s+class)\s+(\w+)/);
    if (m)
        return m[1];
    // export default Foo (bare identifier)
    m = trimmed.match(/^export\s+default\s+(\w+)\s*;?$/);
    if (m)
        return m[1];
    return null;
}
// ---------------------------------------------------------------------------
// Symbol extraction from diff lines
// ---------------------------------------------------------------------------
/**
 * Scan changed (added/removed) diff lines to extract symbol names via
 * classifyLine. Returns labels like "function authorise", "interface UserRole".
 */
function extractTouchedSymbolsFromDiff(file) {
    const symbols = [];
    for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
            if (line.kind === "context")
                continue;
            const cl = (0, patterns_js_1.classifyLine)(line.content);
            if (cl)
                symbols.push(cl.label);
        }
    }
    return symbols;
}
/**
 * Extract schema/type/constant names from changed lines.
 * These are the subset of touched symbols whose sourceType is
 * "type-decl" or "constant".
 */
function extractSchemaNames(file) {
    const names = [];
    for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
            if (line.kind === "context")
                continue;
            const cl = (0, patterns_js_1.classifyLine)(line.content);
            if (cl && (cl.sourceType === "type-decl" || cl.sourceType === "constant")) {
                // Strip the prefix ("interface ", "type ", "enum ", "const ", "class ")
                const symbolName = cl.label.replace(/^\w+\s+/, "");
                names.push(symbolName);
            }
        }
    }
    return names;
}
/**
 * Extract import specifiers from changed (non-context) diff lines.
 */
function extractChangedImports(file) {
    const imports = [];
    for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
            if (line.kind === "context")
                continue;
            const spec = extractImportSpecifier(line.content);
            if (spec)
                imports.push(spec);
        }
    }
    return imports;
}
/**
 * Extract exported names from changed (non-context) diff lines.
 */
function extractChangedExports(file) {
    const exports = [];
    for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
            if (line.kind === "context")
                continue;
            const name = extractExportName(line.content);
            if (name)
                exports.push(name);
        }
    }
    return exports;
}
// ---------------------------------------------------------------------------
// Evidence-snippet enrichment
// ---------------------------------------------------------------------------
/**
 * Merge symbol labels from EvidenceSnippets belonging to this file.
 * This catches structural patterns the diff-line scanner may have missed
 * (e.g. when the changed line is inside a function body, not the signature).
 */
function symbolsFromSnippets(filePath, snippets) {
    return snippets
        .filter((s) => s.filePath === filePath && s.label !== undefined && s.sourceType !== "diff-context")
        .map((s) => s.label);
}
// ---------------------------------------------------------------------------
// Public: summarizeFile
// ---------------------------------------------------------------------------
/**
 * Produce a FileSummary for one ChangedFile.
 *
 * @param file           The changed file from the ChangeSet.
 * @param snippets       All EvidenceSnippets from the ChangeSet (used for enrichment).
 */
function summarizeFile(file, snippets) {
    const language = (0, classifier_js_1.detectLanguage)(file.path);
    const isTest = (0, classifier_js_1.isTestFile)(file.path);
    const isConfig = (0, classifier_js_1.isConfigFile)(file.path);
    // For binary or hunk-less files, most fields will be empty.
    const diffSymbols = file.isBinary ? [] : extractTouchedSymbolsFromDiff(file);
    const snippetLabels = symbolsFromSnippets(file.path, snippets);
    const schemaNames = file.isBinary ? [] : extractSchemaNames(file);
    const changedImports = file.isBinary ? [] : extractChangedImports(file);
    const changedExports = file.isBinary ? [] : extractChangedExports(file);
    // Merge symbol labels from diff scanning and snippets.
    const allSymbols = (0, classifier_js_1.sortedUnique)([...diffSymbols, ...snippetLabels]);
    const allSchemas = (0, classifier_js_1.sortedUnique)(schemaNames);
    const allImports = (0, classifier_js_1.sortedUnique)(changedImports);
    const allExports = (0, classifier_js_1.sortedUnique)(changedExports);
    return {
        filePath: file.path,
        fileStatus: file.status,
        language,
        isTestFile: isTest,
        isConfigFile: isConfig,
        touchedSymbols: allSymbols,
        changedImports: allImports,
        changedExports: allExports,
        touchedSchemaNames: allSchemas,
        additions: file.additions,
        deletions: file.deletions,
    };
}
//# sourceMappingURL=file-summarizer.js.map