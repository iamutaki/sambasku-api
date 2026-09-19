import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { ToggleBookmarkUseCase } from '../../application/use-cases/toggle-bookmark.use-case';
import type { GetMyBookmarksUseCase } from '../../application/use-cases/get-my-bookmarks.use-case';
import type { MyBookmarksQuery, ToggleBookmarkBody } from './validators/bookmark.validator';

// Semua role boleh bookmark (16-api-bookmark.md) - tidak ada gate role di
// controller; 401 sudah ditangani middleware authenticate.
export class BookmarkController {
  constructor(
    private readonly deps: {
      toggle: ToggleBookmarkUseCase;
      my: GetMyBookmarksUseCase;
    },
  ) {}

  /** POST /api/v1/bookmarks - toggle bookmark kata */
  async toggle(c: Context, body: ToggleBookmarkBody) {
    const user = this.requireUser(c);
    const result = await this.deps.toggle.execute({ userId: user.user_id, wordId: body.word_id });

    logger.info(
      { request_id: this.requestId(c), word_id: body.word_id, is_bookmarked: result.isBookmarked },
      'bookmark toggled',
    );

    return c.json({
      success: true as const,
      data: {
        word_id: body.word_id,
        is_bookmarked: result.isBookmarked,
        bookmarked_at: result.bookmarkedAt?.toISOString() ?? null,
      },
    });
  }

  /** GET /api/v1/bookmarks/my?limit=&cursor=&word_ids= - bookmark user login */
  async my(c: Context, query: MyBookmarksQuery) {
    const user = this.requireUser(c);
    const result = await this.deps.my.execute(user.user_id, {
      limit: query.limit,
      cursor: query.cursor,
      wordIds: query.word_ids,
    });

    return c.json({
      success: true as const,
      data: result.items.map((i) => ({
        word_id: i.wordId,
        bookmarked_at: i.bookmarkedAt.toISOString(),
        word: {
          id: i.word.id,
          lemma: i.word.lemma,
          word_type: i.word.wordType,
          is_verified: i.word.isVerified,
        },
      })),
      // Mode cek status batch (word_ids) tidak berpaginasi - tanpa meta
      ...(query.word_ids === undefined
        ? { meta: { limit: query.limit, next_cursor: result.nextCursor, has_more: result.hasMore } }
        : {}),
    });
  }

  private requireUser(c: Context): AuthUser {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }

  private requestId(c: Context): string | undefined {
    return (c as Context<{ Variables: AppVariables }>).get('requestId');
  }
}
