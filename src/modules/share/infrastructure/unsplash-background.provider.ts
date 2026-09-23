import { BadGatewayError, ServiceUnavailableError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
  ShareBackgroundSearchOptions,
  ShareBackgroundSort,
} from '../application/ports/share-background-provider.port';

const UNSPLASH_SEARCH_URL = 'https://api.unsplash.com/search/photos';
const UNSPLASH_PHOTOS_URL = 'https://api.unsplash.com/photos';
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Proxy Unsplash Search Photos / List Photos (popular).
 * Access key di-inject dari factory (hindari import env di sini).
 */
export class UnsplashBackgroundProvider implements ShareBackgroundProviderPort {
  readonly providerId = 'unsplash' as const;
  readonly providerName = 'unsplash';
  readonly supportedMedia = ['photo'] as const;

  constructor(private readonly accessKey: string) {}

  async search(
    query: string,
    limit: number,
    page: number,
    sort: ShareBackgroundSort = 'relevant',
    options?: ShareBackgroundSearchOptions,
  ): Promise<ShareBackgroundItem[]> {
    const key = this.accessKey.trim();
    if (!key) {
      throw new ServiceUnavailableError(
        'SHARE_BACKGROUND_PROVIDER_UNAVAILABLE',
        'Penyedia foto latar belum dikonfigurasi',
      );
    }

    const orientation = options?.orientation;
    const safePage = Math.max(1, Math.floor(page));
    const perPage = String(Math.min(Math.max(limit, 1), 30));
    const url =
      sort === 'popular'
        ? buildPopularUrl(safePage, perPage)
        : buildSearchUrl(query, safePage, perPage, orientation);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Client-ID ${key}`,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil foto latar dari Unsplash',
      );
    }

    if (!res.ok) {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil foto latar dari Unsplash',
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil foto latar dari Unsplash',
      );
    }

    return sort === 'popular' ? mapUnsplashList(body) : mapUnsplashSearch(body);
  }
}

function buildSearchUrl(
  query: string,
  page: number,
  perPage: string,
  orientation?: string,
): URL {
  const url = new URL(UNSPLASH_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', perPage);
  url.searchParams.set('page', String(page));
  url.searchParams.set('orientation', orientation ?? 'portrait');
  url.searchParams.set('content_filter', 'high');
  url.searchParams.set('order_by', 'relevant');
  return url;
}

function buildPopularUrl(page: number, perPage: string): URL {
  const url = new URL(UNSPLASH_PHOTOS_URL);
  url.searchParams.set('per_page', perPage);
  url.searchParams.set('page', String(page));
  url.searchParams.set('order_by', 'popular');
  return url;
}

function mapPhoto(raw: unknown): ShareBackgroundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const photo = raw as Record<string, unknown>;
  const urls = photo.urls as Record<string, unknown> | undefined;
  const user = photo.user as Record<string, unknown> | undefined;
  const links = photo.links as Record<string, unknown> | undefined;

  const id = typeof photo.id === 'string' ? photo.id : null;
  const url = typeof urls?.regular === 'string' ? urls.regular : null;
  const photographer = typeof user?.name === 'string' ? user.name : null;
  const username = typeof user?.username === 'string' ? user.username : null;
  const attributionUrl =
    typeof links?.html === 'string'
      ? links.html
      : typeof username === 'string'
        ? `https://unsplash.com/@${username}`
        : null;

  if (!id || !url || !photographer || !username || !attributionUrl) return null;

  const width = typeof photo.width === 'number' ? photo.width : 0;
  const height = typeof photo.height === 'number' ? photo.height : 0;

  return {
    id,
    url,
    photographer,
    username,
    attribution_url: attributionUrl,
    unsplash_url: attributionUrl,
    provider: 'unsplash',
    kind: 'photo',
    preview_url: url,
    width,
    height,
    duration_seconds: 0,
    mime_type: 'image/jpeg',
  };
}

function mapUnsplashSearch(body: unknown): ShareBackgroundItem[] {
  if (!body || typeof body !== 'object') return [];
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const items: ShareBackgroundItem[] = [];
  for (const raw of results) {
    const item = mapPhoto(raw);
    if (item) items.push(item);
  }
  return items;
}

/** GET /photos mengembalikan array langsung. */
function mapUnsplashList(body: unknown): ShareBackgroundItem[] {
  if (!Array.isArray(body)) return [];
  const items: ShareBackgroundItem[] = [];
  for (const raw of body) {
    const item = mapPhoto(raw);
    if (item) items.push(item);
  }
  return items;
}
