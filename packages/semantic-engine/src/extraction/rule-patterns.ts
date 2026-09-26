/**
 * rule-patterns.ts
 *
 * Deterministic pattern definitions used by DeterministicExtractor.
 */

import { AssumptionCategory } from "./assumption-category";
import { Confidence } from "../types/enums";

export interface PatternMatch {
  readonly category: AssumptionCategory;
  readonly subject: string;
  readonly predicate: string;
  readonly evidenceText: string;
  readonly statement: string;
  readonly confidence: Confidence;
}

export interface RulePattern {
  readonly id: string;
  readonly category: AssumptionCategory;
  readonly pattern: RegExp;
  readonly extract: (match: RegExpExecArray, fullText: string) => PatternMatch | null;
}

export function toSubjectKey(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stripQuotes(value: string): string {
  return value.replace(/^['"`]|['"`]$/g, "").trim();
}

const AUTH_PATTERNS: RulePattern[] = [
  {
    id: "auth:only_role_can_action",
    category: AssumptionCategory.AUTHORIZATION,
    pattern: /only\s+(?:(?:organization|org)\s+)?(\w+s?)\s+(?:can|may)\s+([\w\s]+?)(?:\.|$)/i,
    extract(match) {
      const role = match[1]?.trim().toLowerCase();
      const action = match[2]?.trim().toLowerCase();
      if (!role || !action) return null;
      return {
        category: AssumptionCategory.AUTHORIZATION,
        subject: toSubjectKey(action),
        predicate: `allowed_role = ${role}`,
        evidenceText: match[0].trim(),
        statement: `Only '${role}' may perform: ${action}`,
        confidence: Confidence.HIGH,
      };
    },
  },
  {
    id: "auth:role_check_equality",
    category: AssumptionCategory.AUTHORIZATION,
    pattern: /(?:user\.)?role\s*={2,3}\s*['"`](\w+)['"`]/i,
    extract(match) {
      const role = stripQuotes(match[1] ?? "");
      if (!role) return null;
      return {
        category: AssumptionCategory.AUTHORIZATION,
        subject: "user_role",
        predicate: `allowed_role = ${role}`,
        evidenceText: match[0].trim(),
        statement: `The privileged role is '${role}'`,
        confidence: Confidence.HIGH,
      };
    },
  },
  {
    id: "auth:role_assignment",
    category: AssumptionCategory.AUTHORIZATION,
    pattern: /(?:user\.)?role\s*[:=]\s*['"`](\w+)['"`]/i,
    extract(match) {
      const role = stripQuotes(match[1] ?? "");
      if (!role) return null;
      return {
        category: AssumptionCategory.AUTHORIZATION,
        subject: "user_role",
        predicate: `assigned_role = ${role}`,
        evidenceText: match[0].trim(),
        statement: `User role is assigned as '${role}'`,
        confidence: Confidence.HIGH,
      };
    },
  },
  {
    id: "auth:permission_check",
    category: AssumptionCategory.AUTHORIZATION,
    pattern: /has(?:Permission|Role|Access)\s*\(\s*['"`]?([\w:_-]+)['"`]?\s*\)/i,
    extract(match) {
      const perm = match[1]?.trim().toLowerCase();
      if (!perm) return null;
      return {
        category: AssumptionCategory.AUTHORIZATION,
        subject: toSubjectKey(perm),
        predicate: `required_permission = ${perm}`,
        evidenceText: match[0].trim(),
        statement: `Access requires permission '${perm}'`,
        confidence: Confidence.MEDIUM,
      };
    },
  },
];

const BUSINESS_RULE_PATTERNS: RulePattern[] = [
  {
    id: "biz:must_requirement",
    category: AssumptionCategory.BUSINESS_RULE,
    pattern: /([\w\s]{3,40}?)\s+must(?:\s+be)?\s+([\w\s'"`]{2,60}?)(?:\.|,|$)/i,
    extract(match) {
      const subject = toSubjectKey(match[1] ?? "");
      const rule = (match[2] ?? "").trim().toLowerCase();
      if (!subject || !rule || subject.length < 2) return null;
      return {
        category: AssumptionCategory.BUSINESS_RULE,
        subject,
        predicate: `must_be = ${rule}`,
        evidenceText: match[0].trim(),
        statement: `${subject} must be ${rule}`,
        confidence: Confidence.HIGH,
      };
    },
  },
  {
    id: "biz:cannot_requirement",
    category: AssumptionCategory.BUSINESS_RULE,
    pattern: /([\w\s]{3,40}?)\s+(?:cannot|can't|should\s+not|must\s+not)\s+([\w\s'"`]{2,60}?)(?:\.|,|$)/i,
    extract(match) {
      const subject = toSubjectKey(match[1] ?? "");
      const rule = (match[2] ?? "").trim().toLowerCase();
      if (!subject || !rule || subject.length < 2) return null;
      return {
        category: AssumptionCategory.BUSINESS_RULE,
        subject,
        predicate: `prohibited = ${rule}`,
        evidenceText: match[0].trim(),
        statement: `${subject} cannot ${rule}`,
        confidence: Confidence.HIGH,
      };
    },
  },
  {
    id: "biz:only_x_allowed",
    category: AssumptionCategory.BUSINESS_RULE,
    pattern: /only\s+([\w\s]{2,30}?)\s+(?:are|is)\s+allowed\s+to\s+([\w\s]{2,50}?)(?:\.|,|$)/i,
    extract(match) {
      const actor = (match[1] ?? "").trim().toLowerCase();
      const action = toSubjectKey(match[2] ?? "");
      if (!actor || !action) return null;
      return {
        category: AssumptionCategory.BUSINESS_RULE,
        subject: action,
        predicate: `allowed_actor = ${actor}`,
        evidenceText: match[0].trim(),
        statement: `Only ${actor} are allowed to ${action.replace(/_/g, " ")}`,
        confidence: Confidence.HIGH,
      };
    },
  },
];

const CONTRACT_PATTERNS: RulePattern[] = [
  {
    id: "contract:field_name",
    category: AssumptionCategory.CONTRACT,
    pattern: /(?:returns?|responds?\s+with|field(?:\s+(?:is\s+)?named?)?(?:\s*:)?)\s+['"`]?([\w_]+)['"`]?/i,
    extract(match) {
      const field = match[1]?.trim();
      if (!field || field.length < 2) return null;
      return {
        category: AssumptionCategory.CONTRACT,
        subject: `api_response_field`,
        predicate: `field_name = ${field}`,
        evidenceText: match[0].trim(),
        statement: `API response includes field '${field}'`,
        confidence: Confidence.MEDIUM,
      };
    },
  },
  {
    id: "contract:expects_field",
    category: AssumptionCategory.CONTRACT,
    pattern: /expects?\s+(?:field\s+)?['"`]?([\w_]+)['"`]?/i,
    extract(match) {
      const field = match[1]?.trim();
      if (!field || field.length < 2) return null;
      return {
        category: AssumptionCategory.CONTRACT,
        subject: `api_response_field`,
        predicate: `expected_field = ${field}`,
        evidenceText: match[0].trim(),
        statement: `Consumer expects field '${field}'`,
        confidence: Confidence.MEDIUM,
      };
    },
  },
  {
    id: "contract:function_signature",
    category: AssumptionCategory.CONTRACT,
    pattern: /(?:function|method|def)\s+([\w]+)\s*\(([^)]{0,80})\)/i,
    extract(match) {
      const fnName = match[1]?.trim();
      const params = match[2]?.trim();
      if (!fnName) return null;
      return {
        category: AssumptionCategory.CONTRACT,
        subject: toSubjectKey(fnName),
        predicate: `signature = ${fnName}(${params ?? ""})`,
        evidenceText: match[0].trim(),
        statement: `Function '${fnName}' has signature (${params ?? ""})`,
        confidence: Confidence.MEDIUM,
      };
    },
  },
];

const SCHEMA_PATTERNS: RulePattern[] = [
  {
    id: "schema:field_required",
    category: AssumptionCategory.SCHEMA,
    pattern: /(?:([\w_]+)\s+(?:field\s+)?is\s+(?:required|mandatory|not\s+nullable|non-?null))|(?:required\s*:\s*([\w_]+))/i,
    extract(match) {
      const field = (match[1] ?? match[2] ?? "").trim();
      if (!field) return null;
      return {
        category: AssumptionCategory.SCHEMA,
        subject: toSubjectKey(field),
        predicate: `is_required = true`,
        evidenceText: match[0].trim(),
        statement: `Field '${field}' is required`,
        confidence: Confidence.HIGH,
      };
    },
  },
  {
    id: "schema:field_optional",
    category: AssumptionCategory.SCHEMA,
    pattern: /(?:([\w_]+)\s+(?:field\s+)?is\s+(?:optional|nullable|can\s+be\s+null))|(?:optional\s*:\s*([\w_]+))/i,
    extract(match) {
      const field = (match[1] ?? match[2] ?? "").trim();
      if (!field) return null;
      return {
        category: AssumptionCategory.SCHEMA,
        subject: toSubjectKey(field),
        predicate: `is_required = false`,
        evidenceText: match[0].trim(),
        statement: `Field '${field}' is optional`,
        confidence: Confidence.HIGH,
      };
    },
  },
  {
    id: "schema:field_type",
    category: AssumptionCategory.SCHEMA,
    pattern: /(?:([\w_]+)\s*:\s*(string|number|boolean|Date|int|integer|uuid|text|bigint|float))|(?:type\s+of\s+([\w_]+)\s+is\s+(string|number|boolean|Date|int|integer|uuid|text|bigint|float))/i,
    extract(match) {
      const field = (match[1] ?? match[3] ?? "").trim();
      const type = (match[2] ?? match[4] ?? "").trim().toLowerCase();
      if (!field || !type) return null;
      return {
        category: AssumptionCategory.SCHEMA,
        subject: toSubjectKey(field),
        predicate: `type = ${type}`,
        evidenceText: match[0].trim(),
        statement: `Field '${field}' has type ${type}`,
        confidence: Confidence.MEDIUM,
      };
    },
  },
];

const DEPENDENCY_PATTERNS: RulePattern[] = [
  {
    id: "dep:assumes_field_present",
    category: AssumptionCategory.DEPENDENCY,
    pattern: /assumes?\s+(?:every\s+\w+\s+has\s+|[\w\s]+?\s+is\s+always\s+(?:present|available))([\w\s]{2,40}?)(?:\.|,|$)/i,
    extract(match, fullText) {
      const fieldMatch = /\b(email|phone|name|address|id|token|key)\b/i.exec(fullText);
      const field = fieldMatch ? fieldMatch[1]!.toLowerCase() : toSubjectKey(match[1] ?? "");
      if (!field) return null;
      return {
        category: AssumptionCategory.DEPENDENCY,
        subject: toSubjectKey(field),
        predicate: `always_present = true`,
        evidenceText: match[0].trim(),
        statement: `Dependency assumes '${field}' is always present`,
        confidence: Confidence.MEDIUM,
      };
    },
  },
  {
    id: "dep:depends_on_service",
    category: AssumptionCategory.DEPENDENCY,
    pattern: /(?:depends?\s+on|relies?\s+on)\s+(?:the\s+)?([\w\s]{2,40}?)(?:\s+service|\s+module|\s+api)?(?:\.|,|$)/i,
    extract(match) {
      const dep = (match[1] ?? "").trim();
      if (!dep || dep.length < 2) return null;
      return {
        category: AssumptionCategory.DEPENDENCY,
        subject: toSubjectKey(dep),
        predicate: `dependency_required = true`,
        evidenceText: match[0].trim(),
        statement: `Component depends on '${dep}'`,
        confidence: Confidence.MEDIUM,
      };
    },
  },
  {
    id: "dep:calls_service",
    category: AssumptionCategory.DEPENDENCY,
    pattern: /(?:calls?|invokes?)\s+([\w.]+)\s*\(/i,
    extract(match) {
      const call = (match[1] ?? "").trim();
      if (!call) return null;
      return {
        category: AssumptionCategory.DEPENDENCY,
        subject: toSubjectKey(call),
        predicate: `called_by_component = true`,
        evidenceText: match[0].trim(),
        statement: `Component calls '${call}'`,
        confidence: Confidence.LOW,
      };
    },
  },
];

export const ALL_RULE_PATTERNS: readonly RulePattern[] = [
  ...AUTH_PATTERNS,
  ...BUSINESS_RULE_PATTERNS,
  ...CONTRACT_PATTERNS,
  ...SCHEMA_PATTERNS,
  ...DEPENDENCY_PATTERNS,
];

export {
  AUTH_PATTERNS,
  BUSINESS_RULE_PATTERNS,
  CONTRACT_PATTERNS,
  SCHEMA_PATTERNS,
  DEPENDENCY_PATTERNS,
};
