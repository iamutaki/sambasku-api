import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  comments,
  examples,
  meanings,
  pronunciations,
  users,
  votes,
  wordImages,
  words,
} from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import { ilikeCompat } from '@/shared/database/drizzle/ilike-compat';
import { NotFoundError } from '@/shared/errors/app-error';
import type {
  AdminVoteCursor,
  AdminVoteListFilter,
  AdminVoteListResult,
  AdminVoteListItem,
  AdminTopVoteTarget,
  ToggleVoteResult,
  VoteCounts,
  VoteRepository,
  VoteTarget,
  VoteTargetType,
} from '../domain/repositories/vote.repository';
import { encodeAdminCursor } from '../domain/repositories/vote.repository';

export const voteTargetKey = (t: VoteTarget): string => `${t.entityType}:${t.entityId}`;

const PREVIEW_MAX = 120;

function clipPreview(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= PREVIEW_MAX) return t;
  return `${t.slice(0, PREVIEW_MAX - 1)}…`;
}

export class VoteRepositoryImpl implements VoteRepository {
  constructor(private readonly db: AppDatabase) {}

  async targetExists(target: VoteTarget): Promise<boolean> {
    // Lima blok serupa, bukan satu helper generik: akses kolom per tabel
    // secara structural lebih mudah dibaca (dan type-safe) daripada
    // berkelahi dengan generics Drizzle lintas tabel.
    switch (target.entityType) {
      case 'word': {
        const rows = await this.db
          .select({ id: words.id })
          .from(words)
          .where(and(eq(words.id, target.entityId), isNull(words.deletedAt)))
          .limit(1);
        return rows.length > 0;
      }
      case 'meaning': {
        const rows = await this.db
          .select({ id: meanings.id })
          .from(meanings)
          .where(and(eq(meanings.id, target.entityId), isNull(meanings.deletedAt)))
          .limit(1);
        return rows.length > 0;
      }
      case 'example': {
        const rows = await this.db
          .select({ id: examples.id })
          .from(examples)
          .where(and(eq(examples.id, target.entityId), isNull(examples.deletedAt)))
          .limit(1);
        return rows.length > 0;
      }
      case 'pronunciation': {
        const rows = await this.db
          .select({ id: pronunciations.id })
          .from(pronunciations)
          .where(and(eq(pronunciations.id, target.entityId), isNull(pronunciations.deletedAt)))
          .limit(1);
        return rows.length > 0;
      }
      case 'word_image': {
        const rows = await this.db
          .select({ id: wordImages.id })
          .from(wordImages)
          .where(and(eq(wordImages.id, target.entityId), isNull(wordImages.deletedAt)))
          .limit(1);
        return rows.length > 0;
      }
      case 'comment': {
        const rows = await this.db
          .select({ id: comments.id })
          .from(comments)
          .where(and(eq(comments.id, target.entityId), isNull(comments.deletedAt)))
          .limit(1);
        return rows.length > 0;
      }
    }
  }

  async toggle(userId: string, target: VoteTarget, value: 1 | -1): Promise<ToggleVoteResult> {
    return this.db.transaction(async (tx) => {
      // Vote searah kedua kali = batal. Hanya hapus baris dengan arah yang
      // SAMA - kalau tidak kena berarti baru / beda arah → upsert di bawah.
      const removed = await tx
        .delete(votes)
        .where(
          and(
            eq(votes.userId, userId),
            eq(votes.entityType, target.entityType),
            eq(votes.entityId, target.entityId),
            eq(votes.value, value),
          ),
        )
        .returning({ id: votes.id });

      let myVote: 1 | -1 | null = null;
      if (removed.length === 0) {
        await tx
          .insert(votes)
          .values({ userId, entityType: target.entityType, entityId: target.entityId, value })
          .onConflictDoUpdate({
            target: [votes.userId, votes.entityType, votes.entityId],
            set: { value, updatedAt: new Date() },
          });
        myVote = value;
      }

      const [row] = await tx
        .select({
          upvotes: sql<number>`sum(case when ${votes.value} = 1 then 1 else 0 end)`.mapWith(Number),
          downvotes: sql<number>`sum(case when ${votes.value} = -1 then 1 else 0 end)`.mapWith(Number),
        })
        .from(votes)
        .where(and(eq(votes.entityType, target.entityType), eq(votes.entityId, target.entityId)));

      return { myVote, upvotes: row?.upvotes ?? 0, downvotes: row?.downvotes ?? 0 };
    });
  }

  async countMany(targets: VoteTarget[]): Promise<Map<string, VoteCounts>> {
    const result = new Map<string, VoteCounts>();
    if (targets.length === 0) return result;

    const rows = await this.db
      .select({
        entityType: votes.entityType,
        entityId: votes.entityId,
        upvotes: sql<number>`sum(case when ${votes.value} = 1 then 1 else 0 end)`.mapWith(Number),
        downvotes: sql<number>`sum(case when ${votes.value} = -1 then 1 else 0 end)`.mapWith(Number),
      })
      .from(votes)
      .where(
        or(
          ...targets.map((t) =>
            and(eq(votes.entityType, t.entityType), eq(votes.entityId, t.entityId)),
          ),
        ),
      )
      .groupBy(votes.entityType, votes.entityId);

    for (const row of rows) {
      result.set(`${row.entityType}:${row.entityId}`, {
        upvotes: row.upvotes,
        downvotes: row.downvotes,
      });
    }
    return result;
  }

  async findUserVotes(userId: string, targets: VoteTarget[]): Promise<Map<string, 1 | -1>> {
    const result = new Map<string, 1 | -1>();
    if (targets.length === 0) return result;

    const rows = await this.db
      .select({ entityType: votes.entityType, entityId: votes.entityId, value: votes.value })
      .from(votes)
      .where(
        and(
          eq(votes.userId, userId),
          or(
            ...targets.map((t) =>
              and(eq(votes.entityType, t.entityType), eq(votes.entityId, t.entityId)),
            ),
          ),
        ),
      );

    for (const row of rows) {
      result.set(`${row.entityType}:${row.entityId}`, row.value === 1 ? 1 : -1);
    }
    return result;
  }

  async listAdmin(
    filter: AdminVoteListFilter,
    limit: number,
    cursor: AdminVoteCursor | null,
  ): Promise<AdminVoteListResult> {
    const rows = await this.db
      .select({
        id: votes.id,
        userId: votes.userId,
        voterUsername: users.username,
        voterEmail: users.email,
        entityType: votes.entityType,
        entityId: votes.entityId,
        value: votes.value,
        createdAt: votes.createdAt,
        updatedAt: votes.updatedAt,
      })
      .from(votes)
      .innerJoin(users, eq(users.id, votes.userId))
      .where(
        and(
          isNull(users.deletedAt),
          filter.entityType ? eq(votes.entityType, filter.entityType) : undefined,
          filter.value !== undefined ? eq(votes.value, filter.value) : undefined,
          filter.targetId ? eq(votes.entityId, filter.targetId) : undefined,
          filter.q
            ? or(
                ilikeCompat(users.username, `%${filter.q}%`),
                ilikeCompat(users.email, `%${filter.q}%`),
              )
            : undefined,
          cursor
            ? lt(sql`(${votes.createdAt}, ${votes.id})`, sql`(${cursor.createdAt}, ${cursor.id})`)
            : undefined,
        ),
      )
      .orderBy(desc(votes.createdAt), desc(votes.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor: string | null = last && hasMore ? encodeAdminCursor({ createdAt: last.createdAt, id: last.id }) : null;

    const items: AdminVoteListItem[] = page.map((row) => ({
      id: row.id,
      userId: row.userId,
      voterUsername: row.voterUsername,
      voterEmail: row.voterEmail,
      entityType: row.entityType as VoteTargetType,
      entityId: row.entityId,
      value: row.value === 1 ? 1 : -1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      targetPreview: null,
    }));

    const previewMap = await this.resolveTargetPreviews(
      items.map((i) => ({ entityType: i.entityType, entityId: i.entityId })),
    );
    for (const item of items) {
      item.targetPreview = previewMap.get(voteTargetKey(item)) ?? null;
    }

    return {
      items,
      meta: { limit, nextCursor, hasMore },
    };
  }

  async deleteById(id: string): Promise<void> {
    const result = await this.db.delete(votes).where(eq(votes.id, id));
    const affected = Number(result.rowsAffected ?? 0);
    if (affected === 0) {
      throw new NotFoundError('VOTE_NOT_FOUND', 'Vote tidak ditemukan');
    }
  }

  async resetTarget(target: VoteTarget): Promise<number> {
    const result = await this.db
      .delete(votes)
      .where(and(eq(votes.entityType, target.entityType), eq(votes.entityId, target.entityId)));
    return Number(result.rowsAffected ?? 0);
  }

  async getTopTargets(entityType: VoteTargetType, limit: number): Promise<AdminTopVoteTarget[]> {
    // ponytail: order by expression, not alias - drizzle select keys aren't SQL AS aliases
    const netExpr = sql<number>`coalesce(sum(${votes.value}), 0)`.mapWith(Number);
    const rows = await this.db
      .select({
        entityType: votes.entityType,
        entityId: votes.entityId,
        upvotes: sql<number>`sum(case when ${votes.value} = 1 then 1 else 0 end)`.mapWith(Number),
        downvotes: sql<number>`sum(case when ${votes.value} = -1 then 1 else 0 end)`.mapWith(Number),
        net: netExpr,
      })
      .from(votes)
      .where(eq(votes.entityType, entityType))
      .groupBy(votes.entityType, votes.entityId)
      .orderBy(desc(netExpr))
      .limit(limit);

    const previewMap = await this.resolveTargetPreviews(
      rows.map((r) => ({
        entityType: r.entityType as VoteTargetType,
        entityId: r.entityId,
      })),
    );

    return rows.map((r) => ({
      entityType: r.entityType as VoteTargetType,
      entityId: r.entityId,
      upvotes: r.upvotes,
      downvotes: r.downvotes,
      net: r.net,
      targetPreview:
        previewMap.get(voteTargetKey({ entityType: r.entityType as VoteTargetType, entityId: r.entityId })) ??
        null,
    }));
  }

  /**
   * Batch label target untuk panel admin (hindari N+1). Komentar → body;
   * word → lemma; meaning → definition; example → source_sentence;
   * pronunciation → value IPA; word_image → alt_text / url singkat.
   */
  private async resolveTargetPreviews(
    targets: { entityType: VoteTargetType; entityId: string }[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (targets.length === 0) return out;

    const idsByType = new Map<VoteTargetType, string[]>();
    for (const t of targets) {
      const list = idsByType.get(t.entityType) ?? [];
      list.push(t.entityId);
      idsByType.set(t.entityType, list);
    }

    const jobs: Promise<void>[] = [];

    const commentIds = [...new Set(idsByType.get('comment') ?? [])];
    if (commentIds.length > 0) {
      jobs.push(
        this.db
          .select({ id: comments.id, body: comments.body })
          .from(comments)
          .where(inArray(comments.id, commentIds))
          .then((rows) => {
            for (const r of rows) out.set(voteTargetKey({ entityType: 'comment', entityId: r.id }), clipPreview(r.body));
          }),
      );
    }

    const wordIds = [...new Set(idsByType.get('word') ?? [])];
    if (wordIds.length > 0) {
      jobs.push(
        this.db
          .select({ id: words.id, lemma: words.lemma })
          .from(words)
          .where(inArray(words.id, wordIds))
          .then((rows) => {
            for (const r of rows) out.set(voteTargetKey({ entityType: 'word', entityId: r.id }), clipPreview(r.lemma));
          }),
      );
    }

    const meaningIds = [...new Set(idsByType.get('meaning') ?? [])];
    if (meaningIds.length > 0) {
      jobs.push(
        this.db
          .select({ id: meanings.id, definition: meanings.definition })
          .from(meanings)
          .where(inArray(meanings.id, meaningIds))
          .then((rows) => {
            for (const r of rows)
              out.set(voteTargetKey({ entityType: 'meaning', entityId: r.id }), clipPreview(r.definition));
          }),
      );
    }

    const exampleIds = [...new Set(idsByType.get('example') ?? [])];
    if (exampleIds.length > 0) {
      jobs.push(
        this.db
          .select({ id: examples.id, sourceSentence: examples.sourceSentence })
          .from(examples)
          .where(inArray(examples.id, exampleIds))
          .then((rows) => {
            for (const r of rows)
              out.set(
                voteTargetKey({ entityType: 'example', entityId: r.id }),
                clipPreview(r.sourceSentence),
              );
          }),
      );
    }

    const pronunciationIds = [...new Set(idsByType.get('pronunciation') ?? [])];
    if (pronunciationIds.length > 0) {
      jobs.push(
        this.db
          .select({ id: pronunciations.id, value: pronunciations.value })
          .from(pronunciations)
          .where(inArray(pronunciations.id, pronunciationIds))
          .then((rows) => {
            for (const r of rows)
              out.set(voteTargetKey({ entityType: 'pronunciation', entityId: r.id }), clipPreview(r.value));
          }),
      );
    }

    const imageIds = [...new Set(idsByType.get('word_image') ?? [])];
    if (imageIds.length > 0) {
      jobs.push(
        this.db
          .select({ id: wordImages.id, altText: wordImages.altText, url: wordImages.url })
          .from(wordImages)
          .where(inArray(wordImages.id, imageIds))
          .then((rows) => {
            for (const r of rows) {
              const label = r.altText?.trim() || r.url;
              out.set(voteTargetKey({ entityType: 'word_image', entityId: r.id }), clipPreview(label));
            }
          }),
      );
    }

    await Promise.all(jobs);
    return out;
  }
}
