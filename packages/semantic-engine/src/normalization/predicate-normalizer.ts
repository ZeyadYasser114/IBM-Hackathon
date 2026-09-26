/**
 * predicate-normalizer.ts
 *
 * Canonical predicate normalization.
 * Normalizes predicate keys (e.g. "allowed_role" → "required_role") and
 * delegates value normalization to the value normalizer.
 */

export interface PredicateNormalizationResult {
  readonly canonicalKey: string;
  readonly canonicalValue: string;
  readonly canonical: string;
  readonly raw: string;
  readonly explanation?: string;
}

interface PredicateKeySynonym {
  readonly canonical: string;
  readonly synonyms: readonly string[];
  readonly explanation: string;
}

const PREDICATE_KEY_SYNONYMS: readonly PredicateKeySynonym[] = [
  {
    canonical: "required_role",
    synonyms: ["allowed_role", "assigned_role", "required_role", "role_required", "role_allowed", "role_check", "role"],
    explanation: "Normalized role predicate key variants to 'required_role'",
  },
  {
    canonical: "is_required",
    synonyms: ["is_required", "required", "mandatory", "not_nullable", "non_null", "must_exist"],
    explanation: "Normalized required-field predicate key variants to 'is_required'",
  },
  {
    canonical: "field_name",
    synonyms: ["field_name", "field", "expected_field", "response_field", "api_field", "param_name"],
    explanation: "Normalized API/contract field predicate key variants to 'field_name'",
  },
];

function parsePredicate(predicate: string): { key: string; value: string } {
  const eqIdx = predicate.indexOf("=");
  if (eqIdx === -1) return { key: predicate.trim().toLowerCase(), value: "" };
  return {
    key: predicate.slice(0, eqIdx).trim().toLowerCase(),
    value: predicate.slice(eqIdx + 1).trim(),
  };
}

function normalizePredicateKey(rawKey: string): { canonical: string; explanation?: string } {
  const lower = rawKey.toLowerCase().replace(/[\s\-]+/g, "_");
  for (const cluster of PREDICATE_KEY_SYNONYMS) {
    if (cluster.synonyms.includes(lower)) {
      return {
        canonical: cluster.canonical,
        ...(cluster.canonical !== lower ? { explanation: cluster.explanation } : {}),
      };
    }
  }
  return { canonical: lower };
}

export function normalizePredicate(
  raw: string,
  normalizeValue: (rawValue: string) => string
): PredicateNormalizationResult {
  if (!raw || raw.trim().length === 0) {
    return { canonicalKey: "", canonicalValue: "", canonical: "", raw };
  }

  const { key, value } = parsePredicate(raw);
  const { canonical: canonicalKey, explanation: keyExplanation } = normalizePredicateKey(key);
  const canonicalValue = normalizeValue(value);

  const canonical = canonicalValue.length > 0
    ? `${canonicalKey} = ${canonicalValue}`
    : canonicalKey;

  const explanationParts: string[] = [];
  if (keyExplanation) explanationParts.push(keyExplanation);
  if (canonicalValue !== value && value.length > 0) {
    explanationParts.push(`Value normalized: '${value}' → '${canonicalValue}'`);
  }

  return {
    canonicalKey, canonicalValue, canonical, raw,
    ...(explanationParts.length > 0 ? { explanation: explanationParts.join("; ") } : {}),
  };
}
