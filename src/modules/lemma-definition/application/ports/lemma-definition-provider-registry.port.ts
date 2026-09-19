import type { LemmaDefinitionProviderPort } from './lemma-definition-provider.port';

/** Registry multi-provider - resolve by id (query) atau default env. */
export interface LemmaDefinitionProviderRegistry {
  readonly defaultId: string | null;
  readonly availableIds: readonly string[];
  resolve(requestedId?: string | null): LemmaDefinitionProviderPort;
}
