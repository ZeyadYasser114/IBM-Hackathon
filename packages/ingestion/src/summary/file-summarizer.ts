/**
 * file-summarizer.ts — per-file metadata extraction.
 *
 * Scans diff lines and evidence snippets to produce a FileSummary.
 * All fields trace to observable diff evidence. No semantic conclusions.
 */

import type {
  ChangedFile,
  EvidenceSnippet,
  FileSummary,
} from "../models/index.js";
import { classifyLine } from "../evidence/patterns.js";
import {
  detectLanguage,
  isTestFile,
  isConfigFile,
  sortedUnique,
} from "./classifier.js";

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
function extractImportSpecifier(line: string): string | null {
  const trimmed = line.trimStart();

  // ES import from 'module'
  let m = trimmed.match(/\bfrom\s+['"`]([^'"`]+)['"`]/);
  if (m) return m[1];

  // require('module') / import('module')
  m = trimmed.match(/\b(?:require|import)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
  if (m) return m[1];

  return null;
}

/**
 * Extract exported name from a single diff line (best-effort).
 * Returns the exported identifier or null.
 */
function extractExportName(line: string): string | null {
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
  if (m) return m[1];

  // export default Foo (bare identifier)
  m = trimmed.match(/^export\s+default\s+(\w+)\s*;?$/);
  if (m) return m[1];

  return null;
}

// ---------------------------------------------------------------------------
// Symbol extraction from diff lines
// ---------------------------------------------------------------------------

/**
 * Scan changed (added/removed) diff lines to extract symbol names via
 * classifyLine. Returns labels like "function authorise", "interface UserRole".
 */
function extractTouchedSymbolsFromDiff(file: ChangedFile): string[] {
  const symbols: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "context") continue;
      const cl = classifyLine(line.content);
      if (cl) symbols.push(cl.label);
    }
  }
  return symbols;
}

/**
 * Extract schema/type/constant names from changed lines.
 * These are the subset of touched symbols whose sourceType is
 * "type-decl" or "constant".
 */
function extractSchemaNames(file: ChangedFile): string[] {
  const names: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "context") continue;
      const cl = classifyLine(line.content);
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
function extractChangedImports(file: ChangedFile): string[] {
  const imports: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "context") continue;
      const spec = extractImportSpecifier(line.content);
      if (spec) imports.push(spec);
    }
  }
  return imports;
}

/**
 * Extract exported names from changed (non-context) diff lines.
 */
function extractChangedExports(file: ChangedFile): string[] {
  const exports: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "context") continue;
      const name = extractExportName(line.content);
      if (name) exports.push(name);
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
function symbolsFromSnippets(
  filePath: string,
  snippets: readonly EvidenceSnippet[],
): string[] {
  return snippets
    .filter((s) => s.filePath === filePath && s.label !== undefined && s.sourceType !== "diff-context")
    .map((s) => s.label as string);
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
export function summarizeFile(
  file: ChangedFile,
  snippets: readonly EvidenceSnippet[],
): FileSummary {
  const language = detectLanguage(file.path);
  const isTest   = isTestFile(file.path);
  const isConfig = isConfigFile(file.path);

  // For binary or hunk-less files, most fields will be empty.
  const diffSymbols   = file.isBinary ? [] : extractTouchedSymbolsFromDiff(file);
  const snippetLabels = symbolsFromSnippets(file.path, snippets);
  const schemaNames   = file.isBinary ? [] : extractSchemaNames(file);
  const changedImports = file.isBinary ? [] : extractChangedImports(file);
  const changedExports = file.isBinary ? [] : extractChangedExports(file);

  // Merge symbol labels from diff scanning and snippets.
  const allSymbols = sortedUnique([...diffSymbols, ...snippetLabels]);
  const allSchemas  = sortedUnique(schemaNames);
  const allImports  = sortedUnique(changedImports);
  const allExports  = sortedUnique(changedExports);

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
