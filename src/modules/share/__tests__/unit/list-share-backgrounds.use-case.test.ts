import { describe, it, expect, vi } from 'vitest';
import { ListShareBackgroundsUseCase } from '../../application/use-cases/list-share-backgrounds.use-case';
import type { ShareBackgroundProviderPort } from '../../application/ports/share-background-provider.port';

function makeProvider(
  items: Awaited<ReturnType<ShareBackgroundProviderPort['search']>>,
): ShareBackgroundProviderPort {
  return {
    providerName: 'unsplash',
    search: vi.fn().mockResolvedValue(items),
  };
}

const sample = [
  {
    url: 'https://images.unsplash.com/photo-1',
    photographer: 'Ada',
    username: 'ada',
    unsplash_url: 'https://unsplash.com/photos/1',
  },
];

describe('ListShareBackgroundsUseCase', () => {
  it('tanpa provider → items kosong (bukan throw)', async () => {
    const useCase = new ListShareBackgroundsUseCase(null, 0);
    const result = await useCase.execute('makan makanan');
    expect(result.items).toEqual([]);
    expect(result.cache_hit).toBe(false);
  });

  it('sukses: kembalikan items dari provider', async () => {
    const provider = makeProvider(sample);
    const useCase = new ListShareBackgroundsUseCase(provider, 0);
    const result = await useCase.execute('makan');
    expect(provider.search).toHaveBeenCalledWith('makan', 3);
    expect(result.items).toEqual(sample);
  });

  it('cache hit setelah panggilan pertama', async () => {
    const provider = makeProvider(sample);
    const useCase = new ListShareBackgroundsUseCase(provider, 86_400);
    await useCase.execute('makan');
    const second = await useCase.execute('makan');
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(second.cache_hit).toBe(true);
  });

  it('provider throw → items kosong (share tidak rusak)', async () => {
    const provider: ShareBackgroundProviderPort = {
      providerName: 'unsplash',
      search: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const useCase = new ListShareBackgroundsUseCase(provider, 0);
    const result = await useCase.execute('makan');
    expect(result.items).toEqual([]);
  });

  it('query kosong → ValidationError', async () => {
    const useCase = new ListShareBackgroundsUseCase(null, 0);
    await expect(useCase.execute('   ')).rejects.toMatchObject({
      errorCode: 'VALIDATION_ERROR',
    });
  });
});
