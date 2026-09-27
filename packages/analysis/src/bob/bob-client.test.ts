/**
 * bob-client.test.ts — transport + config tests with injected mock fetch.
 * No network access. Asserts the API key never appears in any error.
 */

import {
  resolveBobConfig,
  bobConfigFromEnv,
  completeJson,
  BobConfigError,
  BobAuthError,
  BobRateLimitError,
  BobTimeoutError,
  BobValidationError,
  DEFAULT_BOB_API_BASE_URL,
  DEFAULT_BOB_MODEL,
  type ResolvedBobConfig,
} from './bob-client.js';

const SECRET = 'sk-test-secret-value-123';

function config(): ResolvedBobConfig {
  return resolveBobConfig({ apiKey: SECRET });
}

function okFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return (async () => new Response(JSON.stringify(body), { status, headers })) as typeof fetch;
}

function chatBody(content: string) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

describe('resolveBobConfig', () => {
  it('throws a clear error when the key is missing', () => {
    expect(() => resolveBobConfig({ apiKey: '' })).toThrow(BobConfigError);
    expect(() => resolveBobConfig({ apiKey: '   ' })).toThrow(/BOB_API_KEY/);
  });

  it('applies documented defaults', () => {
    const c = config();
    expect(c.baseUrl).toBe(DEFAULT_BOB_API_BASE_URL);
    expect(c.model).toBe(DEFAULT_BOB_MODEL);
  });

  it('rejects non-https and malformed base URLs', () => {
    expect(() => resolveBobConfig({ apiKey: SECRET, baseUrl: 'http://x/y' })).toThrow(
      BobConfigError,
    );
    expect(() => resolveBobConfig({ apiKey: SECRET, baseUrl: 'not-a-url' })).toThrow(
      BobConfigError,
    );
  });

  it('reads env records', () => {
    const c = bobConfigFromEnv({
      BOB_API_KEY: SECRET,
      BOB_MODEL: 'custom-model',
      BOB_TIMEOUT_MS: '5000',
    } as NodeJS.ProcessEnv);
    expect(c.model).toBe('custom-model');
    expect(c.timeoutMs).toBe(5000);
  });
});

describe('completeJson', () => {
  it('posts chat completions with Bearer auth and returns content', async () => {
    let seenUrl = '';
    let seenAuth = '';
    let seenBody: Record<string, unknown> = {};
    const fetchFn = (async (url: unknown, init?: RequestInit) => {
      seenUrl = String(url);
      seenAuth = (init?.headers as Record<string, string>)['Authorization'] ?? '';
      seenBody = JSON.parse(init?.body as string) as Record<string, unknown>;
      return new Response(JSON.stringify(chatBody('{"assumptions": []}')), { status: 200 });
    }) as typeof fetch;

    const text = await completeJson(config(), 'sys', 'user', fetchFn);
    expect(text).toBe('{"assumptions": []}');
    expect(seenUrl).toBe(`${DEFAULT_BOB_API_BASE_URL}/chat/completions`);
    expect(seenAuth).toBe(`Bearer ${SECRET}`);
    expect(seenBody['model']).toBe(DEFAULT_BOB_MODEL);
    expect(seenBody['temperature']).toBe(0);
    expect(seenBody['stream']).toBe(false);
  });

  it('maps 401 to an auth error without the key', async () => {
    const err = await completeJson(config(), 's', 'u', okFetch({}, 401)).catch((e) => e);
    expect(err).toBeInstanceOf(BobAuthError);
    expect(String(err.message)).not.toContain(SECRET);
  });

  it('maps 429 to a rate-limit error with retry hint', async () => {
    const fetchFn = okFetch({}, 429, { 'retry-after': '30' });
    const err = await completeJson(config(), 's', 'u', fetchFn).catch((e) => e);
    expect(err).toBeInstanceOf(BobRateLimitError);
    expect((err as BobRateLimitError).retryAfterSecs).toBe(30);
    expect(String(err.message)).not.toContain(SECRET);
  });

  it('maps aborts to a timeout error', async () => {
    const hanging = ((url: unknown, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as typeof fetch;
    const cfg: ResolvedBobConfig = { ...config(), timeoutMs: 50 };
    const err = await completeJson(cfg, 's', 'u', hanging).catch((e) => e);
    expect(err).toBeInstanceOf(BobTimeoutError);
  });

  it('rejects non-JSON and empty completions', async () => {
    const bad = await completeJson(
      config(),
      's',
      'u',
      (async () => new Response('not json', { status: 200 })) as typeof fetch,
    ).catch((e) => e);
    expect(bad).toBeInstanceOf(BobValidationError);

    const empty = await completeJson(config(), 's', 'u', okFetch({ choices: [] })).catch((e) => e);
    expect(empty).toBeInstanceOf(BobValidationError);
  });
});
