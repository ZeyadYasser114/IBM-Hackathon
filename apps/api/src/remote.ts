/**
 * remote.ts — self-contained remote GitHub ingestion for the API server.
 *
 * Mirrors the validation rules of `@mergemind/git-ingest` remote-git adapter.
 * Implemented locally because the API server is CommonJS while git-ingest
 * ships as ESM; duplicating the small validation surface avoids cross-module
 * interop risk. The git command sequence is identical:
 * validate → mkdtemp → clone → fetch → rev-parse → diff → cleanup.
 *
 * Security: public https://github.com URLs only, execFile argument arrays,
 * no shell, ref allowlist, timeouts, diff/file caps, temp cleanup, and
 * GIT_TERMINAL_PROMPT=0. Repository code is never executed — diffs are read
 * as source text only. No installs or builds are ever run inside the clone.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const CLONE_TIMEOUT_MS = 60_000;
export const FETCH_TIMEOUT_MS = 30_000;
export const GIT_TIMEOUT_MS = 30_000;
export const MAX_DIFF_BYTES = 1_000_000;
export const MAX_FILES = 200;

const OWNER_REPO_PATTERN = /^[A-Za-z0-9_.-]+$/;
const REF_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SHA_PATTERN = /^[0-9a-fA-F]+$/;

export function parseGitHubUrl(input: string): {
  owner: string;
  repo: string;
  canonicalUrl: string;
  name: string;
} {
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

async function resolveRef(repoPath: string, name: string): Promise<{ name: string; sha: string }> {
  for (const candidate of [name, `origin/${name}`]) {
    try {
      const sha = (
        await runGit(['rev-parse', '--verify', candidate], repoPath, GIT_TIMEOUT_MS)
      ).trim();
      if (sha) return { name, sha };
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `could not resolve ref "${name}" — check the branch/commit exists in the repository`,
  );
}

export interface CloneDiffs {
  repoName: string;
  cloneUrl: string;
  baseSha: string;
  shaA: string;
  shaB: string;
  diffA: string;
  diffB: string;
  files: string[];
  cleanup: () => Promise<void>;
}

function fileListFromDiffNames(output: string): string[] {
  return output
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface DiffFileChunk {
  path: string;
  content: string;
}

const MAX_SNIPPET_CHARS = 20_000;
export const MAX_SNIPPET_FILES = 50;

/**
 * Split a unified diff into per-file chunks by `diff --git` headers.
 * Deliberately minimal (header split only) — NOT a diff parser. Each chunk
 * carries its real repository-relative path so engine evidence keeps file
 * attribution. Chunks are truncated to keep engine input bounded.
 */
export function splitDiffByFile(diff: string): DiffFileChunk[] {
  const chunks: DiffFileChunk[] = [];
  const headerPattern = /^diff --git a\/(.+?) b\/(.+)$/gm;
  const headers: { path: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(diff)) !== null) {
    headers.push({ path: (match[2] ?? match[1]).trim(), index: match.index });
  }
  if (headers.length === 0) return chunks;
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i]!.index;
    const end = i + 1 < headers.length ? headers[i + 1]!.index : diff.length;
    const content = diff.slice(start, end).slice(0, MAX_SNIPPET_CHARS);
    chunks.push({ path: headers[i]!.path, content });
    if (chunks.length >= MAX_SNIPPET_FILES) break;
  }
  return chunks;
}

/**
 * Clone the repository and return the real unified diffs of both changes
 * against the base. Caller MUST await cleanup() in a finally block.
 */
export async function cloneAndDiff(
  repository: string,
  baseBranch: string,
  changeA: string,
  changeB: string,
): Promise<CloneDiffs> {
  const parsed = parseGitHubUrl(repository);
  const base = (baseBranch ?? '').trim() || 'main';
  validateRef(base, 'baseBranch');
  validateRef(changeA, 'branchA');
  validateRef(changeB, 'branchB');

  const workDir = await mkdtemp(join(tmpdir(), 'mergemind-'));
  const repoPath = join(workDir, 'repo');
  const cleanup = async (): Promise<void> => {
    await rm(workDir, { recursive: true, force: true });
  };

  try {
    await execFileAsync(
      'git',
      ['clone', '--filter=blob:none', '--no-checkout', parsed.canonicalUrl, repoPath],
      {
        cwd: workDir,
        timeout: CLONE_TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024,
        env: gitEnv(),
      },
    ).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`could not clone ${parsed.canonicalUrl} — ${message}`);
    });

    try {
      await runGit(
        ['fetch', 'origin', base, changeA, changeB, '--depth', '100'],
        repoPath,
        FETCH_TIMEOUT_MS,
      );
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (/not found|could not read|authentication|unable to access|couldn't find/i.test(message)) {
        throw new Error(`could not fetch from ${parsed.canonicalUrl} — ${message}`);
      }
      // otherwise fall through to resolveRef for the actionable error
    }

    const baseRef = await resolveRef(repoPath, base);
    const refA = await resolveRef(repoPath, changeA);
    const refB = await resolveRef(repoPath, changeB);

    const diffA = await runGit(
      ['diff', '--unified=3', '--no-color', `${baseRef.sha}...${refA.sha}`],
      repoPath,
      GIT_TIMEOUT_MS,
    );
    const diffB = await runGit(
      ['diff', '--unified=3', '--no-color', `${baseRef.sha}...${refB.sha}`],
      repoPath,
      GIT_TIMEOUT_MS,
    );
    const namesA = fileListFromDiffNames(
      await runGit(
        ['diff', '--name-only', `${baseRef.sha}...${refA.sha}`],
        repoPath,
        GIT_TIMEOUT_MS,
      ),
    );
    const namesB = fileListFromDiffNames(
      await runGit(
        ['diff', '--name-only', `${baseRef.sha}...${refB.sha}`],
        repoPath,
        GIT_TIMEOUT_MS,
      ),
    );
    const files = Array.from(new Set([...namesA, ...namesB]));
    if (files.length > MAX_FILES) {
      throw new Error(
        `too many files changed (${files.length} > ${MAX_FILES}) — narrow the compared refs`,
      );
    }
    const totalBytes = Buffer.byteLength(diffA, 'utf8') + Buffer.byteLength(diffB, 'utf8');
    if (totalBytes > MAX_DIFF_BYTES) {
      throw new Error(`diff too large (>${MAX_DIFF_BYTES} bytes) — narrow the compared refs`);
    }

    return {
      repoName: parsed.name,
      cloneUrl: parsed.canonicalUrl,
      baseSha: baseRef.sha,
      shaA: refA.sha,
      shaB: refB.sha,
      diffA,
      diffB,
      files,
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
