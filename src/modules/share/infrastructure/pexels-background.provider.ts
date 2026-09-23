import { BadGatewayError, ServiceUnavailableError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
  ShareBackgroundSearchOptions,
  ShareBackgroundSort,
  ShareMediaKind,
  ShareOrientation,
} from '../application/ports/share-background-provider.port';

const PEXELS_PHOTO_SEARCH_URL = 'https://api.pexels.com/v1/search';
const PEXELS_PHOTO_CURATED_URL = 'https://api.pexels.com/v1/curated';
const PEXELS_VIDEO_SEARCH_URL = 'https://api.pexels.com/videos/search';
const PEXELS_VIDEO_POPULAR_URL = 'https://api.pexels.com/videos/popular';
const FETCH_TIMEOUT_MS = 8_000;

export class PexelsBackgroundProvider implements ShareBackgroundProviderPort {
  readonly providerId = 'pexels' as const;
  readonly providerName = 'pexels';
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
        'Penyedia latar Pexels belum dikonfigurasi',
      );
    }

    const media: ShareMediaKind = options.media === 'video' ? 'video' : 'photo';
    const safePage = Math.max(1, Math.floor(page));
    const perPage = String(Math.min(Math.max(limit, 1), 30));
    const url =
      media === 'video'
        ? buildVideoUrl(query, safePage, perPage, sort, options.orientation)
        : buildPhotoUrl(query, safePage, perPage, sort, options.orientation);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: key,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Pexels',
      );
    }

    if (!res.ok) {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Pexels',
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Pexels',
      );
    }

    return media === 'video' ? mapPexelsVideos(body) : mapPexelsPhotos(body);
  }
}

function buildPhotoUrl(
  query: string,
  page: number,
  perPage: string,
  sort: ShareBackgroundSort,
  orientation?: ShareOrientation,
): URL {
  const url = new URL(
    sort === 'popular' ? PEXELS_PHOTO_CURATED_URL : PEXELS_PHOTO_SEARCH_URL,
  );
  if (sort !== 'popular') {
    url.searchParams.set('query', query);
  }
  url.searchParams.set('per_page', perPage);
  url.searchParams.set('page', String(page));
  if (orientation) {
    url.searchParams.set('orientation', orientation);
  }
  return url;
}

function buildVideoUrl(
  query: string,
  page: number,
  perPage: string,
  sort: ShareBackgroundSort,
  orientation?: ShareOrientation,
): URL {
  const url = new URL(
    sort === 'popular' ? PEXELS_VIDEO_POPULAR_URL : PEXELS_VIDEO_SEARCH_URL,
  );
  if (sort !== 'popular') {
    url.searchParams.set('query', query);
  }
  url.searchParams.set('per_page', perPage);
  url.searchParams.set('page', String(page));
  url.searchParams.set('min_duration', '3');
  url.searchParams.set('max_duration', '20');
  if (orientation) {
    url.searchParams.set('orientation', orientation);
  }
  return url;
}

function mapPexelsPhotos(body: unknown): ShareBackgroundItem[] {
  if (!body || typeof body !== 'object') return [];
  const photos = (body as { photos?: unknown }).photos;
  if (!Array.isArray(photos)) return [];
  const items: ShareBackgroundItem[] = [];
  for (const raw of photos) {
    const item = mapPexelsPhoto(raw);
    if (item) items.push(item);
  }
  return items;
}

function mapPexelsPhoto(raw: unknown): ShareBackgroundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const photo = raw as Record<string, unknown>;
  const src = photo.src as Record<string, unknown> | undefined;
  const id = photo.id != null ? String(photo.id) : '';
  const url =
    (typeof src?.large === 'string' && src.large) ||
    (typeof src?.portrait === 'string' && src.portrait) ||
    (typeof src?.medium === 'string' && src.medium) ||
    '';
  const photographer = typeof photo.photographer === 'string' ? photo.photographer : '';
  const photographerUrl =
    typeof photo.photographer_url === 'string' ? photo.photographer_url : '';
  const pageUrl = typeof photo.url === 'string' ? photo.url : photographerUrl;
  if (!id || !url || !photographer) return null;
  const username = photographerUrl.split('/').filter(Boolean).at(-1) ?? photographer;
  const width = typeof photo.width === 'number' ? photo.width : 0;
  const height = typeof photo.height === 'number' ? photo.height : 0;
  return {
    id: `pexels-photo-${id}`,
    url,
    preview_url: url,
    photographer,
    username,
    attribution_url: pageUrl,
    unsplash_url: pageUrl,
    provider: 'pexels',
    kind: 'photo',
    width,
    height,
    duration_seconds: 0,
    mime_type: 'image/jpeg',
  };
}

function mapPexelsVideos(body: unknown): ShareBackgroundItem[] {
  if (!body || typeof body !== 'object') return [];
  const videos = (body as { videos?: unknown }).videos;
  if (!Array.isArray(videos)) return [];
  const items: ShareBackgroundItem[] = [];
  for (const raw of videos) {
    const item = mapPexelsVideo(raw);
    if (item) items.push(item);
  }
  return items;
}

export function pickPexelsVideoFile(
  files: unknown,
): { link: string; width: number; height: number } | null {
  if (!Array.isArray(files)) return null;
  const mp4 = files.filter((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const f = raw as Record<string, unknown>;
    return f.file_type === 'video/mp4' && typeof f.link === 'string';
  }) as Array<Record<string, unknown>>;
  if (mp4.length === 0) return null;

  const score = (f: Record<string, unknown>) => {
    const w = typeof f.width === 'number' ? f.width : 0;
    const h = typeof f.height === 'number' ? f.height : 0;
    const short = Math.min(w, h) || w || h;
    const quality = f.quality === 'hd' ? 2 : f.quality === 'sd' ? 0 : 1;
    const near1080 = -Math.abs(short - 1080);
    return quality * 10_000 + near1080;
  };
  mp4.sort((a, b) => score(b) - score(a));
  const best = mp4[0];
  return {
    link: best.link as string,
    width: typeof best.width === 'number' ? best.width : 0,
    height: typeof best.height === 'number' ? best.height : 0,
  };
}

export function mapPexelsVideo(raw: unknown): ShareBackgroundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const video = raw as Record<string, unknown>;
  const id = video.id != null ? String(video.id) : '';
  const picked = pickPexelsVideoFile(video.video_files);
  const preview =
    typeof video.image === 'string'
      ? video.image
      : '';
  const user = video.user as Record<string, unknown> | undefined;
  const photographer = typeof user?.name === 'string' ? user.name : '';
  const profileUrl = typeof user?.url === 'string' ? user.url : '';
  const pageUrl = typeof video.url === 'string' ? video.url : profileUrl;
  if (!id || !picked || !photographer) return null;
  const username = profileUrl.split('/').filter(Boolean).at(-1) ?? photographer;
  const duration =
    typeof video.duration === 'number' ? Math.max(1, Math.round(video.duration)) : 1;
  return {
    id: `pexels-video-${id}`,
    url: picked.link,
    preview_url: preview || picked.link,
    photographer,
    username,
    attribution_url: pageUrl,
    unsplash_url: pageUrl,
    provider: 'pexels',
    kind: 'video',
    width: picked.width,
    height: picked.height,
    duration_seconds: duration,
    mime_type: 'video/mp4',
  };
}
