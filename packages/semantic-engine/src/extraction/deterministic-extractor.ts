/**
 * deterministic-extractor.ts
 *
 * DeterministicExtractor — default AssumptionExtractorProvider. No AI calls.
 */

import { AssumptionExtractorProvider, ExtractionUnit, ExtractionResult } from "./extractor-provider";
import { AssumptionCategory } from "./assumption-category";
import { ALL_RULE_PATTERNS, RulePattern } from "./rule-patterns";
import { SemanticAssumption } from "../types/assumption";
import { SourceType } from "../types/enums";

function makeAssumptionId(unitId: string, subject: string, predicate: string, index: number): string {
  const slug = `${unitId}__${subject}__${predicate}__${index}`
    .replace(/[^a-z0-9_]+/gi, "_")
    .toLowerCase();
  return `assm_${slug}`;
}

function categoryToSourceType(sourceType: SourceType): SourceType {
  return sourceType;
}

function splitIntoSegments(text: string): string[] {
  return text
    .split(/(?:[.;\n]|\r\n)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
}

function applyPatterns(
  segment: string,
  fullText: string,
  categoryHint: AssumptionCategory | undefined,
  patterns: readonly RulePattern[]
): Array<{ rule: RulePattern; result: NonNullable<ReturnType<RulePattern["extract"]>> }> {
  const results: Array<{ rule: RulePattern; result: NonNullable<ReturnType<RulePattern["extract"]>> }> = [];

  const applicablePatterns = categoryHint
    ? patterns.filter(
        (p) =>
          p.category === categoryHint ||
          (categoryHint === AssumptionCategory.BUSINESS_RULE &&
            p.category === AssumptionCategory.AUTHORIZATION)
      )
    : patterns;

  for (const rulePattern of applicablePatterns) {
    rulePattern.pattern.lastIndex = 0;
    const match = rulePattern.pattern.exec(segment);
    if (match) {
      const extracted = rulePattern.extract(match, fullText);
      if (extracted !== null) {
        results.push({ rule: rulePattern, result: extracted });
      }
    }
  }

  return results;
}

export class DeterministicExtractor implements AssumptionExtractorProvider {
  readonly providerName = "DeterministicExtractor";

  private readonly defaultSourceType: SourceType;

  constructor(options: { defaultSourceType?: SourceType } = {}) {
    this.defaultSourceType = options.defaultSourceType ?? SourceType.REQUIREMENT;
  }

  async extract(unit: ExtractionUnit): Promise<ExtractionResult> {
    const diagnostics: string[] = [];

    if (!unit.text || unit.text.trim().length === 0) {
      diagnostics.push(`Unit "${unit.unitId}": empty text — no assumptions extracted`);
      return { unitId: unit.unitId, assumptions: [], diagnostics };
    }

    const sourceType = this.defaultSourceType;
    const assumptions: SemanticAssumption[] = [];
    const seenKeys = new Set<string>();
    const segments = splitIntoSegments(unit.text);

    if (segments.length === 0) {
      diagnostics.push(`Unit "${unit.unitId}": text too short to segment`);
      return { unitId: unit.unitId, assumptions: [], diagnostics };
    }

    let matchIndex = 0;

    for (const segment of segments) {
      const matches = applyPatterns(segment, unit.text, unit.categoryHint, ALL_RULE_PATTERNS);

      for (const { result } of matches) {
        const dedupeKey = `${result.subject}||${result.predicate}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const id = makeAssumptionId(unit.unitId, result.subject, result.predicate, matchIndex++);

        const assumption: SemanticAssumption = {
          id,
          statement: result.statement,
          subject: result.subject,
          predicate: result.predicate,
          sourceType: categoryToSourceType(sourceType),
          evidenceText: result.evidenceText,
          confidence: result.confidence,
          ...(unit.sourceFile !== undefined ? { sourceFile: unit.sourceFile } : {}),
        };

        assumptions.push(assumption);
      }
    }

    if (assumptions.length === 0) {
      diagnostics.push(
        `Unit "${unit.unitId}": no pattern matched — returning empty result (not hallucinating)`
      );
    }

    return { unitId: unit.unitId, assumptions, diagnostics };
  }
}
