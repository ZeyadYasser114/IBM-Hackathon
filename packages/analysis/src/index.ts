/**
 * @mergemind/analysis
 *
 * Orchestrates the parallel Bob subagent pipeline that converts raw repository
 * diffs into structured Assumption records.
 *
 * EXTENSION POINT
 * ---------------
 * Implement the `AgentRunner` interface to connect real Bob subagents:
 *
 *   class BobIntentRunner implements AgentRunner { ... }
 *   class BobContractRunner implements AgentRunner { ... }
 *   class BobDependencyRunner implements AgentRunner { ... }
 *   class BobAdversaryRunner implements AgentRunner { ... }
 *
 * Register them in `AnalysisPipeline.create()`.
 * The progress callback is called after each agent completes, enabling the
 * Screen 2 live-progress panel in the UI.
 *
 * CURRENT STATE
 * -------------
 * The pipeline runs the full contract but uses stub runners that return empty
 * assumption arrays. Replace each stub with a real Bob runner independently.
 */

import type {
  AgentProgress,
  AgentStatus,
  AgentType,
  Assumption,
  FeatureRequest,
  RepositorySource,
} from '@mergemind/domain';

// ---------------------------------------------------------------------------
// Agent runner contract
// ---------------------------------------------------------------------------

export interface AgentRunner {
  readonly agentType: AgentType;
  /**
   * Run analysis and return zero or more Assumption records.
   * Must not throw — return an empty array on failure and report via progress.
   */
  run(
    requirement: FeatureRequest,
    context: RepositorySource,
    onProgress: (progress: AgentProgress) => void,
  ): Promise<Assumption[]>;
}

// ---------------------------------------------------------------------------
// Stub runners (replaced by real Bob runners in feature branches)
// ---------------------------------------------------------------------------

abstract class StubRunner implements AgentRunner {
  abstract readonly agentType: AgentType;

  async run(
    _requirement: FeatureRequest,
    _context: RepositorySource,
    onProgress: (p: AgentProgress) => void,
  ): Promise<Assumption[]> {
    onProgress(makeProgress(this.agentType, 'running', 'Analyzing…'));
    // Real implementation goes here — spawn Bob subagent, parse response
    onProgress(makeProgress(this.agentType, 'complete', 'Done (stub — no assumptions extracted)'));
    return [];
  }
}

class IntentStub extends StubRunner {
  readonly agentType: AgentType = 'intent';
}
class ContractStub extends StubRunner {
  readonly agentType: AgentType = 'contract';
}
class DependencyStub extends StubRunner {
  readonly agentType: AgentType = 'dependency';
}
class AdversaryStub extends StubRunner {
  readonly agentType: AgentType = 'adversary';
}
class ChangeStub extends StubRunner {
  readonly agentType: AgentType = 'change';
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export type PipelineResult = {
  assumptions: Assumption[];
  agentProgress: AgentProgress[];
};

export class AnalysisPipeline {
  private constructor(private readonly runners: AgentRunner[]) {}

  /**
   * Create a pipeline with the provided runners.
   * Pass real Bob runners here when implementing AI orchestration.
   *
   * @example
   * AnalysisPipeline.create([
   *   new BobIntentRunner(bobClient),
   *   new BobContractRunner(bobClient),
   *   new BobDependencyRunner(bobClient),
   *   new BobAdversaryRunner(bobClient),
   * ]);
   */
  static create(runners?: AgentRunner[]): AnalysisPipeline {
    return new AnalysisPipeline(
      runners ?? [
        new IntentStub(),
        new ContractStub(),
        new DependencyStub(),
        new AdversaryStub(),
        new ChangeStub(),
      ],
    );
  }

  /**
   * Run all agents in parallel and collect their Assumption outputs.
   *
   * @param onProgress — called each time an agent emits a progress update;
   *                     use this to push updates to the UI via SSE or WebSocket.
   */
  async run(
    requirement: FeatureRequest,
    context: RepositorySource,
    onProgress: (progress: AgentProgress) => void = () => undefined,
  ): Promise<PipelineResult> {
    const progressLog: AgentProgress[] = [];

    const track = (p: AgentProgress) => {
      progressLog.push(p);
      onProgress(p);
    };

    // Agents run in parallel — mirror the "Screen 2" live progress panel
    const assumptionArrays = await Promise.all(
      this.runners.map((runner) => runner.run(requirement, context, track)),
    );

    return {
      assumptions: assignIds(assumptionArrays.flat()),
      agentProgress: progressLog,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgress(agentType: AgentType, status: AgentStatus, message: string): AgentProgress {
  const now = new Date().toISOString();
  return {
    agentType,
    status,
    message,
    startedAt: status === 'running' ? now : null,
    completedAt: status === 'complete' || status === 'failed' ? now : null,
  };
}

function assignIds(assumptions: Assumption[]): Assumption[] {
  return assumptions.map((a, i) => ({
    ...a,
    id: a.id || `assumption-${i}-${Date.now()}`,
  }));
}
