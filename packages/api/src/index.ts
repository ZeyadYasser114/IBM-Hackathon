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

import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import { AnalysisPipeline } from '@mergemind/analysis';
import { InMemoryAdapter, createRepositoryContext } from '@mergemind/git-ingest';
import { runVerification } from '@mergemind/verification';
import type {
  AgentProgress,
  BranchRef,
  FeatureRequirement,
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
// Input schemas
// ---------------------------------------------------------------------------

const FeatureRequirementSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  rules: z.array(z.string()),
});

const BranchRefSchema = z.object({
  name: z.string(),
  sha: z.string(),
});

const FileDiffSchema = z.object({
  path: z.string(),
  patch: z.string(),
  additions: z.number(),
  deletions: z.number(),
});

const RepositoryContextSchema = z.object({
  name: z.string(),
  location: z.string(),
  baseBranch: BranchRefSchema,
  featureBranches: z.array(BranchRefSchema),
  diffs: z.array(FileDiffSchema),
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
   * Accepts a pre-built RepositoryContext (the caller has already resolved
   * branches and diffs) plus a FeatureRequirement.
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
        requirement: FeatureRequirementSchema,
        repository: RepositoryContextSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const verificationId = `vr-${Date.now()}`;

      // Kick off async — do not await
      void runAnalysis(verificationId, input.requirement, input.repository);

      return { verificationId, status: 'PENDING' as const };
    }),

  /**
   * Poll for a verification result.
   */
  result: procedure
    .input(z.object({ verificationId: z.string() }))
    .query(({ input }) => {
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
// Async analysis runner
// ---------------------------------------------------------------------------

async function runAnalysis(
  verificationId: string,
  requirement: FeatureRequirement,
  repositoryInput: {
    name: string;
    location: string;
    baseBranch: BranchRef;
    featureBranches: BranchRef[];
    diffs: { path: string; patch: string; additions: number; deletions: number }[];
  },
): Promise<void> {
  // Build an in-memory adapter from the supplied diffs
  const branchMap = new Map<string, BranchRef>();
  branchMap.set(repositoryInput.baseBranch.name, repositoryInput.baseBranch);
  for (const fb of repositoryInput.featureBranches) {
    branchMap.set(fb.name, fb);
  }
  const adapter = new InMemoryAdapter(branchMap, repositoryInput.diffs);

  const context = await createRepositoryContext(
    adapter,
    repositoryInput.name,
    repositoryInput.location,
    repositoryInput.baseBranch.name,
    repositoryInput.featureBranches.map((fb) => fb.name),
  );

  const pipeline = AnalysisPipeline.create();
  const progressLog: AgentProgress[] = [];

  const { assumptions } = await pipeline.run(requirement, context, (p) => {
    progressLog.push(p);
  });

  const result = runVerification({
    requirementId: requirement.id,
    requirement,
    repositoryName: context.name,
    filesChanged: context.diffs.length,
    assumptions,
  });

  // Override the generated ID with the one we advertised
  resultStore.set(verificationId, { ...result, id: verificationId });
}
