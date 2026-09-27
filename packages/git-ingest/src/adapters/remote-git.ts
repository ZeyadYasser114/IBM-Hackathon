/**
 * adapters/remote-git.ts
 *
 * Remote GitHub ingestion for the real `/demo` pipeline.
 *
 * MVP scope: public HTTPS GitHub repositories only. The module validates the
 * repository URL, clones into a temporary directory, fetches the requested
 * refs, and delegates diff extraction to the existing LocalGitAdapter +
 * createRepositoryContext pipeline. No repository code is ever executed —
 * diffs are read as source text only.
 *
 * Security properties (enforced here, mirrored by API consumers):
 *   - Only `https://github.com/<owner>/<repo>` is accepted. No other hosts,
 *     schemes, credentials, ports, or IP literals.
 *   - All git invocations use `execFile('git', argsArray)` — never a shell,
 *     never string concatenation of user input.
 *   - Refs are validated against a strict allowlist before use.
 *   - Clone/fetch have timeouts; diff size and file count are capped.
 *   - The temporary directory is always removed (success or failure).
 *   - `GIT_TERMINAL_PROMPT=0` prevents credential-prompt hangs on private repos.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { BranchRef, ChangedFile } from '@mergemind/domain';

import { LocalGitAdapter } from './local-git.js';
import { createRepositoryContext } from '../ingest.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Limits (MVP safeguards)
// ---------------------------------------------------------------------------

export const CLONE_TIMEOUT_MS = 60_000;
export const FETCH_TIMEOUT_MS = 30_000;
export const GIT_TIMEOUT_MS = 30_000;
export const MAX_DIFF_BYTES = 1_000_000;
export const MAX_FILES = 200;

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  /** Canonical clone URL (always `https://github.com/<owner>/<repo>`) */
  canonicalUrl: string;
  /** Human-readable name (`<owner>/<repo>`) */
  name: string;
}

const OWNER_REPO_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Parse and validate a public GitHub repository URL.
 *
 * Accepts only `https://github.com/<owner>/<repo>` (optional trailing slash
 * or `.git` suffix, which is stripped). Rejects credentials, ports, non-GitHub
 * hosts, IP literals, and all non-HTTPS schemes.
 *
 * @throws {Error} with an actionable message when the URL is not acceptable.
 */
export function parseGitHubUrl(input: string): ParsedGitHubUrl {
  const raw = (input ?? '').trim();
  if (!raw) {
    throw new Error('repository is required — provide a public GitHub URL');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid repository URL "${raw}" — expected https://github.com/<owner>/<repo>`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      `unsupported repository scheme "${url.protocol}" — only https://github.com URLs are supported`,
    );
  }
  if (url.hostname.toLowerCase() !== 'github.com') {
    throw new Error(
      `unsupported repository host "${url.hostname}" — only github.com is supported in this MVP`,
    );
  }
  if (url.username || url.password) {
    throw new Error('repository URLs containing credentials are not allowed');
  }
  if (url.port) {
    throw new Error('repository URLs containing a port are not allowed');
  }

  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length !== 2) {
    throw new Error(`invalid GitHub repository path "${url.pathname}" — expected /<owner>/<repo>`);
  }
  const [owner, repoWithSuffix] = segments as [string, string];
  const repo = repoWithSuffix.replace(/\.git$/, '');
  if (!OWNER_REPO_PATTERN.test(owner) || !OWNER_REPO_PATTERN.test(repo)) {
    throw new Error(
      `invalid GitHub repository "${owner}/${repo}" — owner and repo may only contain letters, numbers, '.', '_' and '-'`,
    );
  }

  return {
    owner,
    repo,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
    name: `${owner}/${repo}`,
  };
}

// ---------------------------------------------------------------------------
// Ref validation
// ---------------------------------------------------------------------------

const REF_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SHA_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Validate a branch name or commit SHA before it is passed to git.
 * Rejects empty values, shell metacharacters, leading dashes (flag injection),
 * path traversal (`..`), and anything outside the allowlist.
 *
 * @throws {Error} with an actionable message when the ref is not acceptable.
 */
export function validateRef(ref: string, field: string): void {
  const value = (ref ?? '').trim();
  if (!value) {
    throw new Error(`${field} is required — provide a branch name or commit SHA`);
  }
  if (value.length > 255) {
    throw new Error(`${field} "${value}" is too long (max 255 characters)`);
  }
  if (value.startsWith('-') || value.startsWith('/')) {
    throw new Error(`${field} "${value}" must not start with '-' or '/'`);
  }
  if (value.includes('..') || value.includes('@{') || /\s/.test(value)) {
    throw new Error(`${field} "${value}" contains a forbidden sequence`);
  }
  if (SHA_PATTERN.test(value)) {
    if (value.length < 4 || value.length > 64) {
      throw new Error(`${field} "${value}" is not a valid commit SHA`);
    }
    return;
  }
  if (!REF_PATTERN.test(value)) {
    throw new Error(
      `${field} "${value}" contains invalid characters — use letters, numbers, '.', '_', '/' and '-' only`,
    );
  }
}

// ---------------------------------------------------------------------------
// Diff limits
// ---------------------------------------------------------------------------

/**
 * Enforce file-count and byte-size caps on ingested diffs.
 * Pure function so it can be unit-tested without cloning.
 *
 * @throws {Error} when either cap is exceeded.
 */
export function assertDiffLimits(
  files: readonly ChangedFile[],
  maxFiles: number = MAX_FILES,
  maxBytes: number = MAX_DIFF_BYTES,
): void {
  if (files.length > maxFiles) {
    throw new Error(
      `too many files changed (${files.length} > ${maxFiles}) — narrow the compared refs`,
    );
  }
  let total = 0;
  for (const f of files) {
    total += f.patch ? Buffer.byteLength(f.patch, 'utf8') : 0;
    if (total > maxBytes) {
      throw new Error(`diff too large (>${maxBytes} bytes) — narrow the compared refs`);
    }
  }
}

// ---------------------------------------------------------------------------
// Remote ingest
// ---------------------------------------------------------------------------

export interface RemoteIngestOptions {
  /** Raw user-supplied repository URL (validated with parseGitHubUrl) */
  repository: string;
  baseBranch: string;
  changeA: string;
  changeB: string;
  cloneTimeoutMs?: number;
  fetchTimeoutMs?: number;
  maxDiffBytes?: number;
  maxFiles?: number;
}

export interface RemoteIngestResult {
  /** Absolute path of the temporary clone (removed after cleanup) */
  repoPath: string;
  /** Remove the temporary directory. Always call in a finally block. */
  cleanup: () => Promise<void>;
  parsed: ParsedGitHubUrl;
  base: BranchRef;
  changeARef: BranchRef;
  changeBRef: BranchRef;
  changedFiles: ChangedFile[];
  totalDiffBytes: number;
}

function gitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0' };
}

async function runGit(args: string[], cwd: string, timeout: number): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 50 * 1024 * 1024,
    env: gitEnv(),
  });
  return stdout;
}

async function resolveRef(runnerCwd: string, name: string): Promise<BranchRef> {
  for (const candidate of [name, `origin/${name}`]) {
    try {
      const sha = (
        await runGit(['rev-parse', '--verify', candidate], runnerCwd, GIT_TIMEOUT_MS)
      ).trim();
      if (sha) return { name, sha };
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `could not resolve ref "${name}" — check the branch/commit exists and is fetched from the remote`,
  );
}

/**
 * Decide whether a ref needs a local branch pointer. Raw commit SHAs resolve
 * directly from fetched objects; branch names need `branch -f` because a
 * --no-checkout clone may not create local branches for them (notably when
 * the remote HEAD points elsewhere).
 */
export function needsLocalBranch(name: string): boolean {
  const value = name.trim();
  if (/^[0-9a-fA-F]+$/.test(value) && value.length >= 4 && value.length <= 64) return false;
  return true;
}

/**
 * Pin a local branch to an already-resolved SHA so name-based consumers
 * (LocalGitAdapter, createRepositoryContext) work regardless of which branch
 * the remote HEAD points at. No checkout, no working-tree reads — diffs use
 * object SHAs only, so moving the ref is safe here.
 */
async function ensureLocalBranch(repoPath: string, name: string, sha: string): Promise<void> {
  if (!needsLocalBranch(name)) return;
  try {
    const current = (
      await runGit(['rev-parse', '--verify', name], repoPath, GIT_TIMEOUT_MS)
    ).trim();
    if (current.toLowerCase() === sha.toLowerCase()) return;
  } catch {
    // Not resolvable locally — pin it below.
  }
  try {
    await runGit(['branch', '-f', name, sha], repoPath, GIT_TIMEOUT_MS);
  } catch {
    // `branch -f` refuses the checked-out branch (e.g. when the remote HEAD
    // points at one of our refs). Move the ref directly instead.
    await runGit(['update-ref', `refs/heads/${name}`, sha], repoPath, GIT_TIMEOUT_MS);
  }
}

/**
 * Clone a public GitHub repository into a temp dir and extract real diffs for
 * both changes against the base branch.
 *
 * The caller MUST call `cleanup()` in a finally block. Repository code is
 * never executed — diffs are read as text via `git diff` only.
 */
export async function ingestRemoteRepository(
  options: RemoteIngestOptions,
): Promise<RemoteIngestResult> {
  const parsed = parseGitHubUrl(options.repository);
  const baseBranch = (options.baseBranch ?? '').trim() || 'main';
  validateRef(baseBranch, 'baseBranch');
  validateRef(options.changeA, 'branchA');
  validateRef(options.changeB, 'branchB');

  const maxDiffBytes = options.maxDiffBytes ?? MAX_DIFF_BYTES;
  const maxFiles = options.maxFiles ?? MAX_FILES;

  const workDir = await mkdtemp(join(tmpdir(), 'mergemind-'));
  const repoPath = join(workDir, 'repo');
  const cleanup = async (): Promise<void> => {
    await rm(workDir, { recursive: true, force: true });
  };

  try {
    // Shallow, blobless, no-checkout clone — fetches commit graph without blobs.
    // Argument array form: user input never touches a shell.
    await execFileAsync(
      'git',
      ['clone', '--filter=blob:none', '--no-checkout', parsed.canonicalUrl, repoPath],
      {
        cwd: workDir,
        timeout: options.cloneTimeoutMs ?? CLONE_TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024,
        env: gitEnv(),
      },
    );

    // Fetch the three refs we need (branches; SHAs resolve from history).
    // Non-zero exit here is non-fatal — resolveRef reports the actionable error.
    try {
      await runGit(
        ['fetch', 'origin', baseBranch, options.changeA, options.changeB, '--depth', '100'],
        repoPath,
        options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS,
      );
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      // If the fetch itself failed (e.g. missing repo), surface it directly —
      // resolveRef fallbacks cannot succeed without fetched objects.
      if (/not found|could not read|authentication|unable to access/i.test(message)) {
        throw new Error(`could not fetch from ${parsed.canonicalUrl} — ${message}`);
      }
    }

    const base = await resolveRef(repoPath, baseBranch);
    const changeARef = await resolveRef(repoPath, options.changeA);
    const changeBRef = await resolveRef(repoPath, options.changeB);

    // Pin local branches: a --no-checkout clone only guarantees the remote
    // HEAD branch locally, so name-based diffing would fail otherwise.
    await ensureLocalBranch(repoPath, base.name, base.sha);
    await ensureLocalBranch(repoPath, changeARef.name, changeARef.sha);
    await ensureLocalBranch(repoPath, changeBRef.name, changeBRef.sha);

    // Reuse the existing deterministic pipeline: LocalGitAdapter + orchestrator.
    const adapter = new LocalGitAdapter(repoPath);
    const ingestResult = await createRepositoryContext(
      adapter,
      { name: parsed.name, cloneUrl: parsed.canonicalUrl, provider: 'github' },
      base.name,
      [changeARef.name, changeBRef.name],
    );

    assertDiffLimits(ingestResult.changedFiles, maxFiles, maxDiffBytes);
    let totalDiffBytes = 0;
    for (const f of ingestResult.changedFiles) {
      totalDiffBytes += f.patch ? Buffer.byteLength(f.patch, 'utf8') : 0;
    }

    return {
      repoPath,
      cleanup,
      parsed,
      base: ingestResult.source.baseBranch,
      changeARef: ingestResult.source.featureBranches[0] ?? changeARef,
      changeBRef: ingestResult.source.featureBranches[1] ?? changeBRef,
      changedFiles: ingestResult.changedFiles,
      totalDiffBytes,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
