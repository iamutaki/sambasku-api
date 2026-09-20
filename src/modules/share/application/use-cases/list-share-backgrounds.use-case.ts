import { ValidationError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
} from '../ports/share-background-provider.port';

export interface ListShareBackgroundsResult {
  query: string;
  cache_hit: boolean;
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
    private readonly provider: ShareBackgroundProviderPort | null,
    private readonly cacheTtlSeconds: number,
  ) {}

  async execute(query: string): Promise<ListShareBackgroundsResult> {
    const trimmed = query.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      throw new ValidationError([{ field: 'q', message: 'Query foto tidak boleh kosong' }]);
    }
    if (trimmed.length > 120) {
      throw new ValidationError([
        { field: 'q', message: 'Query foto maksimal 120 karakter' },
      ]);
    }

    // Tanpa provider: daftar kosong (share mobile fallback ke tanpa foto).
    if (!this.provider) {
      return { query: trimmed, cache_hit: false, items: [] };
    }

    const cacheKey = `${this.provider.providerName}:${trimmed.toLowerCase()}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { query: trimmed, cache_hit: true, items: cached.items };
    }

    try {
      const items = await this.provider.search(trimmed, DEFAULT_LIMIT);
      if (this.cacheTtlSeconds > 0) {
        this.cache.set(cacheKey, {
          items,
          expiresAt: now + this.cacheTtlSeconds * 1000,
        });
      }
      return { query: trimmed, cache_hit: false, items };
    } catch {
      // Upstream gagal → empty list; share card tetap bisa tanpa foto.
      return { query: trimmed, cache_hit: false, items: [] };
    }
  }
}
