import { BadGatewayError } from '@/shared/errors/app-error';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
  ShareBackgroundSearchOptions,
  ShareBackgroundSort,
  ShareMediaKind,
} from '../application/ports/share-background-provider.port';

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
const FETCH_TIMEOUT_MS = 8_000;
const FALLBACK_QUERY = 'indonesia';
const MIN_VIDEO_SECONDS = 3;
const MAX_VIDEO_SECONDS = 20;
export const DEFAULT_WIKIMEDIA_USER_AGENT =
  'SambasKu/1.0 (https://kamus-sambas.app; share-backgrounds)';

export class WikimediaBackgroundProvider implements ShareBackgroundProviderPort {
  readonly providerId = 'wikimedia' as const;
  readonly providerName = 'wikimedia';
  readonly supportedMedia = ['photo', 'video'] as const;

  constructor(private readonly userAgent?: string) {}

  async search(
    query: string,
    limit: number,
    page: number,
    _sort: ShareBackgroundSort = 'relevant',
    options: ShareBackgroundSearchOptions = {},
  ): Promise<ShareBackgroundItem[]> {
    void _sort;
    const media: ShareMediaKind = options.media === 'video' ? 'video' : 'photo';
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const q = query.trim() || FALLBACK_QUERY;
    const mime = media === 'video' ? 'video/mp4' : 'image/jpeg';
    const offset = (safePage - 1) * safeLimit;
    const url = new URL(WIKIMEDIA_API);
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrsearch', `${q} filemime:${mime}`);
    url.searchParams.set('gsrlimit', String(safeLimit));
    url.searchParams.set('gsroffset', String(offset));
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set(
      'iiprop',
      'url|size|mime|extmetadata|thumbmime',
    );
    url.searchParams.set('iiurlwidth', media === 'video' ? '640' : '1280');

    const ua = this.userAgent?.trim() || DEFAULT_WIKIMEDIA_USER_AGENT;

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': ua,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Wikimedia',
      );
    }

    if (!res.ok) {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Wikimedia',
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new BadGatewayError(
        'SHARE_BACKGROUND_PROVIDER_ERROR',
        'Gagal mengambil latar dari Wikimedia',
      );
    }

    const items = mapWikimediaPages(body, media);
    return items.slice(0, safeLimit);
  }
}

function mapWikimediaPages(
  body: unknown,
  media: ShareMediaKind,
): ShareBackgroundItem[] {
  if (!body || typeof body !== 'object') return [];
  const query = (body as { query?: unknown }).query;
  if (!query || typeof query !== 'object') return [];
  const pages = (query as { pages?: unknown }).pages;
  const list = Array.isArray(pages)
    ? pages
    : pages && typeof pages === 'object'
      ? Object.values(pages as Record<string, unknown>)
      : [];
  const items: ShareBackgroundItem[] = [];
  for (const raw of list) {
    const item =
      media === 'video' ? mapWikimediaVideo(raw) : mapWikimediaPhoto(raw);
    if (item) items.push(item);
  }
  return items;
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

export function artistFromExtmetadata(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const artist = (raw as Record<string, unknown>).Artist;
  if (!artist || typeof artist !== 'object') return '';
  const value = (artist as { value?: unknown }).value;
  if (typeof value !== 'string') return '';
  return stripHtml(value);
}

function fileTitle(title: unknown): string {
  if (typeof title !== 'string' || !title) return '';
  return title.replace(/^File:/i, '').replace(/\.[^.]+$/, '').trim();
}

function firstImageInfo(raw: Record<string, unknown>): Record<string, unknown> | null {
  const info = raw.imageinfo;
  if (!Array.isArray(info) || info.length === 0) return null;
  const first = info[0];
  if (!first || typeof first !== 'object') return null;
  return first as Record<string, unknown>;
}

export function mapWikimediaPhoto(raw: unknown): ShareBackgroundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const page = raw as Record<string, unknown>;
  const pageId = page.pageid != null ? String(page.pageid) : '';
  const info = firstImageInfo(page);
  if (!pageId || !info) return null;
  const url =
    (typeof info.thumburl === 'string' && info.thumburl) ||
    (typeof info.url === 'string' && info.url) ||
    '';
  if (!url) return null;
  const photographer =
    artistFromExtmetadata(info.extmetadata) || fileTitle(page.title) || 'Wikimedia';
  const pageUrl =
    (typeof info.descriptionurl === 'string' && info.descriptionurl) || url;
  const width = typeof info.thumbwidth === 'number'
    ? info.thumbwidth
    : typeof info.width === 'number'
      ? info.width
      : 0;
  const height = typeof info.thumbheight === 'number'
    ? info.thumbheight
    : typeof info.height === 'number'
      ? info.height
      : 0;
  return {
    id: `wikimedia-photo-${pageId}`,
    url,
    preview_url: url,
    photographer,
    username: photographer,
    attribution_url: pageUrl,
    unsplash_url: pageUrl,
    provider: 'wikimedia',
    kind: 'photo',
    width,
    height,
    duration_seconds: 0,
    mime_type: 'image/jpeg',
  };
}

export function mapWikimediaVideo(raw: unknown): ShareBackgroundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const page = raw as Record<string, unknown>;
  const pageId = page.pageid != null ? String(page.pageid) : '';
  const info = firstImageInfo(page);
  if (!pageId || !info) return null;
  const mime = typeof info.mime === 'string' ? info.mime : '';
  if (mime && mime !== 'video/mp4') return null;
  const durationRaw = info.duration;
  const duration =
    typeof durationRaw === 'number'
      ? Math.round(durationRaw)
      : typeof durationRaw === 'string'
        ? Math.round(Number(durationRaw))
        : 0;
  if (!Number.isFinite(duration) || duration < MIN_VIDEO_SECONDS || duration > MAX_VIDEO_SECONDS) {
    return null;
  }
  const url = typeof info.url === 'string' ? info.url : '';
  if (!url) return null;
  const preview =
    (typeof info.thumburl === 'string' && info.thumburl) || url;
  const photographer =
    artistFromExtmetadata(info.extmetadata) || fileTitle(page.title) || 'Wikimedia';
  const pageUrl =
    (typeof info.descriptionurl === 'string' && info.descriptionurl) || url;
  const width = typeof info.width === 'number' ? info.width : 0;
  const height = typeof info.height === 'number' ? info.height : 0;
  return {
    id: `wikimedia-video-${pageId}`,
    url,
    preview_url: preview,
    photographer,
    username: photographer,
    attribution_url: pageUrl,
    unsplash_url: pageUrl,
    provider: 'wikimedia',
    kind: 'video',
    width,
    height,
    duration_seconds: Math.max(1, duration),
    mime_type: 'video/mp4',
  };
}
