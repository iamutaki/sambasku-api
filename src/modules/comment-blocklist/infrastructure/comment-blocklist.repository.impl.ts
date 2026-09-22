import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { commentBlocklistWords } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { CommentBlocklistWord, CursorPage } from '../domain/entities/comment-blocklist-word.entity';
import type { CommentBlocklistRepository } from '../domain/repositories/comment-blocklist.repository';

export class CommentBlocklistRepositoryImpl implements CommentBlocklistRepository {
  constructor(private readonly db: AppDatabase) {}

  async listActive(params: { limit: number; cursor?: string }): Promise<CursorPage<CommentBlocklistWord>> {
    const where = and(
      isNull(commentBlocklistWords.deletedAt),
      params.cursor ? lt(commentBlocklistWords.id, params.cursor) : undefined,
    );
    const rows = await this.db
      .select()
      .from(commentBlocklistWords)
      .where(where)
      .orderBy(desc(commentBlocklistWords.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const slice = hasMore ? rows.slice(0, params.limit) : rows;
    const items = slice.map((r) => this.toEntity(r));
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  }

  async listAllActiveWords(): Promise<string[]> {
    const rows = await this.db
      .select({ word: commentBlocklistWords.word })
      .from(commentBlocklistWords)
      .where(isNull(commentBlocklistWords.deletedAt));
    return rows.map((r) => r.word);
  }

  async findActiveByWord(word: string): Promise<CommentBlocklistWord | null> {
    const [row] = await this.db
      .select()
      .from(commentBlocklistWords)
      .where(and(eq(commentBlocklistWords.word, word), isNull(commentBlocklistWords.deletedAt)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async create(data: { word: string; createdBy: string }): Promise<CommentBlocklistWord> {
    const [row] = await this.db
      .insert(commentBlocklistWords)
      .values({ word: data.word, createdBy: data.createdBy })
      .returning();
    return this.toEntity(row);
  }

  async softDelete(id: string, actorId: string): Promise<boolean> {
    const updated = await this.db
      .update(commentBlocklistWords)
      .set({ deletedAt: new Date(), deletedBy: actorId, updatedAt: new Date() })
      .where(and(eq(commentBlocklistWords.id, id), isNull(commentBlocklistWords.deletedAt)))
      .returning({ id: commentBlocklistWords.id });
    return updated.length > 0;
  }

  async findById(id: string): Promise<CommentBlocklistWord | null> {
    const [row] = await this.db
      .select()
      .from(commentBlocklistWords)
      .where(and(eq(commentBlocklistWords.id, id), isNull(commentBlocklistWords.deletedAt)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: typeof commentBlocklistWords.$inferSelect): CommentBlocklistWord {
    return {
      id: row.id,
      word: row.word,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }
}
