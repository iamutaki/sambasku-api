import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { commentBlocklistWords } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { CommentBlocklistWord, CursorPage } from '../domain/entities/comment-blocklist-word.entity';
import type { CommentBlocklistRepository } from '../domain/repositories/comment-blocklist.repository';

const WORD_CHUNK = 200;

/** LIKE contains; `%` dan `_` dari input user jadi literal. */
function wordContains(q: string) {
  const escaped = q.trim().toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const pattern = `%${escaped}%`;
  return sql`lower(${commentBlocklistWords.word}) like ${pattern} escape '\\'`;
}

export class CommentBlocklistRepositoryImpl implements CommentBlocklistRepository {
  constructor(private readonly db: AppDatabase) {}

  async listActive(params: {
    limit: number;
    cursor?: string;
    q?: string;
  }): Promise<CursorPage<CommentBlocklistWord>> {
    const q = params.q?.trim();
    const where = and(
      isNull(commentBlocklistWords.deletedAt),
      q ? wordContains(q) : undefined,
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

  async findActiveWordSet(words: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    if (words.length === 0) return found;

    for (let i = 0; i < words.length; i += WORD_CHUNK) {
      const chunk = words.slice(i, i + WORD_CHUNK);
      const rows = await this.db
        .select({ word: commentBlocklistWords.word })
        .from(commentBlocklistWords)
        .where(and(inArray(commentBlocklistWords.word, chunk), isNull(commentBlocklistWords.deletedAt)));
      for (const row of rows) found.add(row.word);
    }
    return found;
  }

  async createMany(
    items: { word: string; createdBy: string }[],
  ): Promise<{ count: number; firstId: string | null }> {
    if (items.length === 0) return { count: 0, firstId: null };

    return this.db.transaction(async (tx) => {
      let count = 0;
      let firstId: string | null = null;
      for (let i = 0; i < items.length; i += WORD_CHUNK) {
        const chunk = items.slice(i, i + WORD_CHUNK);
        const rows = await tx
          .insert(commentBlocklistWords)
          .values(chunk.map((item) => ({ word: item.word, createdBy: item.createdBy })))
          .returning({ id: commentBlocklistWords.id });
        count += rows.length;
        if (!firstId && rows[0]) firstId = rows[0].id;
      }
      return { count, firstId };
    });
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
