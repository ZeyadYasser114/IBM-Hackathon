/**
 * extractor-provider.ts
 *
 * AssumptionExtractorProvider — provider-agnostic interface any AI service must implement.
 */

import { SemanticAssumption } from '../types/assumption';
import { AssumptionCategory } from './assumption-category';

export interface ExtractionUnit {
  readonly unitId: string;
  readonly text: string;
  readonly categoryHint?: AssumptionCategory | undefined;
  readonly sourceFile?: string | undefined;
}

export interface ExtractionResult {
  readonly unitId: string;
  readonly assumptions: readonly SemanticAssumption[];
  readonly diagnostics?: readonly string[] | undefined;
}

export interface AssumptionExtractorProvider {
  extract(unit: ExtractionUnit): Promise<ExtractionResult>;
  readonly providerName: string;
}
