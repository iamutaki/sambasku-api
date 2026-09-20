import { describe, it, expect, vi } from 'vitest';
import { ListWordsUseCase } from '../../application/use-cases/list-words.use-case';
import {
  encodeListCursor,
  type WordRepository,
} from '../../domain/repositories/word.repository';

describe('ListWordsUseCase', () => {
  it('meneruskan q ter-trim + cursor ter-decode ke repo.listAtoZ, meta terisi', async () => {
    const listAtoZ = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: encodeListCursor({ lemma: 'makatn', id: 'A'.repeat(26) }),
      hasMore: true,
    });
    const uc = new ListWordsUseCase({ listAtoZ } as unknown as WordRepository);

    const result = await uc.execute({
      q: '  mak  ',
      limit: 20,
      cursor: encodeListCursor({ lemma: 'kete', id: 'B'.repeat(26) }),
    });

    expect(listAtoZ).toHaveBeenCalledWith({
      q: 'mak',
      limit: 20,
      wordType: undefined,
      cursor: { lemma: 'kete', id: 'B'.repeat(26) },
    });
    expect(result.meta).toEqual({
      limit: 20,
      next_cursor: result.nextCursor,
      has_more: true,
    });
  });

  it('cursor invalid → 400 VALIDATION_ERROR (details cursor), repo TIDAK dipanggil', async () => {
    const listAtoZ = vi.fn();
    const uc = new ListWordsUseCase({ listAtoZ } as unknown as WordRepository);

    await expect(uc.execute({ q: '', limit: 20, cursor: 'bukan-base64-valid!!' })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      details: [{ field: 'cursor' }],
    });
    expect(listAtoZ).not.toHaveBeenCalled();
  });

  it('tanpa cursor → listAtoZ dipanggil tanpa cursor', async () => {
    const listAtoZ = vi.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    const uc = new ListWordsUseCase({ listAtoZ } as unknown as WordRepository);
    await uc.execute({ q: '', limit: 10, wordType: 'peribahasa' });
    expect(listAtoZ).toHaveBeenCalledWith({
      q: '',
      limit: 10,
      wordType: 'peribahasa',
      cursor: undefined,
    });
  });
});
