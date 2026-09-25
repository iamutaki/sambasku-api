import { describe, it, expect, vi } from 'vitest';
import { ListShareBackgroundsUseCase } from '../../application/use-cases/list-share-backgrounds.use-case';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
} from '../../application/ports/share-background-provider.port';

function photoItem(
  id: string,
  extras: Partial<ShareBackgroundItem> = {},
): ShareBackgroundItem {
  return {
    id,
    url: `https://images.unsplash.com/photo-${id}`,
    photographer: 'Ada',
    username: 'ada',
    attribution_url: `https://unsplash.com/photos/${id}`,
    unsplash_url: `https://unsplash.com/photos/${id}`,
    provider: 'unsplash',
    kind: 'photo',
    preview_url: `https://images.unsplash.com/photo-${id}`,
    width: 1080,
    height: 1620,
    duration_seconds: 0,
    mime_type: 'image/jpeg',
    ...extras,
  };
}

function makeProvider(
  items: ShareBackgroundItem[],
): ShareBackgroundProviderPort {
  return {
    providerId: 'unsplash',
    providerName: 'unsplash',
    supportedMedia: ['photo'],
    search: vi.fn().mockResolvedValue(items),
  };
}

const sample = [photoItem('1')];
const samplePage2 = [photoItem('2', { photographer: 'Bob', username: 'bob' })];
const defaultOpts = { media: 'photo', orientation: undefined };

describe('ListShareBackgroundsUseCase', () => {
  it('tanpa provider → items kosong + degraded', async () => {
    const useCase = new ListShareBackgroundsUseCase(new Map(), 0);
    const result = await useCase.execute('makan makanan');
    expect(result.items).toEqual([]);
    expect(result.degraded).toBe(true);
    expect(result.page).toBe(1);
    expect(result.provider).toBe('pixabay');
    expect(result.cache_hit).toBe(false);
    expect(result.media).toBe('photo');
  });

  it('sukses: kembalikan items dari provider', async () => {
    const provider = makeProvider(sample);
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      0,
    );
    const result = await useCase.execute('makan', 1, 'relevant', 'unsplash');
    expect(provider.search).toHaveBeenCalledWith(
      'makan',
      3,
      1,
      'relevant',
      defaultOpts,
    );
    expect(result.items).toEqual(sample);
    expect(result.degraded).toBe(false);
    expect(result.provider).toBe('unsplash');
  });

  it('page dihormati dan cache terpisah per page', async () => {
    const provider: ShareBackgroundProviderPort = {
      providerId: 'unsplash',
      providerName: 'unsplash',
      supportedMedia: ['photo'],
      search: vi
        .fn()
        .mockResolvedValueOnce(sample)
        .mockResolvedValueOnce(samplePage2),
    };
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      86_400,
    );

    const p1 = await useCase.execute('makan', 1, 'relevant', 'unsplash');
    const p1Again = await useCase.execute('makan', 1, 'relevant', 'unsplash');
    const p2 = await useCase.execute('makan', 2, 'relevant', 'unsplash');

    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(p1.items).toEqual(sample);
    expect(p1Again.cache_hit).toBe(true);
    expect(p2.items).toEqual(samplePage2);
    expect(p2.cache_hit).toBe(false);
    expect(p2.page).toBe(2);
  });

  it('cache photo vs video terpisah', async () => {
    const pixabay: ShareBackgroundProviderPort = {
      providerId: 'pixabay',
      providerName: 'pixabay',
      supportedMedia: ['photo', 'video'],
      search: vi
        .fn()
        .mockResolvedValueOnce(sample)
        .mockResolvedValueOnce([
          photoItem('v1', {
            provider: 'pixabay',
            kind: 'video',
            mime_type: 'video/mp4',
            duration_seconds: 8,
          }),
        ]),
    };
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['pixabay', pixabay]]),
      86_400,
    );
    const photo = await useCase.execute('makan', 1, 'relevant', 'pixabay', 3, 'photo');
    const video = await useCase.execute('makan', 1, 'relevant', 'pixabay', 3, 'video');
    expect(pixabay.search).toHaveBeenCalledTimes(2);
    expect(photo.media).toBe('photo');
    expect(video.media).toBe('video');
    expect(video.cache_hit).toBe(false);
  });

  it('unsplash + video → ValidationError', async () => {
    const useCase = new ListShareBackgroundsUseCase(new Map(), 0);
    await expect(
      useCase.execute('makan', 1, 'relevant', 'unsplash', 3, 'video'),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('pixabay tanpa key → degraded', async () => {
    const useCase = new ListShareBackgroundsUseCase(new Map(), 0);
    const result = await useCase.execute('makan', 1, 'relevant', 'pixabay', 3, 'video');
    expect(result.degraded).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.media).toBe('video');
  });

  it('pixabay + video diizinkan', async () => {
    const pixabay: ShareBackgroundProviderPort = {
      providerId: 'pixabay',
      providerName: 'pixabay',
      supportedMedia: ['photo', 'video'],
      search: vi.fn().mockResolvedValue([
        photoItem('v1', {
          provider: 'pixabay',
          kind: 'video',
          mime_type: 'video/mp4',
          duration_seconds: 8,
        }),
      ]),
    };
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['pixabay', pixabay]]),
      0,
    );
    const result = await useCase.execute('makan', 1, 'relevant', 'pixabay', 3, 'video');
    expect(result.provider).toBe('pixabay');
    expect(result.media).toBe('video');
    expect(result.degraded).toBe(false);
  });

  it('openverse + video → ValidationError', async () => {
    const useCase = new ListShareBackgroundsUseCase(new Map(), 0);
    await expect(
      useCase.execute('makan', 1, 'relevant', 'openverse', 3, 'video'),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('query diblok → ValidationError', async () => {
    const useCase = new ListShareBackgroundsUseCase(new Map(), 0);
    await expect(
      useCase.execute('nude nature', 1, 'relevant', 'pixabay'),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('sort=popular tanpa q diizinkan', async () => {
    const provider = makeProvider(sample);
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      0,
    );
    const result = await useCase.execute('', 1, 'popular', 'unsplash', 12);
    expect(provider.search).toHaveBeenCalledWith(
      'nature',
      12,
      1,
      'popular',
      defaultOpts,
    );
    expect(result.items).toEqual(sample);
    expect(result.query).toBe('popular');
  });

  it('sort=popular memanggil provider dengan popular + cache terpisah', async () => {
    const provider: ShareBackgroundProviderPort = {
      providerId: 'unsplash',
      providerName: 'unsplash',
      supportedMedia: ['photo'],
      search: vi.fn().mockResolvedValue(sample),
    };
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      86_400,
    );

    await useCase.execute('makan', 1, 'popular', 'unsplash');
    await useCase.execute('lain', 1, 'popular', 'unsplash');
    await useCase.execute('makan', 1, 'relevant', 'unsplash');

    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('provider throw → items kosong + degraded', async () => {
    const provider: ShareBackgroundProviderPort = {
      providerId: 'unsplash',
      providerName: 'unsplash',
      supportedMedia: ['photo'],
      search: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      0,
    );
    const result = await useCase.execute('makan', 1, 'relevant', 'unsplash');
    expect(result.items).toEqual([]);
    expect(result.degraded).toBe(true);
  });

  it('query kosong + relevant → ValidationError', async () => {
    const useCase = new ListShareBackgroundsUseCase(new Map(), 0);
    await expect(useCase.execute('   ')).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
    });
  });
});
