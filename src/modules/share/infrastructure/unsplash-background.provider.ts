import { BadGatewayError, ServiceUnavailableError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
} from '../application/ports/share-background-provider.port';

const UNSPLASH_SEARCH_URL = 'https://api.unsplash.com/search/photos';
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Proxy Unsplash Search Photos.
 * Access key di-inject dari factory (hindari import env di sini).
 */
export class UnsplashBackgroundProvider implements ShareBackgroundProviderPort {
  readonly providerName = 'unsplash';

  constructor(private readonly accessKey: string) {}

  async search(query: string, limit: number): Promise<ShareBackgroundItem[]> {
    const key = this.accessKey.trim();
    if (!key) {
      throw new ServiceUnavailableError(
        'SHARE_BACKGROUND_PROVIDER_UNAVAILABLE',
        'Penyedia foto latar belum dikonfigurasi',
      );
    }

    const url = new URL(UNSPLASH_SEARCH_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', String(Math.min(Math.max(limit, 1), 10)));
    url.searchParams.set('orientation', 'portrait');
    url.searchParams.set('content_filter', 'high');

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

    return mapUnsplashSearch(body);
  }
}

function mapUnsplashSearch(body: unknown): ShareBackgroundItem[] {
  if (!body || typeof body !== 'object') return [];
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  const items: ShareBackgroundItem[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue;
    const photo = raw as Record<string, unknown>;
    const urls = photo.urls as Record<string, unknown> | undefined;
    const user = photo.user as Record<string, unknown> | undefined;
    const links = photo.links as Record<string, unknown> | undefined;

    const url = typeof urls?.regular === 'string' ? urls.regular : null;
    const photographer = typeof user?.name === 'string' ? user.name : null;
    const username = typeof user?.username === 'string' ? user.username : null;
    const unsplashUrl =
      typeof links?.html === 'string'
        ? links.html
        : typeof username === 'string'
          ? `https://unsplash.com/@${username}`
          : null;

    if (!url || !photographer || !username || !unsplashUrl) continue;

    items.push({
      url,
      photographer,
      username,
      unsplash_url: unsplashUrl,
    });
  }
  return items;
}
