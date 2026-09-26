"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyLine = classifyLine;
exports.findBlockEnd = findBlockEnd;
exports.isTsJsFile = isTsJsFile;
exports.isSchemaFile = isSchemaFile;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Extract the identifier name from a matched regex group. */
function name(match, group = 1) {
    return (match[group] ?? "").trim();
}
// ---------------------------------------------------------------------------
// Classify a single line
// ---------------------------------------------------------------------------
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
function classifyLine(line) {
    const trimmed = line.trimStart();
    // --- API routes (checked BEFORE generic function to capture handler exports) ---
    // Next.js / file-based routing export: export default function handler(req, res)
    let m = trimmed.match(/^export\s+default\s+(?:async\s+)?function\s+(\w+)\s*\(\s*req/);
    if (m) {
        return {
            sourceType: "route",
            label: `handler ${name(m)}`,
            opensBlock: line.trimEnd().endsWith("{"),
        };
    }
    // --- Functions & methods --------------------------------------------------
    // async function foo(  /  function foo(  /  export function foo(
    // export default function foo(  /  export async function foo(
    m = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*[(<]/);
    if (m) {
        return {
            sourceType: "function",
            label: `function ${name(m)}`,
            opensBlock: /[{(]/.test(line.slice(line.lastIndexOf(name(m)))),
        };
    }
    // Arrow function assigned to const/let/var: const foo = (args) => {
    m = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(.*\)\s*(?::\s*\S+\s*)?=>\s*[{(]?/);
    if (m) {
        return {
            sourceType: "function",
            label: `function ${name(m)}`,
            opensBlock: /[{(]/.test(line),
        };
    }
    // Class method: public/private/protected/static/async methodName(
    m = trimmed.match(/^(?:(?:public|private|protected|static|async|override)\s+)+(\w+)\s*\(/);
    if (m) {
        return {
            sourceType: "function",
            label: `method ${name(m)}`,
            opensBlock: line.trimEnd().endsWith("{"),
        };
    }
    // Shorthand method in object/class: methodName(  (no keyword prefix)
    // Be conservative — only match if followed immediately by ( with no =
    m = trimmed.match(/^(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?[{:]/);
    if (m && !trimmed.startsWith("if") && !trimmed.startsWith("while") && !trimmed.startsWith("for")) {
        return {
            sourceType: "function",
            label: `method ${name(m)}`,
            opensBlock: line.trimEnd().endsWith("{"),
        };
    }
    // --- Type declarations ----------------------------------------------------
    // interface Foo {  /  export interface Foo<T> {
    m = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/);
    if (m) {
        return {
            sourceType: "type-decl",
            label: `interface ${name(m)}`,
            opensBlock: line.trimEnd().endsWith("{"),
        };
    }
    // type Foo = ...  /  export type Foo = ...
    m = trimmed.match(/^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/);
    if (m) {
        return {
            sourceType: "type-decl",
            label: `type ${name(m)}`,
            opensBlock: line.includes("{"),
        };
    }
    // class Foo  /  export class Foo  /  abstract class Foo
    m = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (m) {
        return {
            sourceType: "type-decl",
            label: `class ${name(m)}`,
            opensBlock: line.trimEnd().endsWith("{"),
        };
    }
    // enum Foo {  /  const enum Foo {  /  export enum Foo {
    m = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/);
    if (m) {
        return {
            sourceType: "type-decl",
            label: `enum ${name(m)}`,
            opensBlock: line.trimEnd().endsWith("{"),
        };
    }
    // --- Constants & roles ----------------------------------------------------
    // export const FOO = ...  /  const FOO = ...  /  export const foo: Type = ...
    m = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*(?::\s*\S+\s*)?=/);
    if (m) {
        return {
            sourceType: "constant",
            label: `const ${name(m)}`,
            opensBlock: line.includes("{") && !line.includes("=>"),
        };
    }
    // Object.freeze({ ... }) assigned to a const (role maps, permission sets)
    m = trimmed.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*Object\.freeze/);
    if (m) {
        return {
            sourceType: "constant",
            label: `const ${name(m)}`,
            opensBlock: true,
        };
    }
    // --- API routes (Express/Fastify, lower priority than handler pattern above) ---
    // Express-style: app.get("/path", ...)  /  router.post(...)  /  app.use(...)
    m = trimmed.match(/^(?:\w+\.(?:get|post|put|patch|delete|head|options|use|all)\s*\()['"`](\/[^'"` ]*)/);
    if (m) {
        return {
            sourceType: "route",
            label: `route ${name(m, 1)}`,
            opensBlock: line.includes("{"),
        };
    }
    // Fastify/Hapi style: server.route({ method: ..., path: ... })
    m = trimmed.match(/^(?:\w+\.route\s*\()/);
    if (m) {
        return {
            sourceType: "route",
            label: "route declaration",
            opensBlock: true,
        };
    }
    return null;
}
// ---------------------------------------------------------------------------
// Block boundary detection
// ---------------------------------------------------------------------------
/**
 * Given an array of source lines and the 0-based index of an opening line,
 * return the 0-based index of the matching closing brace.
 *
 * Uses a simple brace counter — sufficient for the constructs we care about.
 * Returns null when no matching close is found within maxLines.
 */
function findBlockEnd(lines, startIdx, maxLines = 120) {
    let depth = 0;
    let foundOpen = false;
    const limit = Math.min(lines.length, startIdx + maxLines);
    for (let i = startIdx; i < limit; i++) {
        const line = lines[i];
        for (const ch of line) {
            if (ch === "{") {
                depth++;
                foundOpen = true;
            }
            else if (ch === "}") {
                depth--;
            }
        }
        if (foundOpen && depth === 0)
            return i;
    }
    return null;
}
// ---------------------------------------------------------------------------
// File-type detection
// ---------------------------------------------------------------------------
/**
 * Returns true when the file path looks like TypeScript or JavaScript.
 * Used to gate pattern-based extraction.
 */
function isTsJsFile(filePath) {
    return /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(filePath);
}
/**
 * Returns true when the file path looks like a schema / data-model file.
 * (JSON Schema, Prisma, GraphQL SDL, etc.)
 */
function isSchemaFile(filePath) {
    return /\.(graphql|gql|prisma|json|ya?ml)$/.test(filePath) ||
        /schema\./i.test(filePath) ||
        /\.schema\./i.test(filePath);
}
//# sourceMappingURL=patterns.js.map