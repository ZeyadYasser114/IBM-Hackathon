/**
 * enums.ts
 *
 * All discriminated string enums used across the semantic engine.
 * Kept as string enums so values are self-documenting in JSON output
 * and can be serialized / deserialized without a mapping table.
 */

export enum ConflictType {
  BUSINESS_RULE = "BUSINESS_RULE",
  CONTRACT = "CONTRACT",
  DEPENDENCY = "DEPENDENCY",
}

export enum Severity {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  INFO = "INFO",
}

export enum Confidence {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum SourceType {
  REQUIREMENT = "REQUIREMENT",
  CODE_DIFF = "CODE_DIFF",
  FILE_SNIPPET = "FILE_SNIPPET",
  DOCUMENTATION = "DOCUMENTATION",
  TEST = "TEST",
}
