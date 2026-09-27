/**
 * parity.test.ts — §5 three-way structured parity (engine vs MCP vs tRPC).
 *
 * Runs the SAME killer example through three independent surfaces and asserts
 * the normalized semantic verdict is identical:
 *   1. direct deterministic engine (ExtractionPipeline → explainConflicts)
 *   2. MCP runner (verifyChanges — the exact function the MCP tools call;
 *      transport fidelity is proven separately in mcp-server/server.test.ts)
 *   3. tRPC service path (runEngineVerification)
 *
 * Only structured fields are compared: completion, conflict count, and the
 * first conflict's type/severity/confidence/entity. Presentation, timestamps,
 * and IDs are excluded by design. The engine itself is never modified here.
 */

import {
  DeterministicExtractor,
  ExtractionPipeline,
  normalizeAssumptions,
  explainConflicts,
  SourceType,
} from '@mergemind/semantic-engine';
import { verifyChanges } from '@mergemind/mcp-server';

import { runEngineVerification } from './engine-verification.js';

const REQUIREMENT =
  'Add organization billing. Only organization owners can manage subscriptions.';
const CODE_A = `export const ORG_PRIVILEGED_ROLE = 'owner';`;
const CODE_B = `if (user.role === 'admin') { manageSubscription(); }`;

interface NormalizedVerdict {
  completed: boolean;
  conflictsFound: number;
  first: {
    conflictType: string;
    severity: string;
    confidence: string | null;
    affectedEntity: string | null;
  } | null;
}

const EXPECTED: NormalizedVerdict = {
  completed: true,
  conflictsFound: 1,
  first: {
    conflictType: 'BUSINESS_RULE',
    severity: 'HIGH',
    confidence: 'HIGH',
    affectedEntity: 'user_role',
  },
};

async function engineDirect(): Promise<NormalizedVerdict> {
  const pipeline = new ExtractionPipeline(
    new DeterministicExtractor({ defaultSourceType: SourceType.CODE_DIFF }),
  );
  const { assumptions } = await pipeline.run({
    sessionId: 'parity-engine',
    requirementText: REQUIREMENT,
    changes: [
      {
        id: 'change-a',
        label: 'feature/auth-roles',
        content: '—',
        fileSnippets: [{ filePath: 'auth/roles.ts', sourceType: SourceType.CODE_DIFF, content: CODE_A }],
      },
      {
        id: 'change-b',
        label: 'feature/billing-permissions',
        content: '—',
        fileSnippets: [
          { filePath: 'billing/permissions.ts', sourceType: SourceType.CODE_DIFF, content: CODE_B },
        ],
      },
    ],
  });
  const reports = explainConflicts(normalizeAssumptions(assumptions));
  const first = reports[0];
  return {
    completed: true,
    conflictsFound: reports.length,
    first: first
      ? {
          conflictType: first.conflictType,
          severity: first.severity,
          confidence: first.confidence,
          affectedEntity: first.affectedEntity,
        }
      : null,
  };
}

async function mcpRunner(): Promise<NormalizedVerdict> {
  const outcome = await verifyChanges('parity-mcp', REQUIREMENT, {
    label: 'feature/auth-roles',
    content: CODE_A,
    filePath: 'auth/roles.ts',
  }, {
    label: 'feature/billing-permissions',
    content: CODE_B,
    filePath: 'billing/permissions.ts',
  });
  const first = outcome.reports[0];
  return {
    completed: true,
    conflictsFound: outcome.conflictsFound,
    first: first
      ? {
          conflictType: first.conflictType,
          severity: first.severity,
          confidence: first.confidence,
          affectedEntity: first.affectedEntity,
        }
      : null,
  };
}

async function trpcPath(): Promise<NormalizedVerdict> {
  const result = await runEngineVerification(
    {
      id: '123e4567-e89b-42d3-a456-426614174000',
      title: 'Add organization billing',
      description: REQUIREMENT,
      acceptanceCriteria: [],
      rules: [],
      tags: [],
      createdAt: '2024-08-01T12:00:00.000Z',
      submittedBy: 'parity.test',
    },
    {
      id: '223e4567-e89b-42d3-a456-426614174001',
      name: 'demo-repo',
      cloneUrl: 'https://github.com/acme/demo-repo',
      provider: 'github',
      baseBranch: { name: 'main', sha: 'a'.repeat(40) },
      featureBranches: [
        { name: 'feature/auth-roles', sha: 'b'.repeat(40) },
        { name: 'feature/billing-permissions', sha: 'c'.repeat(40) },
      ],
      resolvedAt: '2024-08-01T12:00:00.000Z',
    },
    [
      {
        path: 'auth/roles.ts',
        kind: 'MODIFIED',
        patch: CODE_A,
        additions: 1,
        deletions: 0,
        branchName: 'feature/auth-roles',
        language: 'typescript',
      },
      {
        path: 'billing/permissions.ts',
        kind: 'MODIFIED',
        patch: CODE_B,
        additions: 1,
        deletions: 0,
        branchName: 'feature/billing-permissions',
        language: 'typescript',
      },
    ],
  );
  const first = result.conflicts[0];
  // Domain findings carry no direct confidence/entity fields; both are read
  // from the linked assumption (concept + numeric confidence are mapped
  // verbatim from the engine in engine-verification.ts).
  const anchor = result.assumptions.find((a) => first?.affectedAssumptionIds.includes(a.id));
  const confidence = !anchor
    ? null
    : anchor.numericConfidence >= 0.9
      ? 'HIGH'
      : anchor.numericConfidence >= 0.6
        ? 'MEDIUM'
        : 'LOW';
  return {
    completed: result.status !== 'ERROR',
    conflictsFound: result.summary.conflictsFound,
    first: first
      ? {
          conflictType: first.category,
          severity: first.severity,
          confidence,
          affectedEntity: anchor?.concept ?? null,
        }
      : null,
  };
}

describe('three-way structured parity (killer example)', () => {
  it('engine, MCP runner, and tRPC agree exactly', async () => {
    const [engine, mcp, trpc] = await Promise.all([engineDirect(), mcpRunner(), trpcPath()]);
    for (const [label, verdict] of [
      ['engine', engine],
      ['mcp', mcp],
      ['trpc', trpc],
    ] as const) {
      expect({ label, verdict }).toEqual({ label, verdict: EXPECTED });
    }
  }, 30000);
});
