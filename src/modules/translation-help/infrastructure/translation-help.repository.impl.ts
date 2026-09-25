import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import { publicAccountName } from '@/shared/constants/deleted-account';
import {
  translationHelpReplies,
  translationHelps,
  users,
  votes,
} from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { TranslationHelpImageRow } from '@/shared/database/drizzle/schema/translation-helps.schema';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  NewTranslationHelp,
  NewTranslationHelpReply,
  TranslationHelp,
  TranslationHelpImage,
  TranslationHelpListFilter,
  TranslationHelpReply,
  TranslationHelpReplyStatus,
  TranslationHelpStatus,
} from '../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../domain/repositories/translation-help.repository';

type HelpRow = typeof translationHelps.$inferSelect;
type ReplyRow = typeof translationHelpReplies.$inferSelect;

/** Cursor sort popular: base64url("upvotes:id"). */
export function encodePopularHelpCursor(upvotes: number, id: string): string {
  return Buffer.from(`${upvotes}:${id}`).toString('base64url');
}

export function decodePopularHelpCursor(raw: string): { upvotes: number; id: string } {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const [upRaw, id] = decoded.split(':');
  const upvotes = Number(upRaw);
  if (!id || !Number.isFinite(upvotes) || upvotes < 0) {
    throw new Error('INVALID_POPULAR_CURSOR');
  }
  return { upvotes, id };
}


function asImages(value: unknown): TranslationHelpImage[] {
  if (!Array.isArray(value)) return [];
  return (value as TranslationHelpImageRow[]).map((item) => ({
    url: item.url,
    providerFileId: item.provider_file_id,
    publicUrl: item.public_url ?? null,
  }));
}

function toImageRows(images: TranslationHelpImage[]): TranslationHelpImageRow[] {
  return images.map((img) => ({
    url: img.url,
    provider_file_id: img.providerFileId,
    public_url: img.publicUrl,
  }));
}

function toHelp(row: HelpRow, username: string | null): TranslationHelp {
  return {
    id: row.id,
    userId: row.userId,
    username,
    body: row.body,
    images: asImages(row.images),
    status: row.status as TranslationHelpStatus,
    rejectionNote: row.rejectionNote,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    pinnedReplyId: row.pinnedReplyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toReply(
  row: ReplyRow,
  username: string | null,
  userRole: string | null,
): TranslationHelpReply {
  return {
    id: row.id,
    helpId: row.helpId,
    userId: row.userId,
    username,
    userRole,
    body: row.body,
    bodyOriginal: row.bodyOriginal,
    status: row.status as TranslationHelpReplyStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class TranslationHelpRepositoryImpl implements TranslationHelpRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: NewTranslationHelp): Promise<TranslationHelp> {
    const [row] = await this.db
      .insert(translationHelps)
      .values({
        userId: input.userId,
        body: input.body,
        images: toImageRows(input.images),
        status: 'pending_review',
      })
      .returning();
    return toHelp(row, null);
  }

  async findById(id: string): Promise<TranslationHelp | null> {
    const [row] = await this.db
      .select({
        help: translationHelps,
        username: users.username,
        authorDeletedAt: users.deletedAt,
      })
      .from(translationHelps)
      .leftJoin(users, eq(users.id, translationHelps.userId))
      .where(eq(translationHelps.id, id))
      .limit(1);
    if (!row) return null;
    return toHelp(row.help, publicAccountName(row.username, row.authorDeletedAt));
  }

  async list(filter: TranslationHelpListFilter): Promise<CursorPage<TranslationHelp>> {
    if (filter.sort === 'popular' && filter.status === 'published' && !filter.userId) {
      return this.listPublishedPopular(filter.limit, filter.cursor);
    }

    const rows = await this.db
      .select({
        help: translationHelps,
        username: users.username,
        authorDeletedAt: users.deletedAt,
      })
      .from(translationHelps)
      .leftJoin(users, eq(users.id, translationHelps.userId))
      .where(
        and(
          filter.status ? eq(translationHelps.status, filter.status) : undefined,
          filter.userId ? eq(translationHelps.userId, filter.userId) : undefined,
          filter.cursor ? lt(translationHelps.id, filter.cursor) : undefined,
        ),
      )
      .orderBy(desc(translationHelps.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const items = page.map((r) =>
      toHelp(r.help, publicAccountName(r.username, r.authorDeletedAt)),
    );
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  }

  private async listPublishedPopular(
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<TranslationHelp>> {
    const upvoteExpr = sql<number>`coalesce(sum(case when ${votes.value} = 1 then 1 else 0 end), 0)`;

    let cursorUp: number | null = null;
    let cursorId: string | null = null;
    if (cursor) {
      try {
        const decoded = decodePopularHelpCursor(cursor);
        cursorUp = decoded.upvotes;
        cursorId = decoded.id;
      } catch {
        cursorUp = null;
        cursorId = null;
      }
    }

    // Agregat tidak boleh di WHERE — cursor popular memakai HAVING.
    const havingClause =
      cursorUp != null && cursorId != null
        ? sql`(${upvoteExpr} < ${cursorUp} or (${upvoteExpr} = ${cursorUp} and ${translationHelps.id} < ${cursorId}))`
        : undefined;

    const rows = await this.db
      .select({
        help: translationHelps,
        username: users.username,
        authorDeletedAt: users.deletedAt,
        upvotes: upvoteExpr,
      })
      .from(translationHelps)
      .leftJoin(users, eq(users.id, translationHelps.userId))
      .leftJoin(
        votes,
        and(eq(votes.entityType, 'translation_help'), eq(votes.entityId, translationHelps.id)),
      )
      .where(eq(translationHelps.status, 'published'))
      .groupBy(translationHelps.id)
      .having(havingClause)
      .orderBy(desc(upvoteExpr), desc(translationHelps.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map((r) =>
      toHelp(r.help, publicAccountName(r.username, r.authorDeletedAt)),
    );

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodePopularHelpCursor(Number(last.upvotes) || 0, last.help.id)
        : null;

    return { items, nextCursor, hasMore };
  }

  async updateStatus(input: {
    id: string;
    fromStatus: TranslationHelpStatus;
    toStatus: TranslationHelpStatus;
    actorId: string;
    rejectionNote?: string | null;
    images?: TranslationHelpImage[];
  }): Promise<TranslationHelp | null> {
    const [row] = await this.db
      .update(translationHelps)
      .set({
        status: input.toStatus,
        rejectionNote: input.rejectionNote !== undefined ? input.rejectionNote : undefined,
        images: input.images ? toImageRows(input.images) : undefined,
        reviewedBy: input.actorId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(translationHelps.id, input.id), eq(translationHelps.status, input.fromStatus)))
      .returning();
    if (!row) return null;
    return this.findById(row.id);
  }

  async setPinnedReply(input: {
    helpId: string;
    replyId: string | null;
    actorId: string;
  }): Promise<TranslationHelp | null> {
    const [row] = await this.db
      .update(translationHelps)
      .set({
        pinnedReplyId: input.replyId,
        updatedAt: new Date(),
      })
      .where(eq(translationHelps.id, input.helpId))
      .returning();
    if (!row) return null;
    void input.actorId;
    return this.findById(row.id);
  }

  async createReply(input: NewTranslationHelpReply): Promise<TranslationHelpReply> {
    const [row] = await this.db
      .insert(translationHelpReplies)
      .values({
        helpId: input.helpId,
        userId: input.userId,
        body: input.body,
        bodyOriginal: input.bodyOriginal ?? null,
        status: 'published',
      })
      .returning();
    return toReply(row, null, null);
  }

  async findReplyById(id: string): Promise<TranslationHelpReply | null> {
    const [row] = await this.db
      .select({
        reply: translationHelpReplies,
        username: users.username,
        userRole: users.role,
        authorDeletedAt: users.deletedAt,
      })
      .from(translationHelpReplies)
      .leftJoin(users, eq(users.id, translationHelpReplies.userId))
      .where(eq(translationHelpReplies.id, id))
      .limit(1);
    if (!row) return null;
    return toReply(
      row.reply,
      publicAccountName(row.username, row.authorDeletedAt),
      row.userRole,
    );
  }

  async listReplies(helpId: string): Promise<TranslationHelpReply[]> {
    const rows = await this.db
      .select({
        reply: translationHelpReplies,
        username: users.username,
        userRole: users.role,
        authorDeletedAt: users.deletedAt,
      })
      .from(translationHelpReplies)
      .leftJoin(users, eq(users.id, translationHelpReplies.userId))
      .where(eq(translationHelpReplies.helpId, helpId))
      .orderBy(asc(translationHelpReplies.createdAt), asc(translationHelpReplies.id));

    return rows.map((r) =>
      toReply(r.reply, publicAccountName(r.username, r.authorDeletedAt), r.userRole),
    );
  }

  async markReplyDeletedByAuthor(id: string, actorId: string): Promise<boolean> {
    const updated = await this.db
      .update(translationHelpReplies)
      .set({
        status: 'deleted_by_author',
        reviewedBy: actorId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(translationHelpReplies.id, id),
          eq(translationHelpReplies.status, 'published'),
          eq(translationHelpReplies.userId, actorId),
        ),
      )
      .returning({ id: translationHelpReplies.id });
    return updated.length > 0;
  }

  async takedownReply(id: string, reviewerId: string): Promise<boolean> {
    const updated = await this.db
      .update(translationHelpReplies)
      .set({
        status: 'taken_down',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(translationHelpReplies.id, id),
          eq(translationHelpReplies.status, 'published'),
        ),
      )
      .returning({ id: translationHelpReplies.id });
    return updated.length > 0;
  }
}
