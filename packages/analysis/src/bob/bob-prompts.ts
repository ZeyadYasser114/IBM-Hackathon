/**
 * bob-prompts.ts
 *
 * System/user prompts for the five MergeMind analysis roles.
 *
 * Every prompt demands a single JSON object and nothing else, using the
 * shared assumption schema below. Bob performs analysis only — prompts
 * forbid safety verdicts ("safe to merge") because the deterministic
 * semantic engine makes the final decision downstream.
 */

import type { AgentType } from '@mergemind/domain';

/** Wire format Bob must return. Mirrors the task schema plus the fields the
 *  domain Assumption mapping needs (concept, value, branch, confidence). */
export const BOB_ASSUMPTION_SCHEMA_TEXT = `{
  "assumptions": [
    {
      "id": "string (optional short slug, e.g. auth-role)",
      "statement": "string (REQUIRED, plain-English claim)",
      "concept": "string (kebab-case grouping key, e.g. privileged-role)",
      "value": "string (REQUIRED, the asserted value, e.g. 'owner')",
      "branch": "string (REQUIRED, exactly one of the two branch names given)",
      "file": "string (repo-relative path)",
      "line": 123 (integer line number or null),
      "evidence": "string (verbatim excerpt, at most 5 lines)",
      "confidence": 0.0-1.0 (optional, defaults to 0.6)
    }
  ]
}`;

const JSON_ONLY = `Return ONLY a single JSON object with exactly this shape and nothing else — no markdown fences, no commentary:
${BOB_ASSUMPTION_SCHEMA_TEXT}`;

const NO_VERDICT =
  'Do NOT judge whether the merge is safe. Do NOT output any safe/unsafe verdict. ' +
  'List only claims (assumptions) with evidence. An empty "assumptions" array is valid when nothing is found.';

export interface BobPromptInputs {
  requirementText: string;
  branchAName: string;
  branchBName: string;
  diffAText: string;
  diffBText: string;
}

function header(inputs: BobPromptInputs): string {
  return (
    `Requirement: ${inputs.requirementText}\n` +
    `Branch A name: ${inputs.branchAName}\n` +
    `Branch B name: ${inputs.branchBName}\n`
  );
}

function diffs(inputs: BobPromptInputs): string {
  return (
    `--- Change A diff (${inputs.branchAName}) ---\n${inputs.diffAText}\n` +
    `--- Change B diff (${inputs.branchBName}) ---\n${inputs.diffBText}\n`
  );
}

export function buildIntentPrompt(inputs: BobPromptInputs): string {
  return (
    'You are the Intent Agent. Analyze ONLY the requirement below.\n' +
    'Determine the intended behavior, the business rules it states, and the important assumptions it makes.\n' +
    header(inputs) +
    'Use branch names only to attribute which change each assumption constrains.\n' +
    `${NO_VERDICT}\n${JSON_ONLY}`
  );
}

export function buildChangePrompt(inputs: BobPromptInputs): string {
  return (
    'You are the Change Agent. Analyze the two diffs below.\n' +
    'Determine the behavior each change introduces, what behavior changed, and the assumptions behind each change, with evidence.\n' +
    header(inputs) +
    diffs(inputs) +
    `${NO_VERDICT}\n${JSON_ONLY}`
  );
}

export function buildContractPrompt(inputs: BobPromptInputs): string {
  return (
    'You are the Contract Agent. Inspect API signatures, function interfaces, schemas, types, models, and request/response structures in the diffs below.\n' +
    'Determine the contract assumptions each change makes and any possible incompatibilities between them.\n' +
    header(inputs) +
    diffs(inputs) +
    `${NO_VERDICT}\n${JSON_ONLY}`
  );
}

export function buildDependencyPrompt(inputs: BobPromptInputs): string {
  return (
    'You are the Dependency Agent. Inspect shared fields, roles, states, lifecycles, and dependencies between components in the diffs below.\n' +
    'Determine the dependency assumptions each change relies on.\n' +
    header(inputs) +
    diffs(inputs) +
    `${NO_VERDICT}\n${JSON_ONLY}`
  );
}

export function buildAdversaryPrompt(inputs: BobPromptInputs): string {
  return (
    'You are the Adversary Agent. Actively search for semantic incompatibilities between the two changes below.\n' +
    'Answer these questions with evidenced assumptions:\n' +
    'What is true in Change A but false in Change B?\n' +
    'What requirement could break even though Git can merge the files?\n' +
    'What assumptions conflict between the two changes?\n' +
    'What hidden business-rule, contract, or dependency conflict could survive a normal Git merge?\n' +
    header(inputs) +
    diffs(inputs) +
    `${NO_VERDICT}\n${JSON_ONLY}`
  );
}

export function buildPromptFor(agentType: AgentType, inputs: BobPromptInputs): string {
  switch (agentType) {
    case 'intent':
      return buildIntentPrompt(inputs);
    case 'change':
      return buildChangePrompt(inputs);
    case 'contract':
      return buildContractPrompt(inputs);
    case 'dependency':
      return buildDependencyPrompt(inputs);
    case 'adversary':
      return buildAdversaryPrompt(inputs);
  }
}

export const BOB_SYSTEM_PROMPT =
  'You are a precise code-analysis assistant. You always output valid JSON matching the requested schema and nothing else.';
