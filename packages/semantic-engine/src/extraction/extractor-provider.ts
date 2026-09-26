/**
 * extractor-provider.ts
 *
 * AssumptionExtractorProvider — provider-agnostic interface any AI service must implement.
 */

import { SemanticAssumption } from "../types/assumption";
import { AssumptionCategory } from "./assumption-category";

export interface ExtractionUnit {
  readonly unitId: string;
  readonly text: string;
  readonly categoryHint?: AssumptionCategory;
  readonly sourceFile?: string;
}

export interface ExtractionResult {
  readonly unitId: string;
  readonly assumptions: readonly SemanticAssumption[];
  readonly diagnostics?: readonly string[];
}

export interface AssumptionExtractorProvider {
  extract(unit: ExtractionUnit): Promise<ExtractionResult>;
  readonly providerName: string;
}
