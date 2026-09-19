import { describe, it, expect, vi } from 'vitest';
import { ToggleBookmarkUseCase } from '../../application/use-cases/toggle-bookmark.use-case';
import type { BookmarkRepository } from '../../domain/repositories/bookmark.repository';

function makeDeps(exists = true) {
  const bookmarkRepo = {
    wordExists: vi.fn().mockResolvedValue(exists),
    toggle: vi.fn().mockResolvedValue({ isBookmarked: true, bookmarkedAt: new Date('2026-09-20T00:00:00Z') }),
    listByUser: vi.fn(),
  } as unknown as BookmarkRepository;
  return { bookmarkRepo, useCase: new ToggleBookmarkUseCase(bookmarkRepo) };
}

const USER = '01JDUSERKONTRIB0000000000A';
const WORD_ID = '01JDWORDMAKATN0000000000A';

describe('ToggleBookmarkUseCase', () => {
  it('kata ada → toggle(userId, wordId) dipanggil, hasil diteruskan', async () => {
    const { useCase, bookmarkRepo } = makeDeps();
    const result = await useCase.execute({ userId: USER, wordId: WORD_ID });

    expect(bookmarkRepo.wordExists).toHaveBeenCalledWith(WORD_ID);
    expect(bookmarkRepo.toggle).toHaveBeenCalledWith(USER, WORD_ID);
    expect(result.isBookmarked).toBe(true);
    expect(result.bookmarkedAt).toEqual(new Date('2026-09-20T00:00:00Z'));
  });

  it('kata tidak ada / sudah soft-deleted → 404 WORD_NOT_FOUND, toggle TIDAK dipanggil', async () => {
    const { useCase, bookmarkRepo } = makeDeps(false);
    await expect(useCase.execute({ userId: USER, wordId: WORD_ID })).rejects.toMatchObject({
      errorCode: 'WORD_NOT_FOUND',
      statusCode: 404,
    });
    expect(bookmarkRepo.toggle).not.toHaveBeenCalled();
  });
});
