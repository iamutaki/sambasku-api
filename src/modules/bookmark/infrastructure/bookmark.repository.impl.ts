import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import { bookmarks, words } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import { MAX_BOOKMARK_WORD_IDS } from '../domain/repositories/bookmark.repository';
import type {
  BookmarkItem,
  BookmarkListOptions,
  BookmarkListResult,
  BookmarkRepository,
  BookmarkWordSummary,
  ToggleBookmarkResult,
} from '../domain/repositories/bookmark.repository';

export class BookmarkRepositoryImpl implements BookmarkRepository {
  constructor(private readonly db: AppDatabase) {}

  async wordExists(wordId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: words.id })
      .from(words)
      .where(and(eq(words.id, wordId), isNull(words.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  async toggle(userId: string, wordId: string): Promise<ToggleBookmarkResult> {
    return this.db.transaction(async (tx) => {
      // Bookmark ada = lepas (hard delete). Kalau tidak kena berarti belum
      // ada → pasang di bawah.
      const removed = await tx
        .delete(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.wordId, wordId)))
        .returning({ id: bookmarks.id });

      if (removed.length > 0) return { isBookmarked: false, bookmarkedAt: null };

      const inserted = await tx
        .insert(bookmarks)
        .values({ userId, wordId })
        .onConflictDoNothing({ target: [bookmarks.userId, bookmarks.wordId] })
        .returning({ createdAt: bookmarks.createdAt });

      if (inserted.length > 0) return { isBookmarked: true, bookmarkedAt: inserted[0].createdAt };

      // Kalah race dengan unik (user_id, word_id) - baris sudah ada, baca saja.
      const [existing] = await tx
        .select({ createdAt: bookmarks.createdAt })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.wordId, wordId)));
      return { isBookmarked: true, bookmarkedAt: existing?.createdAt ?? null };
    });
  }

  async listByUser(userId: string, opts: BookmarkListOptions): Promise<BookmarkListResult> {
    const batch = opts.wordIds !== undefined;

    const rows = await this.db
      .select({
        id: bookmarks.id,
        wordId: bookmarks.wordId,
        bookmarkedAt: bookmarks.createdAt,
        lemma: words.lemma,
        wordType: words.wordType,
        isVerified: words.isVerified,
      })
      .from(bookmarks)
      .innerJoin(words, eq(words.id, bookmarks.wordId))
      .where(
        and(
          eq(bookmarks.userId, userId),
          isNull(words.deletedAt),
          opts.wordIds ? inArray(bookmarks.wordId, opts.wordIds) : undefined,
          // Cursor hanya di mode pagination (batch tanpa paginasi)
          !batch && opts.cursor ? lt(bookmarks.id, opts.cursor) : undefined,
        ),
      )
      .orderBy(desc(bookmarks.id))
      .limit(batch ? MAX_BOOKMARK_WORD_IDS : opts.limit + 1);

    const hasMore = !batch && rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    const last = page[page.length - 1];

    const items: BookmarkItem[] = page.map((row) => ({
      id: row.id,
      wordId: row.wordId,
      bookmarkedAt: row.bookmarkedAt,
      word: {
        id: row.wordId,
        lemma: row.lemma,
        wordType: row.wordType,
        isVerified: row.isVerified,
      } satisfies BookmarkWordSummary,
    }));

    return {
      items,
      nextCursor: hasMore && last ? last.id : null,
      hasMore,
    };
  }
}
