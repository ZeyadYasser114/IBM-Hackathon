/**
 * bob-runner.ts
 *
 * Real IBM Bob analysis agents implementing the existing AgentRunner contract.
 *
 * Each runner sends its role prompt plus the two change diffs to Bob inference,
 * validates the structured JSON response, and maps it to domain Assumption
 * records. Runners never throw (per the AgentRunner contract): every failure
 * becomes a `failed` progress report plus an empty result — never fabricated
 * assumptions. Bob supplies analysis only; the deterministic semantic engine
 * downstream makes the final verdict.
 */

import type {
  AgentProgress,
  AgentType,
  Assumption,
  CodeEvidence,
  FeatureRequest,
  RepositorySource,
} from '@mergemind/domain';

import {
  BobValidationError,
  createHttpsCompleter,
  type BobCompleter,
  type ResolvedBobConfig,
} from './bob-client.js';
import { createShellCompleter, type ShellCompleterOptions } from './bob-shell.js';
import { BOB_SYSTEM_PROMPT, buildPromptFor } from './bob-prompts.js';

/** Maximum assumptions accepted from a single agent response (safety bound). */
export const MAX_ASSUMPTIONS_PER_AGENT = 50;
/** Per-side diff characters sent to Bob (cost bound; excess is cut with a marker). */
export const MAX_DIFF_CHARS = 12_000;

/** Wire shape of one Bob assumption (all fields validated before use). */
export interface BobAssumptionJson {
  id?: unknown;
  statement: unknown;
  concept?: unknown;
  value: unknown;
  branch?: unknown;
  file?: unknown;
  line?: unknown;
  evidence?: unknown;
  confidence?: unknown;
}

export interface BobRunnerInputs {
  requirementText: string;
  branchAName: string;
  branchBName: string;
  diffAText: string;
  diffBText: string;
}

// ---------------------------------------------------------------------------
// Parsing + validation (malformed output is always an error, never guessed)
// ---------------------------------------------------------------------------

function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return match?.[1] !== undefined ? match[1].trim() : trimmed;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function deriveConcept(statement: string): string | null {
  const slug = statement
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug.length > 0 ? slug : null;
}

function confidenceLabel(numeric: number): Assumption['confidence'] {
  if (numeric >= 0.9) return 'HIGH';
  if (numeric >= 0.6) return 'MEDIUM';
  return 'LOW';
}

function firstLines(text: string, maxLines: number): string {
  return text.split('\n').slice(0, maxLines).join('\n');
}

function mapOne(
  raw: BobAssumptionJson,
  index: number,
  agentType: AgentType,
  inputs: BobRunnerInputs,
  model: string,
): Assumption {
  const statement = asNonEmptyString(raw.statement);
  if (!statement) {
    throw new BobValidationError(`assumption #${index}: "statement" must be a non-empty string`);
  }
  const value = asNonEmptyString(raw.value);
  if (!value) {
    throw new BobValidationError(`assumption #${index}: "value" must be a non-empty string`);
  }
  const branch = asNonEmptyString(raw.branch);
  if (branch !== inputs.branchAName && branch !== inputs.branchBName) {
    throw new BobValidationError(
      `assumption #${index}: "branch" must be exactly "${inputs.branchAName}" or "${inputs.branchBName}"`,
    );
  }
  const conceptRaw = asNonEmptyString(raw.concept);
  const concept = conceptRaw ?? deriveConcept(statement);
  if (!concept) {
    throw new BobValidationError(
      `assumption #${index}: "concept" is missing and cannot be derived`,
    );
  }
  const file = typeof raw.file === 'string' && raw.file.trim().length > 0 ? raw.file.trim() : '—';
  const line =
    typeof raw.line === 'number' && Number.isInteger(raw.line) && raw.line >= 1 ? raw.line : null;
  const evidenceText =
    typeof raw.evidence === 'string' && raw.evidence.trim().length > 0
      ? firstLines(raw.evidence.trim(), 5)
      : null;
  const numeric =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.6;
  const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : '';

  const evidence: CodeEvidence[] =
    evidenceText !== null && file !== '—'
      ? [
          {
            source: 'FILE_CHANGE',
            filePath: file,
            lineStart: line,
            lineEnd: line,
            snippet: evidenceText,
            branchName: branch,
            metadata: { model, agent: agentType },
          },
        ]
      : [
          {
            source: 'INFERRED',
            filePath: file,
            lineStart: line,
            lineEnd: line,
            snippet: evidenceText,
            branchName: branch,
            metadata: { model, agent: agentType },
          },
        ];

  return {
    id,
    branchName: branch,
    sourceFile: file,
    statement,
    concept,
    value,
    sourceAgent: agentType,
    evidence,
    confidence: confidenceLabel(numeric),
    numericConfidence: numeric,
    relatedAssumptionIds: [],
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Parse Bob's raw completion into validated domain Assumptions.
 * Throws BobValidationError on any structural problem.
 */
export function parseBobAssumptions(
  rawText: string,
  agentType: AgentType,
  inputs: BobRunnerInputs,
  model: string,
): Assumption[] {
  const stripped = stripFences(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch {
    throw new BobValidationError('Bob returned invalid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BobValidationError('Bob response must be a JSON object with an "assumptions" array');
  }
  const list = (parsed as { assumptions?: unknown }).assumptions;
  if (!Array.isArray(list)) {
    throw new BobValidationError('Bob response is missing the "assumptions" array');
  }
  return list
    .slice(0, MAX_ASSUMPTIONS_PER_AGENT)
    .map((item, idx) => mapOne((item ?? {}) as BobAssumptionJson, idx, agentType, inputs, model));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return `${diff.slice(0, MAX_DIFF_CHARS)}\n[truncated for analysis]`;
}

function sanitizeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.slice(0, 300);
}

function progress(
  agentType: AgentType,
  status: 'running' | 'complete' | 'failed',
  message: string,
): AgentProgress {
  const now = new Date().toISOString();
  return {
    agentType,
    status,
    message,
    startedAt: status === 'running' ? now : null,
    completedAt: status === 'complete' || status === 'failed' ? now : null,
  };
}

/**
 * A real Bob-backed analysis agent. Construct via createBobRunners so all
 * five roles share one completer (shell subprocess or HTTPS) and one input set.
 */
export class BobAgentRunner {
  readonly agentType: AgentType;

  constructor(
    agentType: AgentType,
    private readonly completer: BobCompleter,
    private readonly inputs: BobRunnerInputs,
  ) {
    this.agentType = agentType;
  }

  async run(
    _requirement: FeatureRequest,
    _context: RepositorySource,
    onProgress: (p: AgentProgress) => void,
  ): Promise<Assumption[]> {
    onProgress(progress(this.agentType, 'running', 'Querying Bob inference…'));
    try {
      const text = await this.completer.complete(
        BOB_SYSTEM_PROMPT,
        buildPromptFor(this.agentType, {
          ...this.inputs,
          diffAText: truncateDiff(this.inputs.diffAText),
          diffBText: truncateDiff(this.inputs.diffBText),
        }),
      );
      const assumptions = parseBobAssumptions(
        text,
        this.agentType,
        this.inputs,
        this.completer.model,
      );
      onProgress(
        progress(this.agentType, 'complete', `Done (${assumptions.length} assumptions from Bob)`),
      );
      return assumptions;
    } catch (e) {
      // Contract: never throw, never fabricate — report failure and yield nothing.
      onProgress(
        progress(this.agentType, 'failed', `Bob ${this.agentType} failed: ${sanitizeError(e)}`),
      );
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Factory + engine bridge
// ---------------------------------------------------------------------------

export interface BobRunnerSet {
  requirementText: string;
  branchAName: string;
  branchBName: string;
  diffAText: string;
  diffBText: string;
}

export type BobTransport = 'shell' | 'https';

export interface BobRunnerFactoryOptions {
  /** 'shell' (Bob Shell subprocess, default) or 'https' (direct inference API). */
  transport?: BobTransport;
  /** Required for the https transport. */
  config?: ResolvedBobConfig;
  /** HTTPS fetch override (tests). */
  fetchFn?: typeof fetch;
  /** Shell subprocess options (cliPath, maxCostCoins, timeoutMs, execFn). */
  shell?: ShellCompleterOptions;
  /** Direct completer override (tests) — bypasses transport construction. */
  completer?: BobCompleter;
}

/**
 * Build the five Bob runners (intent, change, contract, dependency, adversary)
 * sharing one completer and one input set. Pass the result to
 * AnalysisPipeline.create().
 */
export function createBobRunners(
  set: BobRunnerSet,
  opts: BobRunnerFactoryOptions = {},
): BobAgentRunner[] {
  const inputs: BobRunnerInputs = {
    requirementText: set.requirementText,
    branchAName: set.branchAName,
    branchBName: set.branchBName,
    diffAText: set.diffAText,
    diffBText: set.diffBText,
  };
  let completer = opts.completer;
  if (!completer) {
    const transport = opts.transport ?? 'shell';
    if (transport === 'https') {
      if (!opts.config) {
        throw new BobValidationError(
          'Bob https transport requires a resolved client config (BOB_API_KEY)',
        );
      }
      completer = createHttpsCompleter(opts.config, opts.fetchFn);
    } else {
      completer = createShellCompleter(opts.shell);
    }
  }
  const types: AgentType[] = ['intent', 'change', 'contract', 'dependency', 'adversary'];
  return types.map((agentType) => new BobAgentRunner(agentType, completer, inputs));
}

/**
 * Render validated Bob assumptions as plain analysis text for the
 * deterministic semantic engine. Verbatim evidence travels with each claim so
 * the engine extracts the same code-level predicates Bob saw. The engine
 * extracts, normalizes, and decides from this text exactly as it does for
 * diff text — Bob never bypasses it.
 */
export function bobAssumptionsToDiffText(assumptions: Assumption[]): string {
  return assumptions
    .map((a) => {
      const snippet = a.evidence.map((e) => e.snippet).find((s) => s && s.trim());
      const base = `[${a.sourceAgent}] ${a.statement} — value: ${a.value} @ ${a.sourceFile} (${a.branchName})`;
      return snippet ? `${base} :: ${snippet.split('\n').slice(0, 2).join('\n')}` : base;
    })
    .join('\n');
}
