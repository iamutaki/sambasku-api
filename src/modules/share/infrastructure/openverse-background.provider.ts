import { BadGatewayError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
  ShareBackgroundSearchOptions,
  ShareBackgroundSort,
  ShareOrientation,
} from '../application/ports/share-background-provider.port';

const OPENVERSE_IMAGES_URL = 'https://api.openverse.org/v1/images/';
const FETCH_TIMEOUT_MS = 8_000;
const FALLBACK_QUERY = 'indonesia';
/** CC0 / Public Domain + BY + BY-SA + BY-NC (always-on). */
export const OPENVERSE_SAFE_LICENSES = 'cc0,pdm,by,by-sa,by-nc';

export class OpenverseBackgroundProvider implements ShareBackgroundProviderPort {
  readonly providerId = 'openverse' as const;
  readonly providerName = 'openverse';
  readonly supportedMedia = ['photo'] as const;

  async search(
    query: string,
    limit: number,
    page: number,
    _sort: ShareBackgroundSort = 'relevant',
    options: ShareBackgroundSearchOptions = {},
  ): Promise<ShareBackgroundItem[]> {
    void _sort;
    const safePage = Math.max(1, Math.floor(page));
    const perPage = String(Math.min(Math.max(limit, 1), 30));
    const q = query.trim() || FALLBACK_QUERY;
    const url = buildOpenverseSearchUrl(q, safePage, perPage, options.orientation);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Openverse',
      );
    }

    if (!res.ok) {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Openverse',
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Openverse',
      );
    }

    return mapOpenversePhotos(body).slice(0, Math.min(Math.max(limit, 1), 30));
  }
}

export function buildOpenverseSearchUrl(
  query: string,
  page: number,
  perPage: string,
  orientation?: ShareOrientation,
): URL {
  const url = new URL(OPENVERSE_IMAGES_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', perPage);
  url.searchParams.set('mature', 'false');
  url.searchParams.set('license', OPENVERSE_SAFE_LICENSES);
  url.searchParams.set('unstable__include_sensitive_results', 'false');
  const aspect = mapAspect(orientation);
  if (aspect) url.searchParams.set('aspect_ratio', aspect);
  return url;
}

function mapAspect(orientation?: ShareOrientation): string | undefined {
  if (orientation === 'portrait') return 'tall';
  if (orientation === 'landscape') return 'wide';
  if (orientation === 'square') return 'square';
  return undefined;
}

function mapOpenversePhotos(body: unknown): ShareBackgroundItem[] {
  if (!body || typeof body !== 'object') return [];
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const items: ShareBackgroundItem[] = [];
  for (const raw of results) {
    const item = mapOpenversePhoto(raw);
    if (item) items.push(item);
  }
  return items;
}

export function mapOpenversePhoto(raw: unknown): ShareBackgroundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const hit = raw as Record<string, unknown>;
  if (hit.mature === true) return null;
  const sensitivity = hit.unstable__sensitivity;
  if (Array.isArray(sensitivity) && sensitivity.length > 0) return null;

  const id = hit.id != null ? String(hit.id) : '';
  const url = typeof hit.url === 'string' ? hit.url : '';
  const photographer =
    (typeof hit.creator === 'string' && hit.creator.trim()) || 'Openverse';
  if (!id || !url) return null;
  const pageUrl =
    (typeof hit.foreign_landing_url === 'string' && hit.foreign_landing_url) ||
    url;
  const preview =
    (typeof hit.thumbnail === 'string' && hit.thumbnail) || url;
  const width = typeof hit.width === 'number' ? hit.width : 0;
  const height = typeof hit.height === 'number' ? hit.height : 0;
  return {
    id: `openverse-photo-${id}`,
    url,
    preview_url: preview,
    photographer,
    username: photographer,
    attribution_url: pageUrl,
    unsplash_url: pageUrl,
    provider: 'openverse',
    kind: 'photo',
    width,
    height,
    duration_seconds: 0,
    mime_type: 'image/jpeg',
  };
}
