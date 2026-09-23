import { ValidationError } from '@/shared/errors/app-error';
import type { LemmaDefinitionLookupResultDto } from '../dto/lemma-definition-lookup.dto';
import type { ProviderLemmaRaw } from '../ports/lemma-definition-provider.port';
import {
  mapProviderLemmaToLookupResult,
  normalizeLemmaQuery,
} from '../lemma-definition.mapper';
import type { LemmaDefinitionProviderRegistry } from '../ports/lemma-definition-provider-registry.port';

interface CacheEntry {
  expiresAt: number;
  fetchedAt: Date;
  raw: ProviderLemmaRaw | null;
  providerName: string;
}

export class LookupLemmaDefinitionUseCase {
  // ponytail: in-memory TTL cache, single-isolate - upgrade KV/Redis jika multi-instance Workers butuh hit-rate tinggi
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly registry: LemmaDefinitionProviderRegistry,
    private readonly cacheTtlSeconds: number,
  ) {}

  async execute(
    lemma: string,
    providerId?: string | null,
  ): Promise<LemmaDefinitionLookupResultDto> {
    const query = lemma.trim();
    if (!query) {
      throw new ValidationError([{ field: 'lemma', message: 'Lemma tidak boleh kosong' }]);
    }
    if (query.length > 100) {
      throw new ValidationError([{ field: 'lemma', message: 'Lemma maksimal 100 karakter' }]);
    }

    const provider = this.registry.resolve(providerId);
    const normalizedQuery = normalizeLemmaQuery(query);
    // Cache per-provider supaya override ?provider= tidak campur hasil
    const cacheKey = `${provider.providerName}:${normalizedQuery}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return mapProviderLemmaToLookupResult({
        query,
        normalizedQuery,
        providerName: cached.providerName,
        fetchedAt: cached.fetchedAt,
        cacheHit: true,
        raw: cached.raw,
      });
    }

    const raw = await provider.lookup(normalizedQuery);
    const fetchedAt = new Date();
    if (this.cacheTtlSeconds > 0) {
      this.cache.set(cacheKey, {
        raw,
        fetchedAt,
        providerName: provider.providerName,
        expiresAt: now + this.cacheTtlSeconds * 1000,
      });
    }

    return mapProviderLemmaToLookupResult({
      query,
      normalizedQuery,
      providerName: provider.providerName,
      fetchedAt,
      cacheHit: false,
      raw,
    });
  }
}
