/**
 * bob-client.ts
 *
 * Minimal IBM Bob inference transport for MergeMind analysis agents.
 *
 * Contract status (verified 2026-09-26, see final implementation report):
 *   - Host `api.us-east.bob.ibm.com` is OFFICIAL (Bob firewall docs: required
 *     for all regions, auth centralized in US East).
 *   - Inference-scoped API keys authenticating inference requests is OFFICIAL
 *     (Bob API-keys docs). Optional `x-team-id` header for General keys is
 *     OFFICIAL (Bob Shell docs).
 *   - `/inference/v1/chat/completions` route, OpenAI-compatible chat body, and
 *     the `premium` model alias are OBSERVED from the installed Bob Shell
 *     client ecosystem — NOT published in official docs. They are therefore
 *     overridable: BOB_API_BASE_URL and BOB_MODEL replace them entirely.
 *
 * Security: the API key travels in exactly one place — the Authorization
 * header. It is never logged, never returned, and never interpolated into
 * error messages (all errors below are key-free by construction).
 */

export const DEFAULT_BOB_API_BASE_URL = 'https://api.us-east.bob.ibm.com/inference/v1';
export const DEFAULT_BOB_MODEL = 'premium';
export const DEFAULT_BOB_TIMEOUT_MS = 60_000;
export const BOB_MAX_TOKENS = 2000;

export interface BobClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  teamId?: string;
  timeoutMs?: number;
  /** Injectable fetch for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export interface ResolvedBobConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  teamId?: string | undefined;
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Typed errors — none carry the API key
// ---------------------------------------------------------------------------

export class BobError extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = 'BobError';
    this.kind = kind;
  }
}

export class BobConfigError extends BobError {
  constructor(message: string) {
    super('CONFIG', message);
    this.name = 'BobConfigError';
  }
}

export class BobAuthError extends BobError {
  constructor(message: string) {
    super('AUTH', message);
    this.name = 'BobAuthError';
  }
}

export class BobRateLimitError extends BobError {
  readonly retryAfterSecs: number | null;
  constructor(message: string, retryAfterSecs: number | null) {
    super('RATE_LIMIT', message);
    this.name = 'BobRateLimitError';
    this.retryAfterSecs = retryAfterSecs;
  }
}

export class BobTimeoutError extends BobError {
  constructor(message: string) {
    super('TIMEOUT', message);
    this.name = 'BobTimeoutError';
  }
}

export class BobNetworkError extends BobError {
  constructor(message: string) {
    super('NETWORK', message);
    this.name = 'BobNetworkError';
  }
}

export class BobValidationError extends BobError {
  constructor(message: string) {
    super('VALIDATION', message);
    this.name = 'BobValidationError';
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Resolve client configuration from explicit options.
 * Throws BobConfigError when required values are missing.
 */
export function resolveBobConfig(options: BobClientOptions): ResolvedBobConfig {
  if (!options.apiKey || options.apiKey.trim().length === 0) {
    throw new BobConfigError(
      'BOB_API_KEY is missing — set it in the API server environment to enable Bob analysis',
    );
  }
  const baseUrl = (options.baseUrl ?? DEFAULT_BOB_API_BASE_URL).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new BobConfigError('BOB_API_BASE_URL must be a non-empty URL');
  }
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:') {
      throw new BobConfigError('BOB_API_BASE_URL must use https');
    }
  } catch (e) {
    if (e instanceof BobConfigError) throw e;
    throw new BobConfigError('BOB_API_BASE_URL is not a valid URL');
  }
  const model = (options.model ?? DEFAULT_BOB_MODEL).trim();
  if (!model) {
    throw new BobConfigError('BOB_MODEL must be a non-empty string');
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_BOB_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new BobConfigError('BOB_TIMEOUT_MS must be a positive number');
  }
  const teamId = options.teamId?.trim() ? options.teamId.trim() : undefined;
  return { apiKey: options.apiKey, baseUrl, model, ...(teamId ? { teamId } : {}), timeoutMs };
}

/**
 * Resolve client configuration from process-style env records.
 * Reads BOB_API_KEY, BOB_API_BASE_URL, BOB_MODEL, BOB_TEAM_ID, BOB_TIMEOUT_MS.
 */
export function bobConfigFromEnv(env: NodeJS.ProcessEnv): ResolvedBobConfig {
  const timeoutRaw = env['BOB_TIMEOUT_MS']?.trim();
  return resolveBobConfig({
    apiKey: env['BOB_API_KEY'] ?? '',
    ...(env['BOB_API_BASE_URL'] ? { baseUrl: env['BOB_API_BASE_URL'] } : {}),
    ...(env['BOB_MODEL'] ? { model: env['BOB_MODEL'] } : {}),
    ...(env['BOB_TEAM_ID'] ? { teamId: env['BOB_TEAM_ID'] } : {}),
    ...(timeoutRaw ? { timeoutMs: Number(timeoutRaw) } : {}),
  });
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

/**
 * Send one non-streaming chat completion and return the assistant message text.
 * Temperature is fixed at 0 for deterministic analysis output.
 */
export async function completeJson(
  config: ResolvedBobConfig,
  systemPrompt: string,
  userPrompt: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    response = await fetchFn(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.teamId ? { 'x-team-id': config.teamId } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: BOB_MAX_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    // DOMException (abort) is not an Error instance in Node — check the name directly.
    const name = e instanceof Error ? e.name : (e as { name?: unknown } | null)?.name;
    if (name === 'AbortError') {
      throw new BobTimeoutError(
        `Bob inference timed out after ${config.timeoutMs}ms — the request was aborted`,
      );
    }
    throw new BobNetworkError(
      `Bob inference request failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new BobAuthError(
      `Bob rejected the API key (HTTP ${response.status}) — check BOB_API_KEY and subscription region`,
    );
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const secs = retryAfter !== null && retryAfter.trim() !== '' ? Number(retryAfter) : NaN;
    const retryAfterSecs = Number.isFinite(secs) ? secs : null;
    throw new BobRateLimitError(
      `Bob rate limit exceeded${retryAfterSecs !== null ? ` — retry after ${retryAfterSecs}s` : ' — try again later'}`,
      retryAfterSecs,
    );
  }
  if (!response.ok) {
    const body = await readBoundedBody(response);
    throw new BobNetworkError(
      `Bob inference failed with HTTP ${response.status}${body ? `: ${body}` : ''}`,
    );
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new BobValidationError('Bob returned a non-JSON response');
  }
  const content = (payload as ChatCompletionsResponse)?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new BobValidationError('Bob returned an empty completion');
  }
  return content;
}

async function readBoundedBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return '';
  }
}
