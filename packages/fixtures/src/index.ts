/**
 * index.ts — @mergemind/fixtures
 *
 * Public entry point for the MergeMind demo/fixture package.
 *
 * Usage
 * ─────
 * import { allScenarios, getScenario, scenario01, scenario02, scenario03 }
 *   from '@mergemind/fixtures';
 *
 * Each exported fixture is a plain `ScenarioFixture` object (no classes,
 * no async I/O) — safe to use in Jest describe blocks, Vitest tests, or
 * any synchronous demo script.
 */

export type { ScenarioFixture, RepoFile, PatchFixture } from './types.js';

export { scenario01BusinessRule } from './scenario-01-business-rule.js';
export { scenario02ContractMismatch } from './scenario-02-contract-mismatch.js';
export { scenario03DependencyAssumption } from './scenario-03-dependency-assumption.js';

// Convenience aliases
import { scenario01BusinessRule } from './scenario-01-business-rule.js';
import { scenario02ContractMismatch } from './scenario-02-contract-mismatch.js';
import { scenario03DependencyAssumption } from './scenario-03-dependency-assumption.js';

/** All three scenarios in insertion order — useful for data-driven test loops. */
export const allScenarios = [
  scenario01BusinessRule,
  scenario02ContractMismatch,
  scenario03DependencyAssumption,
] as const;

/**
 * Look up a scenario by its `id` slug.
 *
 * @example
 * const s = getScenario('scenario-01-business-rule');
 * // s is scenario01BusinessRule
 *
 * @throws {Error} if no scenario matches the given id.
 */
export function getScenario(
  id:
    | 'scenario-01-business-rule'
    | 'scenario-02-contract-mismatch'
    | 'scenario-03-dependency-assumption',
) {
  const found = allScenarios.find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(`@mergemind/fixtures: unknown scenario id "${id}"`);
  }
  return found;
}
