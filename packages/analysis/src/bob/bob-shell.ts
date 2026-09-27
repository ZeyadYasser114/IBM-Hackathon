/**
 * bob-shell.ts
 *
 * IBM Bob Shell subprocess transport for MergeMind analysis agents.
 *
 * Why a subprocess and not raw HTTPS: verified 2026-09-27 — direct HTTPS calls
 * to api.us-east.bob.ibm.com from Node receive an edge-challenge page
 * (Cloudflare "Attention Required") for every header variant, while the
 * official Bob Shell CLI on the same machine authenticates and answers.
 * The CLI is IBM's documented programmatic path (`bob run --format json`).
 *
 * Security properties:
 *   - The API key is NEVER read by this code: the child inherits the server
 *     process environment, so the secret value never appears in arguments,
 *     prompts, logs, or errors.
 *   - Execution uses execFile with an argument array (no shell).
 *   - `--mode ask` is read-only: no tools, no edits, no subagents spawn.
 *   - `--max-cost` bounds spend per call; `--trust` avoids interactive prompts.
 */

import { execFile } from 'node:child_process';

export const DEFAULT_BOB_CLI_PATH = 'bob';
export const DEFAULT_BOB_MAX_COST_COINS = 0.5;
export const DEFAULT_BOB_SHELL_TIMEOUT_MS = 180_000;

export interface ShellExecResult {
  stdout: string;
  stderr: string;
}

/** Injectable process runner (tests substitute a fake; production uses execFile). */
export type ShellExecFn = (args: string[], input: string) => Promise<ShellExecResult>;

export interface ShellCompleterOptions {
  cliPath?: string;
  maxCostCoins?: number;
  timeoutMs?: number;
  execFn?: ShellExecFn;
}

export class BobShellError extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = 'BobShellError';
    this.kind = kind;
  }
}

function defaultExec(cliPath: string, timeoutMs: number): ShellExecFn {
  return (args: string[], input: string) =>
    new Promise<ShellExecResult>((resolve, reject) => {
      // Windows npm shims are .cmd files, which execFile cannot launch
      // without a shell — resolve the extension explicitly.
      const bin = resolveCliBin(cliPath, process.platform);
      // Prompt travels via stdin, never the command line; argv stays a fixed
      // literal vector. `shell` is required on Windows to execute .cmd shims.
      const child = execFile(
        bin,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          ...(process.platform === 'win32' ? { shell: true } : {}),
        },
        (error, stdout, stderr) => {
          if (error) {
            const err = error as NodeJS.ErrnoException & { code?: unknown; killed?: boolean };
            if (err.killed) {
              reject(
                new BobShellError(
                  'TIMEOUT',
                  `Bob Shell timed out after ${timeoutMs}ms — the process was killed`,
                ),
              );
              return;
            }
            if (err.code === 'ENOENT') {
              reject(
                new BobShellError(
                  'MISSING_CLI',
                  `Bob Shell CLI not found at "${cliPath}" — install Bob Shell or set BOB_CLI_PATH`,
                ),
              );
              return;
            }
            reject(
              new BobShellError(
                'EXIT',
                `Bob Shell exited with an error: ${String(stderr || error.message).slice(0, 300)}`,
              ),
            );
            return;
          }
          resolve({ stdout: String(stdout), stderr: String(stderr) });
        },
      );
      if (child.stdin) {
        child.stdin.write(input);
        child.stdin.end();
      }
    });
}

/**
 * Resolve the executable name for the current platform. Exported for tests.
 */
export function resolveCliBin(
  cliPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32' && !/\.(cmd|exe|bat)$/i.test(cliPath)) {
    return `${cliPath}.cmd`;
  }
  return cliPath;
}

interface BobShellResultJson {
  type?: unknown;
  status?: unknown;
  last_message?: unknown;
}

/**
 * Build a completer function with the `(system, user) => text` shape the
 * runners consume. The system prompt is folded into the piped prompt because
 * `bob run` takes a single prompt input.
 */
export function createShellCompleter(options: ShellCompleterOptions = {}): {
  complete: (systemPrompt: string, userPrompt: string) => Promise<string>;
  model: string;
} {
  const cliPath = options.cliPath?.trim() || DEFAULT_BOB_CLI_PATH;
  const maxCostCoins = options.maxCostCoins ?? DEFAULT_BOB_MAX_COST_COINS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_BOB_SHELL_TIMEOUT_MS;
  if (!Number.isFinite(maxCostCoins) || maxCostCoins <= 0) {
    throw new BobShellError('CONFIG', 'BOB_MAX_COST must be a positive number');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new BobShellError('CONFIG', 'BOB_TIMEOUT_MS must be a positive number');
  }
  const execFn = options.execFn ?? defaultExec(cliPath, timeoutMs);

  return {
    // No single model string exists for Shell runs; label the provenance.
    model: 'bob-shell',
    complete: async (systemPrompt: string, userPrompt: string): Promise<string> => {
      const prompt = `${systemPrompt}\n\n${userPrompt}`;
      let result: ShellExecResult;
      try {
        result = await execFn(
          [
            'run',
            '--mode',
            'ask',
            '--format',
            'json',
            '--max-cost',
            String(maxCostCoins),
            '--trust',
          ],
          prompt,
        );
      } catch (e) {
        if (e instanceof BobShellError) throw e;
        throw new BobShellError(
          'SPAWN',
          `Could not start Bob Shell: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300),
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout.trim()) as unknown;
      } catch {
        throw new BobShellError(
          'OUTPUT',
          `Bob Shell returned non-JSON output: ${result.stdout.slice(0, 200)}${result.stderr.trim() ? ` (stderr: ${result.stderr.slice(0, 200)})` : ''}`,
        );
      }
      const typed = parsed as BobShellResultJson;
      if (typed.type !== 'result' || typed.status !== 'success') {
        throw new BobShellError(
          'STATUS',
          `Bob Shell reported status "${String(typed.status ?? 'unknown')}" instead of success`,
        );
      }
      if (typeof typed.last_message !== 'string' || typed.last_message.trim().length === 0) {
        throw new BobShellError('OUTPUT', 'Bob Shell returned an empty message');
      }
      return typed.last_message;
    },
  };
}
