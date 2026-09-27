/**
 * bob-runner.test.ts — Bob agent runners with injected mock fetch.
 * No network access. Verifies parsing, validation, failure semantics
 * (never throw, never fabricate), and the engine-text bridge.
 */

import { AnalysisPipeline } from '../index.js';
import type { FeatureRequest, RepositorySource } from '@mergemind/domain';
import {
  BobAgentRunner,
  createBobRunners,
  parseBobAssumptions,
  bobAssumptionsToDiffText,
  type BobRunnerInputs,
} from './bob-runner.js';
import { resolveBobConfig } from './bob-client.js';
import { buildPromptFor } from './bob-prompts.js';

const INPUTS: BobRunnerInputs = {
  requirementText: 'Only organization owners can manage subscriptions.',
  branchAName: 'feature/auth-roles',
  branchBName: 'feature/billing-permissions',
  diffAText: `User.role = 'owner';`,
  diffBText: `if (user.role === 'admin') { manageSubscription(); }`,
};

const CONFIG = resolveBobConfig({ apiKey: 'sk-test-key' });

const REQUIREMENT: FeatureRequest = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'Add organization billing',
  description: 'Add organization billing. Only organization owners can manage subscriptions.',
  acceptanceCriteria: [],
  rules: [],
  tags: [],
  createdAt: '2024-08-01T12:00:00.000Z',
  submittedBy: 'test',
};

const CONTEXT: RepositorySource = {
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
};

function completionFetch(text: string, status = 200) {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
      status,
    })) as typeof fetch;
}

const VALID_RESPONSE = JSON.stringify({
  assumptions: [
    {
      id: 'auth-role',
      statement: "Privileged organization role is 'owner'",
      concept: 'privileged-role',
      value: "'owner'",
      branch: 'feature/auth-roles',
      file: 'auth/roles.ts',
      line: 14,
      evidence: "User.role = 'owner';",
      confidence: 0.95,
    },
    {
      statement: "Billing gates on 'admin'",
      concept: 'privileged-role',
      value: "'admin'",
      branch: 'feature/billing-permissions',
      file: 'billing/permissions.ts',
      line: null,
      evidence: null,
    },
  ],
});

describe('parseBobAssumptions', () => {
  it('maps valid assumptions with defaults', () => {
    const out = parseBobAssumptions(VALID_RESPONSE, 'change', INPUTS, 'premium');
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe('auth-role');
    expect(out[0]?.branchName).toBe('feature/auth-roles');
    expect(out[0]?.sourceAgent).toBe('change');
    expect(out[0]?.confidence).toBe('HIGH');
    expect(out[0]?.numericConfidence).toBe(0.95);
    expect(out[0]?.evidence[0]?.source).toBe('FILE_CHANGE');
    expect(out[0]?.evidence[0]?.lineStart).toBe(14);
    // Defaults: empty id, 0.6/MEDIUM, INFERRED evidence
    expect(out[1]?.confidence).toBe('MEDIUM');
    expect(out[1]?.evidence[0]?.source).toBe('INFERRED');
  });

  it('strips markdown fences', () => {
    const out = parseBobAssumptions(`\`\`\`json\n${VALID_RESPONSE}\n\`\`\``, 'change', INPUTS, 'm');
    expect(out).toHaveLength(2);
  });

  it('rejects invalid JSON, missing arrays, and bad fields', () => {
    expect(() => parseBobAssumptions('nope{', 'change', INPUTS, 'm')).toThrow(/invalid JSON/);
    expect(() => parseBobAssumptions('{"x": 1}', 'change', INPUTS, 'm')).toThrow(/assumptions/);
    expect(() =>
      parseBobAssumptions(
        JSON.stringify({ assumptions: [{ value: 'x', branch: 'feature/auth-roles' }] }),
        'change',
        INPUTS,
        'm',
      ),
    ).toThrow(/statement/);
    expect(() =>
      parseBobAssumptions(
        JSON.stringify({
          assumptions: [{ statement: 's', value: 'v', branch: 'wrong-branch' }],
        }),
        'change',
        INPUTS,
        'm',
      ),
    ).toThrow(/branch/);
  });

  it('caps assumptions per agent', () => {
    const many = {
      assumptions: Array.from({ length: 60 }, (_, i) => ({
        statement: `claim ${i}`,
        concept: 'c',
        value: 'v',
        branch: 'feature/auth-roles',
      })),
    };
    expect(parseBobAssumptions(JSON.stringify(many), 'change', INPUTS, 'm')).toHaveLength(50);
  });
});

describe('BobAgentRunner', () => {
  it('returns mapped assumptions and complete progress on success', async () => {
    const runner = new BobAgentRunner('change', CONFIG, INPUTS, completionFetch(VALID_RESPONSE));
    const seen: string[] = [];
    const out = await runner.run(REQUIREMENT, CONTEXT, (p) => seen.push(p.status));
    expect(out).toHaveLength(2);
    expect(seen).toEqual(['running', 'complete']);
  });

  it('never throws and never fabricates on auth failure', async () => {
    const runner = new BobAgentRunner('change', CONFIG, INPUTS, completionFetch('{}', 401));
    const seen: Array<{ status: string; message: string }> = [];
    const out = await runner.run(REQUIREMENT, CONTEXT, (p) =>
      seen.push({ status: p.status, message: p.message }),
    );
    expect(out).toEqual([]);
    expect(seen[seen.length - 1]?.status).toBe('failed');
    expect(seen[seen.length - 1]?.message).not.toContain('sk-test-key');
  });

  it('returns empty on malformed JSON with a failed report', async () => {
    const runner = new BobAgentRunner('adversary', CONFIG, INPUTS, completionFetch('{{{'));
    const out = await runner.run(REQUIREMENT, CONTEXT, () => undefined);
    expect(out).toEqual([]);
  });
});

describe('createBobRunners + pipeline partial failure', () => {
  it('builds all five roles', () => {
    const runners = createBobRunners(
      {
        requirementText: INPUTS.requirementText,
        branchAName: INPUTS.branchAName,
        branchBName: INPUTS.branchBName,
        diffAText: INPUTS.diffAText,
        diffBText: INPUTS.diffBText,
      },
      CONFIG,
      completionFetch(VALID_RESPONSE),
    );
    expect(runners.map((r) => r.agentType).sort()).toEqual(
      ['adversary', 'change', 'contract', 'dependency', 'intent'].sort(),
    );
  });

  it('keeps successful results and reports failures without fabrication', async () => {
    const ok = new BobAgentRunner('change', CONFIG, INPUTS, completionFetch(VALID_RESPONSE));
    const bad = new BobAgentRunner('contract', CONFIG, INPUTS, completionFetch('{{{'));
    const pipeline = AnalysisPipeline.create([ok, bad]);
    const result = await pipeline.run(REQUIREMENT, CONTEXT);
    expect(result.assumptions).toHaveLength(2);
    expect(result.agentProgress.some((p) => p.status === 'failed')).toBe(true);
  });
});

describe('bobAssumptionsToDiffText', () => {
  it('renders statements for the engine', () => {
    const assumptions = parseBobAssumptions(VALID_RESPONSE, 'change', INPUTS, 'premium');
    const text = bobAssumptionsToDiffText(assumptions);
    expect(text).toContain("Privileged organization role is 'owner'");
    expect(text).toContain('auth/roles.ts');
  });
});

describe('buildPromptFor', () => {
  it('adversary prompt asks the required questions', () => {
    const prompt = buildPromptFor('adversary', INPUTS);
    expect(prompt).toContain('true in Change A but false in Change B');
    expect(prompt).toContain('Git can merge');
  });

  it('all roles forbid verdicts and demand JSON', () => {
    for (const role of ['intent', 'change', 'contract', 'dependency', 'adversary'] as const) {
      const prompt = buildPromptFor(role, INPUTS);
      expect(prompt).toContain('Do NOT judge whether the merge is safe');
      expect(prompt).toContain('"assumptions"');
    }
  });
});
