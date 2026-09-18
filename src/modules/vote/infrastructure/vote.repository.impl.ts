import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  comments,
  examples,
  meanings,
  pronunciations,
  votes,
  wordImages,
  words,
} from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import type {
  ToggleVoteResult,
  VoteCounts,
  VoteRepository,
  VoteTarget,
} from '../domain/repositories/vote.repository';

export const voteTargetKey = (t: VoteTarget): string => `${t.entityType}:${t.entityId}`;

export class VoteRepositoryImpl implements VoteRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

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
          upvotes: sql<number>`count(*) filter (where ${votes.value} = 1)`.mapWith(Number),
          downvotes: sql<number>`count(*) filter (where ${votes.value} = -1)`.mapWith(Number),
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
        upvotes: sql<number>`count(*) filter (where ${votes.value} = 1)`.mapWith(Number),
        downvotes: sql<number>`count(*) filter (where ${votes.value} = -1)`.mapWith(Number),
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
}
