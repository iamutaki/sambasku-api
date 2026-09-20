import { ValidationError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderId,
  ShareBackgroundProviderPort,
  ShareBackgroundSort,
} from '../ports/share-background-provider.port';
import type { ShareBackgroundProviderRegistry } from '../../infrastructure/share-background.factory';

export interface ListShareBackgroundsResult {
  provider: ShareBackgroundProviderId;
  query: string;
  page: number;
  cache_hit: boolean;
  degraded: boolean;
  items: ShareBackgroundItem[];
}

interface CacheEntry {
  expiresAt: number;
  items: ShareBackgroundItem[];
}

const DEFAULT_LIMIT = 3;

export class ListShareBackgroundsUseCase {
  // ponytail: in-memory TTL cache, single-isolate - upgrade KV jika multi-instance
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly providers: ShareBackgroundProviderRegistry | ShareBackgroundProviderPort | null,
    private readonly cacheTtlSeconds: number,
  ) {}

  private resolveProvider(
    providerId: ShareBackgroundProviderId,
  ): ShareBackgroundProviderPort | null {
    if (!this.providers) return null;
    if (this.providers instanceof Map) {
      return this.providers.get(providerId) ?? null;
    }
    // Legacy single-provider ctor
    return this.providers.providerId === providerId ||
      this.providers.providerName === providerId
      ? this.providers
      : null;
  }

  async execute(
    query: string,
    page: number = 1,
    sort: ShareBackgroundSort = 'relevant',
    providerId: ShareBackgroundProviderId = 'unsplash',
    limit: number = DEFAULT_LIMIT,
  ): Promise<ListShareBackgroundsResult> {
    const safeSort: ShareBackgroundSort = sort === 'popular' ? 'popular' : 'relevant';
    const trimmed = query.trim().replace(/\s+/g, ' ');

    if (safeSort === 'relevant') {
      if (!trimmed) {
        throw new ValidationError([
          { field: 'q', message: 'Query foto tidak boleh kosong' },
        ]);
      }
      if (trimmed.length > 120) {
        throw new ValidationError([
          { field: 'q', message: 'Query foto maksimal 120 karakter' },
        ]);
      }
    } else if (trimmed.length > 120) {
      throw new ValidationError([
        { field: 'q', message: 'Query foto maksimal 120 karakter' },
      ]);
    }

    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_LIMIT, 1), 30);
    const queryLabel = safeSort === 'popular' ? (trimmed || 'popular') : trimmed;

    const provider = this.resolveProvider(providerId);
    if (!provider) {
      // Provider tidak dikenal → 400; provider dikenal tapi belum dikonfigurasi → degraded.
      const known = providerId === 'unsplash';
      if (!known) {
        throw new ValidationError([
          { field: 'provider', message: `Provider tidak didukung: ${providerId}` },
        ]);
      }
      return {
        provider: providerId,
        query: queryLabel,
        page: safePage,
        cache_hit: false,
        degraded: true,
        items: [],
      };
    }

    const cacheKey =
      safeSort === 'popular'
        ? `${provider.providerId}:popular:${safePage}:${safeLimit}`
        : `${provider.providerId}:${trimmed.toLowerCase()}:${safePage}:${safeLimit}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return {
        provider: provider.providerId,
        query: queryLabel,
        page: safePage,
        cache_hit: true,
        degraded: false,
        items: cached.items,
      };
    }

    try {
      const items = await provider.search(
        trimmed || 'nature',
        safeLimit,
        safePage,
        safeSort,
      );
      if (this.cacheTtlSeconds > 0) {
        this.cache.set(cacheKey, {
          items,
          expiresAt: now + this.cacheTtlSeconds * 1000,
        });
      }
      return {
        provider: provider.providerId,
        query: queryLabel,
        page: safePage,
        cache_hit: false,
        degraded: false,
        items,
      };
    } catch {
      return {
        provider: provider.providerId,
        query: queryLabel,
        page: safePage,
        cache_hit: false,
        degraded: true,
        items: [],
      };
    }
  }
}
