/**
 * value-normalizer.ts
 *
 * Value normalization for the right-hand side of a predicate.
 * Covers: roles, booleans, enum-like values, field names, API/contract terms.
 *
 * Conservative: only normalize values that are clearly the same token written
 * differently (case, separator style). Never collapse different values.
 */

export interface ValueNormalizationResult {
  readonly canonical: string;
  readonly raw: string;
  readonly explanation?: string;
}

// Only include unambiguous boolean synonyms.
// "required" / "mandatory" / "optional" / "nullable" are intentionally excluded:
// they are meaningful domain words in schema/contract predicates and must not
// be silently collapsed to true/false when used as values in those predicates.
const BOOLEAN_TRUE_VALUES = new Set(["true", "yes", "1", "on", "enabled"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "no", "0", "off", "disabled"]);

function camelToSnake(s: string): string {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function isCamelCase(s: string): boolean {
  return /^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(s);
}

function isPascalCase(s: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(s) ||
         /^[A-Z][a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(s);
}

function stripQuotes(s: string): string {
  return s.replace(/^['"`]|['"`]$/g, "").trim();
}

export function normalizeValue(raw: string): ValueNormalizationResult {
  if (!raw || raw.trim().length === 0) {
    return { canonical: "", raw };
  }

  const unquoted = stripQuotes(raw.trim());
  const lower = unquoted.toLowerCase();

  // Boolean normalization
  if (BOOLEAN_TRUE_VALUES.has(lower)) {
    return { canonical: "true", raw, ...(raw.trim() !== "true" ? { explanation: `Boolean value normalized: '${raw.trim()}' → 'true'` } : {}) };
  }
  if (BOOLEAN_FALSE_VALUES.has(lower)) {
    return { canonical: "false", raw, ...(raw.trim() !== "false" ? { explanation: `Boolean value normalized: '${raw.trim()}' → 'false'` } : {}) };
  }

  // camelCase / PascalCase identifier → snake_case (only single-word identifiers)
  if (!unquoted.includes(" ") && (isCamelCase(unquoted) || isPascalCase(unquoted))) {
    const canonical = camelToSnake(unquoted);
    return { canonical, raw, explanation: `Identifier normalized to snake_case: '${unquoted}' → '${canonical}'` };
  }

  // Single-word: simple case folding
  if (!unquoted.includes(" ") && !unquoted.includes("_")) {
    const canonical = lower;
    return { canonical, raw, ...(canonical !== raw.trim() ? { explanation: `Value case-folded: '${raw.trim()}' → '${canonical}'` } : {}) };
  }

  // snake_case: lower-case only (preserve underscores)
  if (unquoted.includes("_")) {
    const canonical = lower;
    return { canonical, raw, ...(canonical !== raw.trim() ? { explanation: `Value lowercased: '${raw.trim()}' → '${canonical}'` } : {}) };
  }

  // Multi-word: lower-case only, conservative — do not collapse further
  const canonical = lower;
  return { canonical, raw, ...(canonical !== raw.trim() ? { explanation: `Value lowercased: '${raw.trim()}' → '${canonical}'` } : {}) };
}

/** Convenience wrapper returning only the canonical string. */
export function normalizeValueString(raw: string): string {
  return normalizeValue(raw).canonical;
}
