/**
 * scenarios.test.ts — official @mergemind/fixtures scenarios through the
 * real tRPC verification path (ingest → deterministic engine → findings).
 *
 * Proves the three canonical scenarios actually work end to end:
 * every scenario must resolve to FAIL with at least one finding in its
 * documented conflict category covering its expected files.
 */

import { allScenarios } from '@mergemind/fixtures';
import { parseDiff } from '@mergemind/git-ingest';
import type { ChangedFile } from '@mergemind/domain';

import { runEngineVerification } from './engine-verification.js';

// Branch patches are split per file with the shared diff parser, so every
// changed file carries its own evidence into the engine.
function changedFilesFor(scenarioId: string): ChangedFile[] {
  const scenario = allScenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`unknown scenario ${scenarioId}`);
  return scenario.branches.flatMap((branch) =>
    parseDiff(branch.patch).map((parsed) => ({
      path: parsed.path,
      kind: parsed.kind,
      patch: parsed.patch,
      additions: parsed.additions,
      deletions: parsed.deletions,
      branchName: branch.name,
      language: 'typescript' as const,
    })),
  );
}

function branchNamesFor(scenarioId: string): string[] {
  const scenario = allScenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`unknown scenario ${scenarioId}`);
  return scenario.branches.map((b) => b.name);
}

describe.each(allScenarios.map((s) => [s.id] as const))('scenario %s', (scenarioId) => {
  it('resolves to FAIL with a finding in the documented category', async () => {
    const scenario = allScenarios.find((s) => s.id === scenarioId);
    if (!scenario) throw new Error(`unknown scenario ${scenarioId}`);
    const branches = branchNamesFor(scenarioId);
    const result = await runEngineVerification(
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        title: scenario.title,
        description: scenario.originalRequirement,
        acceptanceCriteria: [],
        rules: [],
        tags: [],
        createdAt: '2024-08-01T12:00:00.000Z',
        submittedBy: 'scenarios.test',
      },
      {
        id: '223e4567-e89b-42d3-a456-426614174001',
        name: 'acme-platform',
        cloneUrl: 'https://github.com/acme-demo/acme-platform',
        provider: 'github',
        baseBranch: { name: 'main', sha: 'a'.repeat(40) },
        featureBranches: branches.map((name, i) => ({ name, sha: `${i + 1}`.repeat(40) })),
        resolvedAt: '2024-08-01T12:00:00.000Z',
      },
      changedFilesFor(scenarioId),
    );

    expect(result.status).toBe('FAIL');
    expect(result.summary.conflictsFound).toBeGreaterThan(0);
    const matching = result.conflicts.filter((c) => c.category === scenario.conflictCategory);
    expect(matching.length).toBeGreaterThan(0);
    const affected = new Set(result.conflicts.flatMap((c) => c.affectedFiles));
    for (const expected of scenario.expectedAffectedFiles) {
      expect(affected.has(expected)).toBe(true);
    }
  }, 15000);
});
