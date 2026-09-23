import { BadGatewayError, ServiceUnavailableError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
  ShareBackgroundSearchOptions,
  ShareBackgroundSort,
  ShareMediaKind,
  ShareOrientation,
} from '../application/ports/share-background-provider.port';

const PIXABAY_PHOTO_URL = 'https://pixabay.com/api/';
const PIXABAY_VIDEO_URL = 'https://pixabay.com/api/videos/';
const FETCH_TIMEOUT_MS = 8_000;
/** Pixabay menolak fetch Workers tanpa UA deskriptif (WAF / 403). */
const PIXABAY_USER_AGENT =
  'SambasKu/1.0 (https://kamus-sambas.app; share-backgrounds)';
const MIN_VIDEO_SECONDS = 3;
const MAX_VIDEO_SECONDS = 20;

export class PixabayBackgroundProvider implements ShareBackgroundProviderPort {
  readonly providerId = 'pixabay' as const;
  readonly providerName = 'pixabay';
  readonly supportedMedia = ['photo', 'video'] as const;

  constructor(private readonly apiKey: string) {}

  async search(
    query: string,
    limit: number,
    page: number,
    sort: ShareBackgroundSort = 'relevant',
    options: ShareBackgroundSearchOptions = {},
  ): Promise<ShareBackgroundItem[]> {
    const key = this.apiKey.trim();
    if (!key) {
      throw new ServiceUnavailableError(
        'SHARE_BACKGROUND_PROVIDER_UNAVAILABLE',
        'Penyedia latar Pixabay belum dikonfigurasi',
      );
    }

    const media: ShareMediaKind = options.media === 'video' ? 'video' : 'photo';
    const safePage = Math.max(1, Math.floor(page));
    const perPage = String(Math.min(Math.max(limit, 3), 30));
    const url =
      media === 'video'
        ? buildUrl(PIXABAY_VIDEO_URL, key, query, safePage, perPage, sort, options.orientation)
        : buildUrl(PIXABAY_PHOTO_URL, key, query, safePage, perPage, sort, options.orientation, true);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': PIXABAY_USER_AGENT,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Pixabay',
      );
    }

    if (!res.ok) {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Pixabay',
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Pixabay',
      );
    }

    const items = media === 'video' ? mapPixabayVideos(body) : mapPixabayPhotos(body);
    return items.slice(0, Math.min(Math.max(limit, 1), 30));
  }
}

function buildUrl(
  base: string,
  key: string,
  query: string,
  page: number,
  perPage: string,
  sort: ShareBackgroundSort,
  orientation?: ShareOrientation,
  photo = false,
): URL {
  const url = new URL(base);
  url.searchParams.set('key', key);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', perPage);
  url.searchParams.set('safesearch', 'true');
  if (sort === 'popular') {
    url.searchParams.set('order', 'popular');
  }
  if (photo) {
    url.searchParams.set('image_type', 'photo');
  }
  const q = query.trim();
  if (q) {
    url.searchParams.set('q', q);
  }
  const pixOrientation = mapOrientation(orientation);
  if (pixOrientation) {
    url.searchParams.set('orientation', pixOrientation);
  }
  return url;
}

function mapOrientation(orientation?: ShareOrientation): string | undefined {
  if (orientation === 'portrait') return 'vertical';
  if (orientation === 'landscape') return 'horizontal';
  return undefined;
}

function mapPixabayPhotos(body: unknown): ShareBackgroundItem[] {
  if (!body || typeof body !== 'object') return [];
  const hits = (body as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];
  const items: ShareBackgroundItem[] = [];
  for (const raw of hits) {
    const item = mapPixabayPhoto(raw);
    if (item) items.push(item);
  }
  return items;
}

export function mapPixabayPhoto(raw: unknown): ShareBackgroundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const hit = raw as Record<string, unknown>;
  const id = hit.id != null ? String(hit.id) : '';
  const url =
    (typeof hit.largeImageURL === 'string' && hit.largeImageURL) ||
    (typeof hit.webformatURL === 'string' && hit.webformatURL) ||
    '';
  const photographer = typeof hit.user === 'string' ? hit.user : '';
  const pageUrl = typeof hit.pageURL === 'string' ? hit.pageURL : '';
  if (!id || !url || !photographer) return null;
  const width = typeof hit.imageWidth === 'number' ? hit.imageWidth : 0;
  const height = typeof hit.imageHeight === 'number' ? hit.imageHeight : 0;
  return {
    id: `pixabay-photo-${id}`,
    url,
    preview_url: url,
    photographer,
    username: photographer,
    attribution_url: pageUrl,
    unsplash_url: pageUrl,
    provider: 'pixabay',
    kind: 'photo',
    width,
    height,
    duration_seconds: 0,
    mime_type: 'image/jpeg',
  };
}

function mapPixabayVideos(body: unknown): ShareBackgroundItem[] {
  if (!body || typeof body !== 'object') return [];
  const hits = (body as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];
  const items: ShareBackgroundItem[] = [];
  for (const raw of hits) {
    const item = mapPixabayVideo(raw);
    if (item) items.push(item);
  }
  return items;
}

export function pickPixabayVideoFile(
  videos: unknown,
): { url: string; width: number; height: number; thumbnail?: string } | null {
  if (!videos || typeof videos !== 'object') return null;
  const sizes = videos as Record<string, unknown>;
  const order = ['large', 'medium', 'small', 'tiny'];
  for (const name of order) {
    const raw = sizes[name];
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as Record<string, unknown>;
    if (typeof f.url !== 'string' || !f.url) continue;
    return {
      url: f.url,
      width: typeof f.width === 'number' ? f.width : 0,
      height: typeof f.height === 'number' ? f.height : 0,
      thumbnail: typeof f.thumbnail === 'string' ? f.thumbnail : undefined,
    };
  }
  return null;
}

export function mapPixabayVideo(raw: unknown): ShareBackgroundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const hit = raw as Record<string, unknown>;
  const id = hit.id != null ? String(hit.id) : '';
  const duration =
    typeof hit.duration === 'number' ? Math.round(hit.duration) : 0;
  if (duration < MIN_VIDEO_SECONDS || duration > MAX_VIDEO_SECONDS) return null;
  const picked = pickPixabayVideoFile(hit.videos);
  const photographer = typeof hit.user === 'string' ? hit.user : '';
  const pageUrl = typeof hit.pageURL === 'string' ? hit.pageURL : '';
  if (!id || !picked || !photographer) return null;
  const pictureId = typeof hit.picture_id === 'string' ? hit.picture_id : '';
  const preview =
    picked.thumbnail ||
    (pictureId ? `https://i.vimeocdn.com/video/${pictureId}_640x360.jpg` : picked.url);
  return {
    id: `pixabay-video-${id}`,
    url: picked.url,
    preview_url: preview,
    photographer,
    username: photographer,
    attribution_url: pageUrl,
    unsplash_url: pageUrl,
    provider: 'pixabay',
    kind: 'video',
    width: picked.width,
    height: picked.height,
    duration_seconds: Math.max(1, duration),
    mime_type: 'video/mp4',
  };
}
