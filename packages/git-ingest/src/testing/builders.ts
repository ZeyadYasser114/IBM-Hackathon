/**
 * testing/builders.ts
 *
 * Test helpers for repository-ingestion fixtures.
 *
 * Purpose: future branches can build ChangedFile / CodeEvidence records and a
 * mock Git backend without duplicating setup:
 *
 *   import { makeChangedFile, MockGitRunner } from '@mergemind/git-ingest/testing';
 *
 * Rules:
 *   - No randomness, no I/O, no Date.now() — output is byte-identical on
 *     every run so snapshot tests are stable.
 *   - Defaults are minimal but valid against the domain Zod schemas.
 */

import type { BranchRef, ChangedFile, CodeEvidence } from '@mergemind/domain';
import type { GitRunner } from '../adapters/local-git.js';

/** Fixed 40-hex SHAs for branch refs. */
export const FIXED_BASE_SHA = 'a'.repeat(40);
export const FIXED_FEATURE_SHA = 'b'.repeat(40);

/** A minimal unified diff used as the default ChangedFile patch. */
export const SIMPLE_PATCH = `diff --git a/src/auth/roles.ts b/src/auth/roles.ts
index abc1234..def5678 100644
--- a/src/auth/roles.ts
+++ b/src/auth/roles.ts
@@ -1,3 +1,3 @@
 export type Role = 'owner' | 'member';
-const PRIVILEGED_ROLE = 'admin';
+const PRIVILEGED_ROLE = 'owner';
`;

export function makeBranchRef(name = 'feature/auth', sha: string = FIXED_FEATURE_SHA): BranchRef {
  return { name, sha };
}

export function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  const { previousPath, ...rest } = overrides;
  const base: ChangedFile = {
    path: 'src/auth/roles.ts',
    kind: 'MODIFIED',
    patch: SIMPLE_PATCH,
    additions: 1,
    deletions: 1,
    branchName: 'feature/auth',
    language: 'typescript',
  };
  // previousPath is optional under exactOptionalPropertyTypes — only set it
  // when the caller explicitly provides it.
  if (previousPath === undefined) return { ...base, ...rest };
  return { ...base, ...rest, previousPath };
}

export function makeCodeEvidence(overrides: Partial<CodeEvidence> = {}): CodeEvidence {
  return {
    source: 'FILE_CHANGE',
    filePath: 'src/auth/roles.ts',
    lineStart: 1,
    lineEnd: 3,
    snippet: "+const PRIVILEGED_ROLE = 'owner';",
    branchName: 'feature/auth',
    metadata: { changeKind: 'MODIFIED', hunkIndex: '0' },
    ...overrides,
  };
}

/**
 * Deterministic GitRunner backed by a scripted response map.
 *
 * Register responses keyed by the joined git args:
 *
 *   const runner = new MockGitRunner(
 *     new Map([
 *       ['rev-parse main', MAIN_SHA + '\n'],
 *       [`diff --unified=3 ${BASE}...${FEATURE}`, SIMPLE_DIFF_TEXT],
 *     ]),
 *   );
 *   const adapter = new LocalGitAdapter('/repo', runner);
 *
 * Unexpected calls throw with the exact argv, so missing stubs fail loudly
 * instead of hanging or returning empty output.
 */
export class MockGitRunner implements GitRunner {
  constructor(private readonly responses: Map<string, string>) {}

  async run(args: string[], cwd: string): Promise<string> {
    const key = args.join(' ');
    const response = this.responses.get(key);
    if (response === undefined) {
      const known = [...this.responses.keys()].join(', ') || '(none registered)';
      throw new Error(
        `MockGitRunner: unexpected call "git ${key}" (cwd: ${cwd}). Registered: ${known}`,
      );
    }
    return response;
  }
}
