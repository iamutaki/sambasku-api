/** Bentuk data response GET /api/v1/lemma-definitions/lookup (kontrak 13). */

export interface LemmaDefinitionSenseDto {
  sense_index: number;
  word_class_code: string | null;
  word_class_label: string | null;
  definition: string;
  examples: string[];
  notes: string | null;
}

export interface LemmaDefinitionEntryDto {
  lemma: string;
  homonym_index: number;
  senses: LemmaDefinitionSenseDto[];
}

export interface LemmaDefinitionSuggestionDto {
  id: string;
  lemma: string;
  homonym_index: number;
  sense_index: number;
  word_class_code: string | null;
  word_class_label: string | null;
  definition: string;
  preview: string;
}

export interface LemmaDefinitionLookupResultDto {
  query: string;
  normalized_query: string;
  found: boolean;
  provider: string;
  fetched_at: string;
  cache_hit: boolean;
  entries: LemmaDefinitionEntryDto[];
  suggestions: LemmaDefinitionSuggestionDto[];
}
