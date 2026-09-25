import { ValidationError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderId,
  ShareBackgroundProviderPort,
  ShareBackgroundSort,
  ShareMediaKind,
  ShareOrientation,
} from '../ports/share-background-provider.port';
import {
  SHARE_BACKGROUND_PROVIDER_IDS,
  SHARE_PROVIDER_MEDIA,
} from '../ports/share-background-provider.port';
import type { ShareBackgroundProviderRegistry } from '../../infrastructure/share-background.factory';
import { isBlockedShareQuery } from '../utils/share-query-denylist';

export interface ListShareBackgroundsResult {
  provider: ShareBackgroundProviderId;
  query: string;
  page: number;
  cache_hit: boolean;
  degraded: boolean;
  media: ShareMediaKind;
  items: ShareBackgroundItem[];
}

interface CacheEntry {
  expiresAt: number;
  items: ShareBackgroundItem[];
}

const DEFAULT_LIMIT = 3;
/** Bump saat policy safe-search berubah agar cache lama tidak tersaji. */
const CACHE_KEY_PREFIX = 'v2';

function isKnownProvider(id: string): id is ShareBackgroundProviderId {
  return (SHARE_BACKGROUND_PROVIDER_IDS as readonly string[]).includes(id);
}

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
    return this.providers.providerId === providerId ||
      this.providers.providerName === providerId
      ? this.providers
      : null;
  }

  async execute(
    query: string,
    page: number = 1,
    sort: ShareBackgroundSort = 'relevant',
    providerId: ShareBackgroundProviderId = 'pixabay',
    limit: number = DEFAULT_LIMIT,
    media: ShareMediaKind = 'photo',
    orientation?: ShareOrientation,
  ): Promise<ListShareBackgroundsResult> {
    const safeSort: ShareBackgroundSort = sort === 'popular' ? 'popular' : 'relevant';
    const safeMedia: ShareMediaKind = media === 'video' ? 'video' : 'photo';
    const trimmed = query.trim().replace(/\s+/g, ' ');

    if (safeSort === 'relevant') {
      if (!trimmed) {
        throw new ValidationError([
          { field: 'q', message: 'Query latar tidak boleh kosong' },
        ]);
      }
      if (trimmed.length > 120) {
        throw new ValidationError([
          { field: 'q', message: 'Query latar maksimal 120 karakter' },
        ]);
      }
    } else if (trimmed.length > 120) {
      throw new ValidationError([
        { field: 'q', message: 'Query latar maksimal 120 karakter' },
      ]);
    }

    if (trimmed && isBlockedShareQuery(trimmed)) {
      throw new ValidationError([
        { field: 'q', message: 'Query pencarian tidak diizinkan' },
      ]);
    }

    if (!SHARE_PROVIDER_MEDIA[providerId]?.includes(safeMedia)) {
      throw new ValidationError([
        { field: 'media', message: 'Provider ini tidak mendukung video.' },
      ]);
    }

    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeLimit = Math.min(
      Math.max(Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_LIMIT, 1),
      30,
    );
    const queryLabel = safeSort === 'popular' ? trimmed || 'popular' : trimmed;
    const orientationKey = orientation ?? 'any';

    const empty = (
      degraded: boolean,
      cacheHit: boolean,
      items: ShareBackgroundItem[],
    ): ListShareBackgroundsResult => ({
      provider: providerId,
      query: queryLabel,
      page: safePage,
      cache_hit: cacheHit,
      degraded,
      media: safeMedia,
      items,
    });

    const provider = this.resolveProvider(providerId);
    if (!provider) {
      if (!isKnownProvider(providerId)) {
        throw new ValidationError([
          { field: 'provider', message: `Provider tidak didukung: ${providerId}` },
        ]);
      }
      return empty(true, false, []);
    }

    const cacheKey = `${CACHE_KEY_PREFIX}:${provider.providerId}:${safeMedia}:${safeSort}:${
      safeSort === 'popular' ? 'popular' : trimmed.toLowerCase()
    }:${safePage}:${safeLimit}:${orientationKey}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return empty(false, true, cached.items);
    }

    try {
      const items = await provider.search(
        trimmed || 'nature',
        safeLimit,
        safePage,
        safeSort,
        { media: safeMedia, orientation },
      );
      if (this.cacheTtlSeconds > 0) {
        this.cache.set(cacheKey, {
          items,
          expiresAt: now + this.cacheTtlSeconds * 1000,
        });
      }
      return empty(false, false, items);
    } catch {
      return empty(true, false, []);
    }
  }
}
