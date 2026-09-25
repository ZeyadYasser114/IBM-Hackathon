import { AnalysisPipeline } from '../src/index.js';
import type { Assumption, FeatureRequest, RepositorySource } from '@mergemind/domain';

const REQUIREMENT: FeatureRequest = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  title: 'Add organization billing',
  description: 'Add organization billing. Only organization owners can manage subscriptions.',
  acceptanceCriteria: [
    { key: 'AC-1', description: 'Only organization owners can manage subscriptions.' },
  ],
  rules: [],
  tags: ['billing'],
  createdAt: '2024-08-01T12:00:00.000Z',
  submittedBy: 'alice@example.com',
};

const CONTEXT: RepositorySource = {
  id: '223e4567-e89b-42d3-a456-426614174001',
  name: 'demo-repo',
  cloneUrl: 'https://github.com/acme/demo-repo',
  provider: 'github',
  baseBranch: { name: 'main', sha: 'a'.repeat(40) },
  featureBranches: [
    { name: 'feature/auth', sha: 'b'.repeat(40) },
    { name: 'feature/billing', sha: 'c'.repeat(40) },
  ],
  resolvedAt: '2024-08-01T12:00:00.000Z',
};

describe('AnalysisPipeline', () => {
  it('creates a pipeline with default stub runners', () => {
    const pipeline = AnalysisPipeline.create();
    expect(pipeline).toBeInstanceOf(AnalysisPipeline);
  });

  it('runs without throwing and returns a result object', async () => {
    const pipeline = AnalysisPipeline.create();
    const result = await pipeline.run(REQUIREMENT, CONTEXT);
    expect(result).toHaveProperty('assumptions');
    expect(result).toHaveProperty('agentProgress');
    expect(Array.isArray(result.assumptions)).toBe(true);
    expect(Array.isArray(result.agentProgress)).toBe(true);
  });

  it('emits progress events for all agents', async () => {
    const pipeline = AnalysisPipeline.create();
    const events: string[] = [];
    await pipeline.run(REQUIREMENT, CONTEXT, (p) => events.push(p.agentType));
    // Each stub emits 2 events (running + complete) for 5 agents = 10 events
    expect(events.length).toBe(10);
  });

  it('accepts a custom runner', async () => {
    const customAssumption: Assumption = {
      id: '323e4567-e89b-42d3-a456-426614174002',
      branchName: 'feature/auth',
      sourceFile: 'src/auth/roles.ts',
      statement: "The privileged organization role is 'owner'",
      concept: 'privileged-role',
      value: "'owner'",
      sourceAgent: 'intent',
      evidence: [],
      confidence: 'LOW',
      numericConfidence: 0.4,
      relatedAssumptionIds: [],
      extractedAt: '2024-08-01T12:00:00.000Z',
    };

    const customRunner = {
      agentType: 'intent' as const,
      run: async () => [customAssumption],
    };

    const pipeline = AnalysisPipeline.create([customRunner]);
    const result = await pipeline.run(REQUIREMENT, CONTEXT);
    expect(result.assumptions).toHaveLength(1);
    expect(result.assumptions[0]?.concept).toBe('privileged-role');
  });
});
