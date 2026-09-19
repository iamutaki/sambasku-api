import { describe, it, expect, vi } from 'vitest';
import { GetMyBookmarksUseCase } from '../../application/use-cases/get-my-bookmarks.use-case';
import type { BookmarkListResult, BookmarkRepository } from '../../domain/repositories/bookmark.repository';

const EMPTY_RESULT: BookmarkListResult = { items: [], nextCursor: null, hasMore: false };

function makeDeps() {
  const bookmarkRepo = {
    listByUser: vi.fn().mockResolvedValue(EMPTY_RESULT),
  } as unknown as BookmarkRepository;
  return { bookmarkRepo, useCase: new GetMyBookmarksUseCase(bookmarkRepo) };
}

const USER = '01JDUSERKONTRIB0000000000A';

describe('GetMyBookmarksUseCase', () => {
  it('meneruskan userId + options (limit/cursor/wordIds) apa adanya ke repository', async () => {
    const { useCase, bookmarkRepo } = makeDeps();
    const result = await useCase.execute(USER, { limit: 20, cursor: '01JDBMARKCURS00000000000A', wordIds: undefined });

    expect(bookmarkRepo.listByUser).toHaveBeenCalledWith(USER, {
      limit: 20,
      cursor: '01JDBMARKCURS00000000000A',
      wordIds: undefined,
    });
    expect(result).toBe(EMPTY_RESULT);
  });
});
