import { describe, it, expect, vi } from 'vitest';
import { ListAdminWordsUseCase } from '../../application/use-cases/list-admin-words.use-case';
import type { WordRepository } from '../../domain/repositories/word.repository';

describe('ListAdminWordsUseCase', () => {
  it('meneruskan published ke repo.search tanpa search-miss', async () => {
    const search = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    const uc = new ListAdminWordsUseCase({ search } as unknown as WordRepository);

    await uc.execute({ q: 'mak', limit: 20, published: false });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'mak',
        limit: 20,
        published: false,
        searchIn: 'lemma',
      }),
    );
  });

  it('omit published → semua status', async () => {
    const search = vi.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    const uc = new ListAdminWordsUseCase({ search } as unknown as WordRepository);
    await uc.execute({ q: '', limit: 10 });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ published: undefined }));
  });
});
