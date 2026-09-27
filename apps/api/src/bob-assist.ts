/**
 * bob-assist.ts — opt-in Bob inference for the /demo verification path.
 *
 * Self-contained because the API server is CommonJS while
 * @mergemind/analysis ships as ESM. It mirrors the assumption JSON schema
 * documented in packages/analysis/src/bob/bob-prompts.ts — keep the two in sync.
 *
 * Behavior: when BOB_API_KEY is set, each of the five roles is queried in
 * parallel and validated assumptions become extra engine input text. Any
 * failure yields a warning string, never fabricated assumptions. When the
 * key is absent the caller skips Bob entirely (deterministic-only).
 */

const DEFAULT_BASE_URL = 'https://api.us-east.bob.ibm.com/inference/v1';
const DEFAULT_MODEL = 'premium';
const DEFAULT_TIMEOUT_MS = 60_000;
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
    lines.push(
      `[${role}] ${r.statement.trim()} — value: ${r.value.trim()} @ ${file} (${r.branch as string})`,
    );
  }
  return lines;
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
 */
export async function runBobAssist(input: BobAssistInput): Promise<BobAssistResult> {
  const apiKey = (process.env.BOB_API_KEY ?? '').trim();
  if (!apiKey) return { texts: [], failures: [] };
  const baseUrl = (process.env.BOB_API_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const model = (process.env.BOB_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const teamId = (process.env.BOB_TEAM_ID ?? '').trim() || undefined;
  const timeoutRaw = (process.env.BOB_TIMEOUT_MS ?? '').trim();
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : DEFAULT_TIMEOUT_MS;

  type Settled =
    { agent: string; content: string } | { agent: string; content: null; failure: string };
  const settled: Settled[] = await Promise.all(
    ROLES.map(async (role): Promise<Settled> => {
      try {
        return await queryRole(role, input, baseUrl, apiKey, model, teamId, timeoutMs);
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
