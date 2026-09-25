/**
 * entity-normalizer.ts
 *
 * Canonical entity/subject normalization.
 *
 * Conservative rule: when uncertain whether two phrases mean the same thing,
 * do NOT collapse them. False positives (missed conflicts) are better than
 * false negatives (invented conflicts).
 */

export interface EntityNormalizationResult {
  readonly canonical: string;
  readonly raw: string;
  readonly explanation?: string;
}

// ---------------------------------------------------------------------------
// Filler words stripped from entity names (whole-word only)
// ---------------------------------------------------------------------------
// Words stripped only when they appear alongside other words — never strip
// a word that IS the entire entity name (which would produce an empty subject).
// "field", "type", "value", "check", "status" are kept: stripping them from
// a single-word entity like normalizeEntity("type") would silently empty it.
const ENTITY_FILLER_WORDS = ["the", "a", "an", "property", "attribute"];

// ---------------------------------------------------------------------------
// Synonym clusters — only unambiguously equivalent phrasings are collapsed
// ---------------------------------------------------------------------------
interface SynonymCluster {
  readonly canonical: string;
  readonly synonyms: readonly string[];
  readonly explanation: string;
}

const SYNONYM_CLUSTERS: readonly SynonymCluster[] = [
  {
    canonical: "user_role",
    synonyms: ["user role", "user.role", "role", "userrole", "user_role", "owner role", "admin role", "member role", "organization role", "org role"],
    explanation: "Normalized role-related entity variants to canonical 'user_role'",
  },
  {
    canonical: "subscription_management",
    synonyms: ["manage subscriptions", "manage subscription", "subscription management", "manage billing", "billing management", "organization subscription management", "organization_subscription_management"],
    explanation: "Normalized subscription management action variants",
  },
  {
    canonical: "email",
    synonyms: ["email address", "email_address", "user email", "user_email"],
    explanation: "Normalized email field variants to canonical 'email'",
  },
  {
    canonical: "user_id",
    synonyms: ["userid", "user id", "user_id", "userId"],
    explanation: "Normalized user identifier field variants to canonical 'user_id'",
  },
  {
    canonical: "organization_id",
    synonyms: ["orgid", "org id", "org_id", "organizationid", "organization id"],
    explanation: "Normalized organization identifier variants",
  },
];

// ---------------------------------------------------------------------------
// camelCase / PascalCase → snake_case
// ---------------------------------------------------------------------------
function camelToSnake(s: string): string {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function normalizeEntity(raw: string): EntityNormalizationResult {
  if (!raw || raw.trim().length === 0) {
    return { canonical: "", raw };
  }

  let working = raw.trim();

  // Step 1: camelCase/PascalCase → snake_case (before lower-casing destroys case info)
  working = camelToSnake(working);

  // Step 2: lower-case
  working = working.toLowerCase();

  // Step 3: check synonym clusters
  const rawForMatch = working.replace(/_/g, " ");
  for (const cluster of SYNONYM_CLUSTERS) {
    if (cluster.synonyms.includes(rawForMatch) || cluster.synonyms.includes(working)) {
      const canonical = cluster.canonical;
      return {
        canonical,
        raw,
        ...(canonical !== raw.trim().toLowerCase() ? { explanation: cluster.explanation } : {}),
      };
    }
  }

  // Step 4: strip filler words (whole-word only)
  for (const filler of ENTITY_FILLER_WORDS) {
    working = working.replace(new RegExp(`\\b${filler}\\b`, "g"), "");
  }

  // Step 5: standardize separators → underscores
  working = working
    .replace(/[\s\-.]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const rawNormalized = raw.trim().toLowerCase().replace(/[\s\-.]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const changed = working !== rawNormalized;

  return {
    canonical: working,
    raw,
    ...(changed ? { explanation: "Normalized entity: stripped filler words and standardized separators" } : {}),
  };
}
