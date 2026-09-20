import { describe, it, expect, vi } from 'vitest';
import { ListShareBackgroundsUseCase } from '../../application/use-cases/list-share-backgrounds.use-case';
import type {
  ShareBackgroundItem,
  ShareBackgroundProviderPort,
} from '../../application/ports/share-background-provider.port';

function makeProvider(
  items: ShareBackgroundItem[],
): ShareBackgroundProviderPort {
  return {
    providerId: 'unsplash',
    providerName: 'unsplash',
    search: vi.fn().mockResolvedValue(items),
  };
}

const sample: ShareBackgroundItem[] = [
  {
    id: '1',
    url: 'https://images.unsplash.com/photo-1',
    photographer: 'Ada',
    username: 'ada',
    attribution_url: 'https://unsplash.com/photos/1',
    unsplash_url: 'https://unsplash.com/photos/1',
    provider: 'unsplash',
  },
];

const samplePage2: ShareBackgroundItem[] = [
  {
    id: '2',
    url: 'https://images.unsplash.com/photo-2',
    photographer: 'Bob',
    username: 'bob',
    attribution_url: 'https://unsplash.com/photos/2',
    unsplash_url: 'https://unsplash.com/photos/2',
    provider: 'unsplash',
  },
];

describe('ListShareBackgroundsUseCase', () => {
  it('tanpa provider → items kosong + degraded', async () => {
    const useCase = new ListShareBackgroundsUseCase(new Map(), 0);
    const result = await useCase.execute('makan makanan');
    expect(result.items).toEqual([]);
    expect(result.degraded).toBe(true);
    expect(result.page).toBe(1);
    expect(result.provider).toBe('unsplash');
    expect(result.cache_hit).toBe(false);
  });

  it('sukses: kembalikan items dari provider', async () => {
    const provider = makeProvider(sample);
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      0,
    );
    const result = await useCase.execute('makan');
    expect(provider.search).toHaveBeenCalledWith('makan', 3, 1, 'relevant');
    expect(result.items).toEqual(sample);
    expect(result.degraded).toBe(false);
    expect(result.provider).toBe('unsplash');
  });

  it('page dihormati dan cache terpisah per page', async () => {
    const provider: ShareBackgroundProviderPort = {
      providerId: 'unsplash',
      providerName: 'unsplash',
      search: vi
        .fn()
        .mockResolvedValueOnce(sample)
        .mockResolvedValueOnce(samplePage2),
    };
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      86_400,
    );

    const p1 = await useCase.execute('makan', 1);
    const p1Again = await useCase.execute('makan', 1);
    const p2 = await useCase.execute('makan', 2);

    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(provider.search).toHaveBeenNthCalledWith(1, 'makan', 3, 1, 'relevant');
    expect(provider.search).toHaveBeenNthCalledWith(2, 'makan', 3, 2, 'relevant');
    expect(p1.items).toEqual(sample);
    expect(p1Again.cache_hit).toBe(true);
    expect(p2.items).toEqual(samplePage2);
    expect(p2.cache_hit).toBe(false);
    expect(p2.page).toBe(2);
  });

  it('sort=popular tanpa q diizinkan', async () => {
    const provider = makeProvider(sample);
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      0,
    );
    const result = await useCase.execute('', 1, 'popular', 'unsplash', 12);
    expect(provider.search).toHaveBeenCalledWith('nature', 12, 1, 'popular');
    expect(result.items).toEqual(sample);
    expect(result.query).toBe('popular');
  });

  it('sort=popular memanggil provider dengan popular + cache terpisah', async () => {
    const provider: ShareBackgroundProviderPort = {
      providerId: 'unsplash',
      providerName: 'unsplash',
      search: vi.fn().mockResolvedValue(sample),
    };
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      86_400,
    );

    await useCase.execute('makan', 1, 'popular');
    await useCase.execute('lain', 1, 'popular');
    await useCase.execute('makan', 1, 'relevant');

    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(provider.search).toHaveBeenNthCalledWith(1, 'makan', 3, 1, 'popular');
    expect(provider.search).toHaveBeenNthCalledWith(2, 'makan', 3, 1, 'relevant');
  });

  it('provider throw → items kosong + degraded', async () => {
    const provider: ShareBackgroundProviderPort = {
      providerId: 'unsplash',
      providerName: 'unsplash',
      search: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const useCase = new ListShareBackgroundsUseCase(
      new Map([['unsplash', provider]]),
      0,
    );
    const result = await useCase.execute('makan');
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
