import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import { publicAccountName } from '@/shared/constants/deleted-account';
import { comments, users, words } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { Comment, CommentStatus, CursorPage } from '../domain/entities/comment.entity';
import type {
  CommentRepository,
  ListAdminCommentsParams,
  ListCommentsParams,
  ListMyCommentsParams,
} from '../domain/repositories/comment.repository';

const PUBLIC_STATUSES: CommentStatus[] = ['published', 'taken_down', 'deleted_by_author'];

export class CommentRepositoryImpl implements CommentRepository {
  constructor(private readonly db: AppDatabase) {}

  private selectBase() {
    return this.db
      .select({
        comment: comments,
        username: users.username,
        authorDeletedAt: users.deletedAt,
        wordLemma: words.lemma,
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.userId))
      .leftJoin(words, eq(words.id, comments.wordId));
  }

  async create(data: {
    wordId: string;
    userId: string;
    body: string;
    bodyOriginal?: string | null;
  }): Promise<Comment> {
    const [row] = await this.db
      .insert(comments)
      .values({
        wordId: data.wordId,
        userId: data.userId,
        body: data.body,
        bodyOriginal: data.bodyOriginal ?? null,
        status: 'published',
      })
      .returning();
    return this.toComment(row, null, null);
  }

  async listByWord(wordId: string, params: ListCommentsParams): Promise<CursorPage<Comment>> {
    const where = and(
      eq(comments.wordId, wordId),
      inArray(comments.status, PUBLIC_STATUSES),
      isNull(comments.deletedAt),
      params.cursor ? lt(comments.id, params.cursor) : undefined,
    );
    return this.page(where, params.limit);
  }

  async findById(id: string): Promise<Comment | null> {
    const [row] = await this.selectBase()
      .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
      .limit(1);
    return row
      ? this.toComment(row.comment, publicAccountName(row.username, row.authorDeletedAt), row.wordLemma)
      : null;
  }

  async softDelete(id: string, actorId: string): Promise<boolean> {
    const updated = await this.db
      .update(comments)
      .set({ deletedAt: new Date(), deletedBy: actorId, updatedAt: new Date() })
      .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
      .returning({ id: comments.id });
    return updated.length > 0;
  }

  async markDeletedByAuthor(id: string, actorId: string): Promise<boolean> {
    const updated = await this.db
      .update(comments)
      .set({
        status: 'deleted_by_author',
        updatedAt: new Date(),
        // track actor in reviewed_* for consistency with moderation trail
        reviewedBy: actorId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(comments.id, id),
          eq(comments.status, 'published'),
          isNull(comments.deletedAt),
        ),
      )
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

  async listByUser(params: ListMyCommentsParams): Promise<CursorPage<Comment>> {
    const where = and(
      eq(comments.userId, params.userId),
      params.status ? eq(comments.status, params.status) : undefined,
      isNull(comments.deletedAt),
      params.cursor ? lt(comments.id, params.cursor) : undefined,
    );
    const rows = await this.db
      .select({
        comment: comments,
        wordLemma: words.lemma,
        wordDeletedAt: words.deletedAt,
      })
      .from(comments)
      .leftJoin(words, eq(words.id, comments.wordId))
      .where(where)
      .orderBy(desc(comments.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const items = page.map((row) =>
      this.toComment(row.comment, null, row.wordDeletedAt ? null : row.wordLemma),
    );
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  }

  async takedown(id: string, reviewerId: string): Promise<boolean> {
    const updated = await this.db
      .update(comments)
      .set({
        status: 'taken_down',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(comments.id, id), eq(comments.status, 'published'), isNull(comments.deletedAt)),
      )
      .returning({ id: comments.id });
    return updated.length > 0;
  }

  async uncensor(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing?.bodyOriginal) return false;

    const updated = await this.db
      .update(comments)
      .set({
        body: existing.bodyOriginal,
        bodyOriginal: null,
        updatedAt: new Date(),
      })
      .where(and(eq(comments.id, id), isNull(comments.deletedAt)))
      .returning({ id: comments.id });
    return updated.length > 0;
  }

  private async page(where: ReturnType<typeof and> | undefined, limit: number): Promise<CursorPage<Comment>> {
    const rows = await this.selectBase()
      .where(where)
      .orderBy(desc(comments.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) =>
      this.toComment(r.comment, publicAccountName(r.username, r.authorDeletedAt), r.wordLemma),
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
      bodyOriginal: row.bodyOriginal ?? null,
      status: row.status as CommentStatus,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
    };
  }
}
