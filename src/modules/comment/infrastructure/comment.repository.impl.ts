import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { comments, users, words } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { Comment, CommentStatus, CursorPage } from '../domain/entities/comment.entity';
import type {
  CommentRepository,
  ListAdminCommentsParams,
  ListCommentsParams,
} from '../domain/repositories/comment.repository';

// Status akhir moderasi per decision (kosakata konten Section 22)
const STATUS_OF = { approve: 'published', reject: 'rejected' } as const;

export class CommentRepositoryImpl implements CommentRepository {
  constructor(private readonly db: AppDatabase) {}

  // Builder SEGAR setiap panggilan - builder Drizzle tidak untuk dipakai
  // ulang antar-query (state .where() bisa terbawa).
  private selectBase() {
    return this.db
      .select({
        comment: comments,
        username: users.username,
        wordLemma: words.lemma,
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.userId))
      .leftJoin(words, eq(words.id, comments.wordId));
  }

  async create(data: { wordId: string; userId: string; body: string }): Promise<Comment> {
    const [row] = await this.db
      .insert(comments)
      .values({ wordId: data.wordId, userId: data.userId, body: data.body })
      .returning();
    return this.toComment(row, null, null);
  }

  async listByWord(wordId: string, params: ListCommentsParams): Promise<CursorPage<Comment>> {
    const where = and(
      eq(comments.wordId, wordId),
      eq(comments.status, 'published'),
      isNull(comments.deletedAt),
      params.cursor ? lt(comments.id, params.cursor) : undefined,
    );
    return this.page(where, params.limit);
  }

  async findById(id: string): Promise<Comment | null> {
    const [row] = await this.selectBase()
      .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
      .limit(1);
    return row ? this.toComment(row.comment, row.username, row.wordLemma) : null;
  }

  async softDelete(id: string, actorId: string): Promise<boolean> {
    const updated = await this.db
      .update(comments)
      .set({ deletedAt: new Date(), deletedBy: actorId })
      .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
      .returning({ id: comments.id });
    return updated.length > 0;
  }

  async listAdmin(params: ListAdminCommentsParams): Promise<CursorPage<Comment>> {
    const where = and(
      params.status ? eq(comments.status, params.status) : undefined,
      params.wordId ? eq(comments.wordId, params.wordId) : undefined,
      isNull(comments.deletedAt),
      params.cursor ? lt(comments.id, params.cursor) : undefined,
    );
    return this.page(where, params.limit);
  }

  async review(id: string, decision: 'approve' | 'reject', reviewerId: string): Promise<boolean> {
    // WHERE status = 'pending_review' = penjaga race double-review:
    // dua moderator klik bersamaan → satu nge-update, satu dapat false → 409.
    const updated = await this.db
      .update(comments)
      .set({ status: STATUS_OF[decision], reviewedBy: reviewerId, reviewedAt: new Date() })
      .where(
        and(
          eq(comments.id, id),
          eq(comments.status, 'pending_review'),
          isNull(comments.deletedAt),
        ),
      )
      .returning({ id: comments.id });
    return updated.length > 0;
  }

  /** Pola limit+1 (word repo): ambil sepotong lebih, hasMore dari sisanya */
  private async page(where: ReturnType<typeof and> | undefined, limit: number): Promise<CursorPage<Comment>> {
    const rows = await this.selectBase()
      .where(where)
      .orderBy(desc(comments.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) =>
      this.toComment(r.comment, r.username, r.wordLemma),
    );
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  }

  private toComment(
    row: typeof comments.$inferSelect,
    username: string | null,
    wordLemma: string | null,
  ): Comment {
    return {
      id: row.id,
      wordId: row.wordId,
      wordLemma,
      userId: row.userId,
      username,
      body: row.body,
      status: row.status as CommentStatus,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
    };
  }
}
