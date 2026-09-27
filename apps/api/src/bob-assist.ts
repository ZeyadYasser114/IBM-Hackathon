/**
 * bob-assist.ts — opt-in Bob analysis for the /demo verification path.
 *
 * Self-contained because the API server is CommonJS while
 * @mergemind/analysis ships as ESM. It mirrors the assumption JSON schema
 * documented in packages/analysis/src/bob/bob-prompts.ts — keep the two in sync.
 *
 * Transport (BOB_TRANSPORT, default: shell):
 *   - shell (default, verified): `bob run --mode ask --format json` subprocess.
 *     The key is never read here — the child inherits the server environment.
 *     `--mode ask` is read-only and `--max-cost` bounds spend per call.
 *   - https: direct inference API (kept as an alternative; observed
 *     edge-challenged in some environments).
 *
 * Behavior: when BOB_API_KEY is set, each of the five roles is queried in
 * parallel and validated assumptions become extra engine input text. Any
 * failure yields a warning string, never fabricated assumptions. When the
 * key is absent the caller skips Bob entirely (deterministic-only).
 */

import { spawn } from 'node:child_process';

const DEFAULT_BASE_URL = 'https://api.us-east.bob.ibm.com/inference/v1';
const DEFAULT_MODEL = 'premium';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_SHELL_TIMEOUT_MS = 180_000;
const DEFAULT_CLI_PATH = 'bob';
const DEFAULT_MAX_COST = 0.5;
const MAX_TOKENS = 2000;
const MAX_DIFF_CHARS = 12_000;

export interface BobAssistInput {
  requirementText: string;
  branchA: string;
  branchB: string;
  diffA: string;
  diffB: string;
}

export interface BobAssistResult {
  /** Per-agent validated assumption text for the semantic engine (may be empty). */
  texts: { agent: string; content: string }[];
  /** Human-readable failure notes for session warnings (never the API key). */
  failures: string[];
}

type Role = 'intent' | 'change' | 'contract' | 'dependency' | 'adversary';

const ROLES: Role[] = ['intent', 'change', 'contract', 'dependency', 'adversary'];

const SCHEMA = `{"assumptions": [{"id": "optional slug", "statement": "REQUIRED claim", "concept": "kebab-case key", "value": "REQUIRED asserted value", "branch": "REQUIRED exact branch name", "file": "repo-relative path", "line": 123 or null, "evidence": "verbatim excerpt, max 5 lines", "confidence": 0.0-1.0}]}`;

function roleInstruction(role: Role): string {
  switch (role) {
    case 'intent':
      return 'You are the Intent Agent. Analyze ONLY the requirement: intended behavior, business rules, key assumptions.';
    case 'change':
      return 'You are the Change Agent. Analyze the two diffs: behavior each change introduces, with evidence.';
    case 'contract':
      return 'You are the Contract Agent. Inspect API signatures, interfaces, schemas, types, models in the diffs.';
    case 'dependency':
      return 'You are the Dependency Agent. Inspect shared fields, roles, states, lifecycles, dependencies.';
    case 'adversary':
      return 'You are the Adversary Agent. Find what is true in Change A but false in Change B, and what requirement could break despite a clean Git merge.';
  }
}

function buildPrompt(role: Role, input: BobAssistInput): string {
  const cut = (d: string) =>
    d.length <= MAX_DIFF_CHARS ? d : `${d.slice(0, MAX_DIFF_CHARS)}\n[truncated for analysis]`;
  return (
    `${roleInstruction(role)}\n` +
    `Requirement: ${input.requirementText}\nBranch A: ${input.branchA}\nBranch B: ${input.branchB}\n` +
    `--- Change A diff ---\n${cut(input.diffA)}\n--- Change B diff ---\n${cut(input.diffB)}\n` +
    `Do NOT judge whether the merge is safe. Return ONLY one JSON object shaped like ${SCHEMA} — no fences, no commentary. Empty "assumptions" is valid.`
  );
}

function stripFences(text: string): string {
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return m?.[1] !== undefined ? m[1].trim() : text.trim();
}

interface RawAssumption {
  statement?: unknown;
  value?: unknown;
  branch?: unknown;
  file?: unknown;
  evidence?: unknown;
}

function firstLines(text: string, maxLines: number): string {
  return text.split('\n').slice(0, maxLines).join('\n');
}

function toTextLines(role: Role, input: BobAssistInput, rawText: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(rawText)) as unknown;
  } catch {
    throw new Error(`Bob ${role} returned invalid JSON`);
  }
  const list =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as { assumptions?: unknown }).assumptions
      : null;
  if (!Array.isArray(list))
    throw new Error(`Bob ${role} response is missing the "assumptions" array`);
  const lines: string[] = [];
  for (const item of list.slice(0, 50)) {
    const r = (item ?? {}) as RawAssumption;
    if (typeof r.statement !== 'string' || !r.statement.trim()) {
      throw new Error(`Bob ${role} assumption is missing "statement"`);
    }
    if (typeof r.value !== 'string' || !r.value.trim()) {
      throw new Error(`Bob ${role} assumption is missing "value"`);
    }
    if (r.branch !== input.branchA && r.branch !== input.branchB) {
      throw new Error(`Bob ${role} assumption has an unknown "branch"`);
    }
    const file = typeof r.file === 'string' && r.file.trim() ? r.file.trim() : '—';
    // Verbatim evidence travels with the claim so the engine extracts the same
    // code-level predicates Bob saw (not just its paraphrase).
    const evidence =
      typeof r.evidence === 'string' && r.evidence.trim()
        ? ` :: ${firstLines(r.evidence.trim(), 2)}`
        : '';
    lines.push(
      `[${role}] ${r.statement.trim()} — value: ${r.value.trim()} @ ${file} (${r.branch as string})${evidence}`,
    );
  }
  return lines;
}

function runShell(
  cliPath: string,
  args: string[],
  input: string,
  timeoutMs: number,
  apiKey: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Windows npm shims are .cmd files, which spawn/execFile cannot launch
    // without a shell — resolve the extension explicitly. Prompt travels via
    // stdin, never the command line; argv stays a fixed literal vector.
    const bin =
      process.platform === 'win32' && !/\.(cmd|exe|bat)$/i.test(cliPath)
        ? `${cliPath}.cmd`
        : cliPath;
    // The child authenticates from its own environment (the documented Bob
    // Shell mechanism). A per-request key is injected here, memory-only.
    const child = spawn(bin, args, {
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, BOB_API_KEY: apiKey },
      ...(process.platform === 'win32' ? { shell: true } : {}),
    });
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (fn: () => void) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        fn();
      }
    };
    const timer = setTimeout(() => {
      finish(() => {
        child.kill();
        reject(new Error(`Bob Shell timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (e: Error) => {
      const code = (e as NodeJS.ErrnoException).code;
      finish(() =>
        reject(
          code === 'ENOENT'
            ? new Error(`Bob Shell CLI not found at "${cliPath}" — install Bob Shell`)
            : new Error(`Could not start Bob Shell: ${e.message}`.slice(0, 300)),
        ),
      );
    });
    child.on('close', (code: number | null) => {
      finish(() =>
        code === 0
          ? resolve({ stdout, stderr })
          : reject(new Error(`Bob Shell exited (${code}): ${stderr.slice(0, 200)}`.trim())),
      );
    });
    try {
      if (child.stdin) {
        child.stdin.write(input);
        child.stdin.end();
      }
    } catch (e) {
      finish(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}

async function queryShell(
  role: Role,
  input: BobAssistInput,
  cliPath: string,
  maxCost: number,
  timeoutMs: number,
  apiKey: string,
): Promise<{ agent: string; content: string }> {
  const { stdout, stderr } = await runShell(
    cliPath,
    ['run', '--mode', 'ask', '--format', 'json', '--max-cost', String(maxCost), '--trust'],
    `You output valid JSON matching the requested schema and nothing else.\n\n${buildPrompt(role, input)}`,
    timeoutMs,
    apiKey,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim()) as unknown;
  } catch {
    throw new Error(
      `Bob ${role} returned non-JSON output${stderr.trim() ? `: ${stderr.slice(0, 200)}` : ''}`,
    );
  }
  const typed = parsed as { type?: unknown; status?: unknown; last_message?: unknown };
  if (typed.type !== 'result' || typed.status !== 'success') {
    throw new Error(`Bob ${role} reported status "${String(typed.status ?? 'unknown')}"`);
  }
  if (typeof typed.last_message !== 'string' || !typed.last_message.trim()) {
    throw new Error(`Bob ${role} returned an empty message`);
  }
  const lines = toTextLines(role, input, typed.last_message);
  return { agent: role, content: lines.join('\n') };
}

async function queryRole(
  role: Role,
  input: BobAssistInput,
  baseUrl: string,
  apiKey: string,
  model: string,
  teamId: string | undefined,
  timeoutMs: number,
): Promise<{ agent: string; content: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(teamId ? { 'x-team-id': teamId } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You output valid JSON matching the requested schema and nothing else.',
          },
          { role: 'user', content: buildPrompt(role, input) },
        ],
        temperature: 0,
        max_tokens: MAX_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Bob rejected the API key (HTTP ${response.status})`);
    }
    if (response.status === 429) {
      throw new Error('Bob rate limit exceeded — try again later');
    }
    if (!response.ok) throw new Error(`Bob inference failed with HTTP ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim())
      throw new Error('Bob returned an empty completion');
    const lines = toTextLines(role, input, content);
    return { agent: role, content: lines.join('\n') };
  } catch (e) {
    const name = e instanceof Error ? e.name : (e as { name?: unknown } | null)?.name;
    if (name === 'AbortError') throw new Error(`Bob ${role} timed out after ${timeoutMs}ms`);
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run all five Bob roles in parallel. Never throws: per-role failures are
 * collected in `failures`, successes in `texts`. Empty texts + failures means
 * Bob contributed nothing — the caller proceeds deterministically.
 *
 * The key resolves per call: an explicit override (per-request key) wins,
 * otherwise the server environment is used. Absent in both → Bob skipped.
 */
export async function runBobAssist(
  input: BobAssistInput,
  keyOverride?: string,
): Promise<BobAssistResult> {
  const apiKey = (keyOverride ?? process.env.BOB_API_KEY ?? '').trim();
  if (!apiKey) return { texts: [], failures: [] };
  const transport = (process.env.BOB_TRANSPORT ?? 'shell').trim().toLowerCase();
  const cliPath = (process.env.BOB_CLI_PATH ?? DEFAULT_CLI_PATH).trim() || DEFAULT_CLI_PATH;
  const maxCostRaw = (process.env.BOB_MAX_COST ?? '').trim();
  const maxCost = maxCostRaw ? Number(maxCostRaw) : DEFAULT_MAX_COST;
  const baseUrl = (process.env.BOB_API_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const model = (process.env.BOB_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const teamId = (process.env.BOB_TEAM_ID ?? '').trim() || undefined;
  const timeoutRaw = (process.env.BOB_TIMEOUT_MS ?? '').trim();
  const timeoutMs = timeoutRaw
    ? Number(timeoutRaw)
    : transport === 'https'
      ? DEFAULT_TIMEOUT_MS
      : DEFAULT_SHELL_TIMEOUT_MS;

  type Settled =
    { agent: string; content: string } | { agent: string; content: null; failure: string };
  // Staggered starts: parallel `bob run` processes share one local task
  // database, and simultaneous spawns intermittently lock it. A small
  // per-agent delay removes the contention; calls still overlap.
  const STAGGER_MS = 400;
  const settled: Settled[] = await Promise.all(
    ROLES.map(async (role, index): Promise<Settled> => {
      try {
        if (index > 0) await new Promise((r) => setTimeout(r, STAGGER_MS * index));
        if (transport === 'https') {
          return await queryRole(role, input, baseUrl, apiKey, model, teamId, timeoutMs);
        }
        return await queryShell(role, input, cliPath, maxCost, timeoutMs, apiKey);
      } catch (e) {
        return {
          agent: role,
          content: null,
          failure: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
  const texts = settled
    .filter((s): s is { agent: string; content: string } => s.content !== null)
    .filter((s) => s.content.length > 0)
    .map((s) => ({ agent: s.agent, content: s.content }));
  const failures = settled
    .filter((s): s is { agent: string; content: null; failure: string } => s.content === null)
    .map((s) => `Bob ${s.agent} unavailable: ${s.failure}`.slice(0, 300));
  return { texts, failures };
}
