/**
 * extraction-pipeline.ts
 *
 * ExtractionPipeline — orchestrates assumption extraction for a full AnalysisInput.
 */

import { AnalysisInput, ChangeDescription, FileSnippet } from "../types/input";
import { SemanticAssumption } from "../types/assumption";
import { AssumptionExtractorProvider, ExtractionUnit } from "./extractor-provider";
import { AssumptionCategory } from "./assumption-category";
import { SourceType } from "../types/enums";

export interface PipelineExtractionResult {
  readonly assumptions: readonly SemanticAssumption[];
  readonly diagnostics: readonly string[];
}

function guessCategoryHint(label: string, sourceType: SourceType): AssumptionCategory | undefined {
  const l = label.toLowerCase();
  if (sourceType === SourceType.REQUIREMENT) {
    if (/role|permission|access|auth|owner|admin/.test(l)) return AssumptionCategory.AUTHORIZATION;
    return AssumptionCategory.BUSINESS_RULE;
  }
  if (/auth|role|permission|login|access/.test(l)) return AssumptionCategory.AUTHORIZATION;
  if (/api|contract|endpoint|response|request|field|payload/.test(l)) return AssumptionCategory.CONTRACT;
  if (/schema|model|database|db|migration|column|table/.test(l)) return AssumptionCategory.SCHEMA;
  if (/depend|service|notif|email|send|import|inject/.test(l)) return AssumptionCategory.DEPENDENCY;
  if (/billing|payment|subscription|invoice/.test(l)) return AssumptionCategory.BUSINESS_RULE;
  return undefined;
}

function requirementUnit(input: AnalysisInput): ExtractionUnit {
  return {
    unitId: "requirement",
    text: input.requirementText,
    categoryHint: guessCategoryHint("requirement", SourceType.REQUIREMENT),
  };
}

function snippetUnit(unitId: string, snippet: FileSnippet): ExtractionUnit {
  return {
    unitId,
    text: snippet.content,
    categoryHint: guessCategoryHint(snippet.filePath, snippet.sourceType),
    sourceFile: snippet.filePath,
  };
}

function changeUnits(change: ChangeDescription): ExtractionUnit[] {
  const units: ExtractionUnit[] = [];
  units.push({
    unitId: change.id,
    text: change.content,
    categoryHint: guessCategoryHint(change.label, SourceType.CODE_DIFF),
  });
  if (change.fileSnippets) {
    change.fileSnippets.forEach((snippet, idx) => {
      units.push(snippetUnit(`${change.id}__snippet_${idx}`, snippet));
    });
  }
  return units;
}

function contextDocumentUnits(input: AnalysisInput): ExtractionUnit[] {
  if (!input.contextDocuments) return [];
  return input.contextDocuments.map((doc, idx) => snippetUnit(`context_doc_${idx}`, doc));
}

export class ExtractionPipeline {
  private readonly provider: AssumptionExtractorProvider;

  constructor(provider: AssumptionExtractorProvider) {
    this.provider = provider;
  }

  async run(input: AnalysisInput): Promise<PipelineExtractionResult> {
    const allAssumptions: SemanticAssumption[] = [];
    const allDiagnostics: string[] = [];

    const units: ExtractionUnit[] = [
      requirementUnit(input),
      ...input.changes.flatMap(changeUnits),
      ...contextDocumentUnits(input),
    ];

    for (const unit of units) {
      const result = await this.provider.extract(unit);
      allAssumptions.push(...result.assumptions);
      if (result.diagnostics) allDiagnostics.push(...result.diagnostics);
    }

    return { assumptions: allAssumptions, diagnostics: allDiagnostics };
  }
}
