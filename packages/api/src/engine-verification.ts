/**
 * engine-verification.ts
 *
 * Real verification for the tRPC service path: caller-supplied ChangedFiles
 * are analyzed by the deterministic semantic engine (no stubs, no LLM calls)
 * and the resulting ConflictReports are mapped to domain VerificationResults.
 *
 * Flow:
 *   ChangedFile[] → InMemoryAdapter → createRepositoryContext
 *       → engine AnalysisInput (single-feed rule) → explainConflicts
 *       → domain Assumptions + ConflictFindings → runVerification
 *       → VerificationResult
 *
 * The deterministic engine is the final authority here, exactly as on the
 * Express path. Bob/agent runners plug in through AnalysisPipeline only.
 */

import { randomUUID } from 'node:crypto';

import {
  DeterministicExtractor,
  ExtractionPipeline,
  normalizeAssumptions,
  explainConflicts,
  SourceType,
} from '@mergemind/semantic-engine';
import type { ConflictReport, SemanticAssumption } from '@mergemind/semantic-engine';
import { InMemoryAdapter, createRepositoryContext } from '@mergemind/git-ingest';
import { runVerification, type ConflictDetector } from '@mergemind/verification';
import type {
  Assumption,
  BranchRef,
  ChangedFile,
  CodeEvidence,
  ConflictFinding,
  FeatureRequest,
  RepositorySource,
  VerificationResult,
} from '@mergemind/domain';

// ---------------------------------------------------------------------------
// Detector carrying precomputed engine findings
// ---------------------------------------------------------------------------

/**
 * ConflictDetector that returns findings already produced by the semantic
 * engine. Lets runVerification assemble summaries/status from real results
 * instead of the StubConflictDetector default.
 */
export class StaticFindingsDetector implements ConflictDetector {
  constructor(private readonly findings: ConflictFinding[]) {}

  detect(): ConflictFinding[] {
    return [...this.findings];
  }
}

// ---------------------------------------------------------------------------
// Engine input (single-feed rule: snippets carry the payload)
// ---------------------------------------------------------------------------

const MAX_SNIPPET_CHARS = 20_000;

function requirementTextFor(request: FeatureRequest): string {
  return [request.description, ...request.rules].join('\n');
}

function branchNamesOf(source: RepositorySource, files: ChangedFile[]): string[] {
  const names = files.map((f) => f.branchName);
  const ordered = source.featureBranches.map((b) => b.name).filter((n) => names.includes(n));
  const extra = names.filter((n) => !ordered.includes(n));
  return [...ordered, ...extra];
}

// ---------------------------------------------------------------------------
// Domain mapping
// ---------------------------------------------------------------------------

const NUMERIC_CONFIDENCE = { HIGH: 0.9, MEDIUM: 0.7, LOW: 0.4 } as const;

function firstLines(text: string, maxLines: number): string {
  return text.split('\n').slice(0, maxLines).join('\n');
}

function mapAssumption(
  assumption: SemanticAssumption,
  branchByFile: Map<string, string>,
  fallbackBranch: string,
): Assumption {
  const branchName =
    (assumption.sourceFile && branchByFile.get(assumption.sourceFile)) ?? fallbackBranch;
  const filePath = assumption.sourceFile ?? '—';
  const evidence: CodeEvidence[] = [
    {
      source: assumption.sourceFile ? 'FILE_CHANGE' : 'INFERRED',
      filePath,
      lineStart: null,
      lineEnd: null,
      snippet: firstLines(assumption.evidenceText, 5),
      branchName,
      metadata: {},
    },
  ];
  return {
    id: assumption.id,
    branchName,
    sourceFile: filePath,
    statement: assumption.statement,
    concept: assumption.subject,
    value: assumption.predicate,
    sourceAgent: 'change',
    evidence,
    confidence: assumption.confidence,
    numericConfidence: NUMERIC_CONFIDENCE[assumption.confidence],
    relatedAssumptionIds: [],
    extractedAt: new Date().toISOString(),
  };
}

function mapSeverity(severity: ConflictReport['severity']): ConflictFinding['severity'] {
  return severity === 'INFO' ? 'LOW' : severity;
}

function mapReport(report: ConflictReport, idByStatement: Map<string, string>): ConflictFinding {
  const affectedAssumptionIds = [report.assumptionA.statement, report.assumptionB.statement]
    .map((statement) => idByStatement.get(statement))
    .filter((id): id is string => id !== undefined);
  return {
    id: randomUUID(),
    title: report.title,
    description: report.whyIncompatible,
    severity: mapSeverity(report.severity),
    category: report.conflictType,
    affectedAssumptionIds,
    affectedFiles: Array.from(new Set(report.affectedFiles)).sort(),
    conflictEvidence: [],
    proposedResolution: null,
    resolvedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Run full engine-backed verification for caller-supplied diffs.
 * Never returns stubbed results: empty input yields PASS with zero
 * assumptions, anything else goes through extraction → reports → findings.
 */
export async function runEngineVerification(
  featureRequest: FeatureRequest,
  repositorySource: RepositorySource,
  changedFiles: ChangedFile[],
): Promise<VerificationResult> {
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

  const branches = branchNamesOf(source, ingestedFiles);
  const fallbackBranch = branches[0] ?? repositorySource.baseBranch.name;
  const branchByFile = new Map<string, string>();
  for (const file of ingestedFiles) {
    if (!branchByFile.has(file.path)) branchByFile.set(file.path, file.branchName);
  }

  const changes =
    branches.length > 0
      ? branches.map((branchName, idx) => {
          const snippets = ingestedFiles
            .filter((f) => f.branchName === branchName && f.patch && f.patch.trim().length > 0)
            .slice(0, 50)
            .map((f) => ({
              filePath: f.path,
              sourceType: SourceType.CODE_DIFF,
              content: (f.patch as string).slice(0, MAX_SNIPPET_CHARS),
            }));
          return {
            id: `change-${idx}-${branchName}`,
            label: branchName,
            content: snippets.length > 0 ? '—' : `No textual differences on ${branchName}.`,
            ...(snippets.length > 0 ? { fileSnippets: snippets } : {}),
          };
        })
      : [
          {
            id: 'change-empty',
            label: 'empty',
            content: 'No changes submitted for verification.',
          },
        ];

  const extractor = new DeterministicExtractor({ defaultSourceType: SourceType.CODE_DIFF });
  const pipeline = new ExtractionPipeline(extractor);
  const { assumptions: engineAssumptions } = await pipeline.run({
    sessionId: `trpc-${Date.now()}`,
    requirementText: requirementTextFor(featureRequest),
    changes,
  });
  const normalized = normalizeAssumptions(engineAssumptions);
  const reports = explainConflicts(normalized);

  const assumptions = engineAssumptions.map((a) => mapAssumption(a, branchByFile, fallbackBranch));
  const idByStatement = new Map<string, string>();
  for (const a of assumptions) {
    if (!idByStatement.has(a.statement)) idByStatement.set(a.statement, a.id);
  }
  const findings = reports.map((report) => mapReport(report, idByStatement));

  const distinctFiles = new Set(ingestedFiles.map((f) => f.path));

  return runVerification({
    featureRequest,
    repositorySource: source,
    filesChanged: distinctFiles.size,
    assumptions,
    detector: new StaticFindingsDetector(findings),
  });
}
