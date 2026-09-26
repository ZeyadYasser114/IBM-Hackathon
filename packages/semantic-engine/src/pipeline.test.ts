/**
 * pipeline.test.ts — end-to-end coverage for the deterministic semantic engine:
 * input → extraction → normalization → conflict detection.
 *
 * Uses the README killer example (org billing: owner vs admin) as the
 * conflicting case and a same-role variant as the agreeing case.
 */

import { DeterministicExtractor } from './extraction/deterministic-extractor';
import { ExtractionPipeline } from './extraction/extraction-pipeline';
import { normalizeAssumptions } from './normalization/normalization-pipeline';
import { detectConflicts, explainConflicts } from './detection/conflict-detector';
import { validateAnalysisInput } from './types/input';
import type { AnalysisInput } from './types/input';
import { SourceType } from './types/enums';

function killerInput(): AnalysisInput {
  return {
    sessionId: 'test-session-killer',
    requirementText: 'Add organization billing. Only organization owners can manage subscriptions.',
    changes: [
      {
        id: 'change-auth',
        label: 'auth-task',
        content: `export const ORG_PRIVILEGED_ROLE = 'owner'; User.role = ORG_PRIVILEGED_ROLE;`,
        fileSnippets: [
          {
            filePath: 'auth/roles.ts',
            sourceType: SourceType.CODE_DIFF,
            content: `export const ORG_PRIVILEGED_ROLE = 'owner';`,
          },
        ],
      },
      {
        id: 'change-billing',
        label: 'billing-task',
        content: `if (user.role === 'admin') { manageSubscription(); }`,
        fileSnippets: [
          {
            filePath: 'billing/permissions.ts',
            sourceType: SourceType.CODE_DIFF,
            content: `if (user.role === 'admin') { manageSubscription(); }`,
          },
        ],
      },
    ],
  };
}

function agreeingInput(): AnalysisInput {
  return {
    sessionId: 'test-session-agree',
    requirementText: 'Add organization billing. Only organization owners can manage subscriptions.',
    changes: [
      {
        id: 'change-auth',
        label: 'auth-task',
        content: `User.role = 'owner';`,
      },
      {
        id: 'change-billing',
        label: 'billing-task',
        content: `if (user.role === 'owner') { manageSubscription(); }`,
      },
    ],
  };
}

async function runFullPipeline(input: AnalysisInput) {
  const pipeline = new ExtractionPipeline(new DeterministicExtractor());
  const { assumptions } = await pipeline.run(input);
  const normalized = normalizeAssumptions(assumptions);
  const conflicts = detectConflicts(normalized);
  const reports = explainConflicts(normalized);
  return { assumptions, normalized, conflicts, reports };
}

describe('semantic-engine input validation', () => {
  it('rejects an empty requirement text', () => {
    const errors = validateAnalysisInput({
      sessionId: 's1',
      requirementText: '   ',
      changes: [{ id: 'c1', label: 'branch-a', content: 'role = owner' }],
    });
    expect(errors.some((e) => e.field === 'requirementText')).toBe(true);
  });

  it('rejects duplicate change ids', () => {
    const errors = validateAnalysisInput({
      sessionId: 's1',
      requirementText: 'Owners manage subscriptions.',
      changes: [
        { id: 'dup', label: 'a', content: 'x' },
        { id: 'dup', label: 'b', content: 'y' },
      ],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts the killer-example input', () => {
    expect(validateAnalysisInput(killerInput())).toEqual([]);
  });
});

describe('DeterministicExtractor', () => {
  it('never hallucinates: empty text yields no assumptions plus a diagnostic', async () => {
    const extractor = new DeterministicExtractor();
    const result = await extractor.extract({ unitId: 'empty', text: '   ' });
    expect(result.assumptions).toEqual([]);
    expect(result.diagnostics?.length).toBeGreaterThan(0);
  });

  it('extracts a role assumption from a role comparison', async () => {
    const extractor = new DeterministicExtractor();
    const result = await extractor.extract({
      unitId: 'billing',
      text: `if (user.role === 'admin') { manageSubscription(); }`,
    });
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions[0]?.subject).toContain('user_role');
  });
});

describe('full pipeline: killer example (owner vs admin)', () => {
  it('extracts assumptions from requirement and both branches', async () => {
    const { assumptions } = await runFullPipeline(killerInput());
    expect(assumptions.length).toBeGreaterThanOrEqual(2);
  });

  it('detects at least one semantic conflict', async () => {
    const { conflicts } = await runFullPipeline(killerInput());
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it('explainConflicts agrees with detectConflicts and is deterministic', async () => {
    const first = await runFullPipeline(killerInput());
    const second = await runFullPipeline(killerInput());
    expect(first.reports.length).toBe(first.conflicts.length);
    expect(second.conflicts.map((c) => c.id)).toEqual(first.conflicts.map((c) => c.id));
  });
});

describe('full pipeline: agreeing branches (owner vs owner)', () => {
  it('detects no conflict when both sides agree', async () => {
    const { assumptions, conflicts } = await runFullPipeline(agreeingInput());
    expect(assumptions.length).toBeGreaterThanOrEqual(2);
    expect(conflicts).toEqual([]);
  });
});

describe('detectConflicts edge cases', () => {
  it('returns an empty array for empty input', () => {
    expect(detectConflicts([])).toEqual([]);
    expect(explainConflicts([])).toEqual([]);
  });
});
