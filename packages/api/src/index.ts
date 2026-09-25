/**
 * @mergemind/api — tRPC router
 *
 * This is the single service layer entry point. It exposes:
 *
 *   health.check  — startup health probe (no auth required)
 *   verify.start  — begin a semantic verification run
 *   verify.result — poll for a verification result by ID
 *
 * The Next.js app mounts this router via the tRPC Next.js adapter.
 * The same router can be mounted in any other server (Express, Fastify, etc.)
 * without changes.
 *
 * EXTENSION POINT
 * ---------------
 * Add new procedures in new namespaced sub-routers:
 *
 *   export const passport = router({ generate: procedure... });
 *   export const appRouter = router({ health, verify, passport });
 *
 * Keep the `health` and `verify` namespaces stable — the UI depends on them.
 */

import { randomUUID } from 'node:crypto';

import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import { AnalysisPipeline } from '@mergemind/analysis';
import { InMemoryAdapter, createRepositoryContext } from '@mergemind/git-ingest';
import { runVerification } from '@mergemind/verification';
import type {
  AgentProgress,
  BranchRef,
  ChangedFile,
  FeatureRequest,
  RepositorySource,
  VerificationResult,
} from '@mergemind/domain';

// ---------------------------------------------------------------------------
// tRPC initialisation
// ---------------------------------------------------------------------------

const t = initTRPC.create();
const router = t.router;
const procedure = t.procedure;

// ---------------------------------------------------------------------------
// In-memory store for verification results (replace with a DB in production)
// ---------------------------------------------------------------------------

const resultStore = new Map<string, VerificationResult>();

// ---------------------------------------------------------------------------
// Input schemas (lenient at the boundary — the domain zod schemas in
// `@mergemind/domain/schemas` enforce the strict contract on stored artifacts)
// ---------------------------------------------------------------------------

const AcceptanceCriterionSchema = z.object({
  key: z.string(),
  description: z.string(),
});

const FeatureRequestSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  rules: z.array(z.string()),
  tags: z.array(z.string()),
  createdAt: z.string(),
  submittedBy: z.string(),
});

const BranchRefSchema = z.object({
  name: z.string(),
  sha: z.string(),
});

const RepositorySourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  cloneUrl: z.string(),
  provider: z.string(),
  baseBranch: BranchRefSchema,
  featureBranches: z.array(BranchRefSchema),
  resolvedAt: z.string(),
});

const ChangedFileSchema = z.object({
  path: z.string(),
  kind: z.enum(['ADDED', 'MODIFIED', 'DELETED', 'RENAMED']),
  previousPath: z.string().optional(),
  patch: z.string().nullable(),
  additions: z.number(),
  deletions: z.number(),
  branchName: z.string(),
  language: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

const healthRouter = router({
  /**
   * Health check — returns 200 with version info.
   * Use this as the k8s/Docker liveness probe path.
   */
  check: procedure.query(() => ({
    status: 'ok' as const,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })),
});

const verifyRouter = router({
  /**
   * Start a verification run.
   *
   * Accepts an already-resolved RepositorySource plus the ChangedFile list
   * (the caller has already resolved branches and diffs) and a FeatureRequest.
   *
   * Returns immediately with a verificationId and PENDING status.
   * The actual run is async — poll `verify.result` for completion.
   *
   * EXTENSION POINT
   * ---------------
   * Swap InMemoryAdapter for LocalGitAdapter or GithubApiAdapter here.
   * Inject real Bob runners into AnalysisPipeline.create([...]).
   */
  start: procedure
    .input(
      z.object({
        featureRequest: FeatureRequestSchema,
        repositorySource: RepositorySourceSchema,
        changedFiles: z.array(ChangedFileSchema),
      }),
    )
    .mutation(async ({ input }) => {
      const verificationId = randomUUID();

      // Kick off async — do not await
      void runAnalysis(
        verificationId,
        input.featureRequest,
        input.repositorySource,
        input.changedFiles.map(toDomainChangedFile),
      );

      return { verificationId, status: 'PENDING' as const };
    }),

  /**
   * Poll for a verification result.
   */
  result: procedure.input(z.object({ verificationId: z.string() })).query(({ input }) => {
    const result = resultStore.get(input.verificationId);
    if (!result) return null;
    return result;
  }),
});

export const appRouter = router({
  health: healthRouter,
  verify: verifyRouter,
});

export type AppRouter = typeof appRouter;

// ---------------------------------------------------------------------------
// Boundary normalization
// ---------------------------------------------------------------------------

type InputChangedFile = z.infer<typeof ChangedFileSchema>;

/**
 * Convert a caller-supplied diff record into a domain ChangedFile.
 * Built explicitly (rather than by spread) so the optional `previousPath`
 * stays compatible with `exactOptionalPropertyTypes`.
 */
function toDomainChangedFile(f: InputChangedFile): ChangedFile {
  const base = {
    path: f.path,
    kind: f.kind,
    patch: f.patch,
    additions: f.additions,
    deletions: f.deletions,
    branchName: f.branchName,
    language: f.language,
  };
  if (f.previousPath === undefined) return base;
  return { ...base, previousPath: f.previousPath };
}

// ---------------------------------------------------------------------------
// Async analysis runner
// ---------------------------------------------------------------------------

async function runAnalysis(
  verificationId: string,
  featureRequest: FeatureRequest,
  repositorySource: RepositorySource,
  changedFiles: ChangedFile[],
): Promise<void> {
  // Build an in-memory adapter from the supplied branches + diffs
  const branchMap = new Map<string, BranchRef>();
  branchMap.set(repositorySource.baseBranch.name, repositorySource.baseBranch);
  for (const fb of repositorySource.featureBranches) {
    branchMap.set(fb.name, fb);
  }
  const adapter = new InMemoryAdapter(branchMap, changedFiles);

  const { source, changedFiles: ingestedFiles } = await createRepositoryContext(
    adapter,
    {
      name: repositorySource.name,
      cloneUrl: repositorySource.cloneUrl,
      provider: repositorySource.provider,
    },
    repositorySource.baseBranch.name,
    repositorySource.featureBranches.map((fb) => fb.name),
  );

  const pipeline = AnalysisPipeline.create();
  const progressLog: AgentProgress[] = [];

  const { assumptions } = await pipeline.run(featureRequest, source, (p) => {
    progressLog.push(p);
  });

  const distinctFiles = new Set(ingestedFiles.map((f) => f.path));

  const result = runVerification({
    featureRequest,
    repositorySource: source,
    filesChanged: distinctFiles.size,
    assumptions,
  });

  // Override the generated ID with the one we advertised
  resultStore.set(verificationId, { ...result, id: verificationId });
}
