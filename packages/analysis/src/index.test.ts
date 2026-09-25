import { AnalysisPipeline } from '../src/index.js';
import type { FeatureRequirement, RepositoryContext } from '@mergemind/domain';

const REQUIREMENT: FeatureRequirement = {
  id: 'req-001',
  description: 'Add organization billing. Only organization owners can manage subscriptions.',
  rules: [],
};

const CONTEXT: RepositoryContext = {
  name: 'demo-repo',
  location: '/tmp/demo',
  baseBranch: { name: 'main', sha: 'abc0000000000000000000000000000000000000' },
  featureBranches: [
    { name: 'feature/auth', sha: 'aaa1111111111111111111111111111111111111' },
    { name: 'feature/billing', sha: 'bbb2222222222222222222222222222222222222' },
  ],
  diffs: [],
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
    const customAssumption = {
      id: 'a-custom',
      branchName: 'feature/auth',
      sourceFile: 'src/auth/roles.ts',
      statement: "The privileged organization role is 'owner'",
      concept: 'privileged-role',
      value: "'owner'",
      sourceAgent: 'intent' as const,
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
