import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  comments,
  contributionReviews,
  contributions,
  examples,
  meanings,
  pronunciations,
  users,
  wordAudios,
  wordImages,
  words,
} from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type {
  PublicActivityItem,
  PublicProfileStats,
  PublicUserRow,
} from '../domain/entities/public-profile.entity';
import type { PublicUserRepository } from '../domain/repositories/public-user.repository';

const ENTITY_LABEL: Record<string, string> = {
  word: 'Kata',
  meaning: 'Makna',
  pronunciation: 'Pelafalan',
  word_image: 'Gambar',
  word_audio: 'Audio',
  example: 'Contoh',
};

export class PublicUserRepositoryImpl implements PublicUserRepository {
  constructor(private readonly db: AppDatabase) {}

  async findPublicByUsername(username: string): Promise<PublicUserRow | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        joinedAt: users.createdAt,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(and(eq(users.username, username), isNull(users.deletedAt), eq(users.isActive, true)))
      .limit(1);

    return row
      ? {
          id: row.id,
          username: row.username,
          role: row.role,
          joinedAt: row.joinedAt,
          avatarUrl: row.avatarUrl ?? null,
        }
      : null;
  }

  async countApprovedContributions(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contributions)
      .where(
        and(
          eq(contributions.userId, userId),
          inArray(contributions.status, ['approved', 'corrected']),
          isNull(contributions.deletedAt),
        ),
      );
    return row?.count ?? 0;
  }

  async countVerificationsDone(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contributionReviews)
      .where(
        and(
          eq(contributionReviews.reviewerId, userId),
          ne(contributionReviews.status, 'pending'),
          isNull(contributionReviews.deletedAt),
        ),
      );
    return row?.count ?? 0;
  }

  async countPublishedComments(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(comments)
      .where(
        and(
          eq(comments.userId, userId),
          eq(comments.status, 'published'),
          isNull(comments.deletedAt),
        ),
      );
    return row?.count ?? 0;
  }

  async loadStats(userId: string): Promise<PublicProfileStats> {
    const [contributionsApproved, verificationsDone, commentsPublished] = await Promise.all([
      this.countApprovedContributions(userId),
      this.countVerificationsDone(userId),
      this.countPublishedComments(userId),
    ]);
    return { contributionsApproved, verificationsDone, commentsPublished };
  }

  async listRecentApprovedContributions(
    userId: string,
    limit: number,
  ): Promise<PublicActivityItem[]> {
    const rows = await this.db
      .select({
        id: contributions.id,
        entityType: contributions.entityType,
        entityId: contributions.entityId,
        createdAt: contributions.createdAt,
      })
      .from(contributions)
      .where(
        and(
          eq(contributions.userId, userId),
          inArray(contributions.status, ['approved', 'corrected']),
          isNull(contributions.deletedAt),
        ),
      )
      .orderBy(desc(contributions.createdAt), desc(contributions.id))
      .limit(limit);

    const resolved = await this.resolveContributionParents(rows);

    return rows.map((row) => {
      const parent = resolved.get(`${row.entityType}:${row.entityId}`);
      const label = ENTITY_LABEL[row.entityType] ?? row.entityType;
      const lemma = parent?.lemma ?? null;
      return {
        kind: 'contribution' as const,
        occurredAt: row.createdAt,
        wordId: parent?.wordId ?? null,
        lemma,
        summary: lemma ? `${label}: ${lemma}` : label,
      };
    });
  }

  async listRecentPublishedComments(
    userId: string,
    limit: number,
  ): Promise<PublicActivityItem[]> {
    const rows = await this.db
      .select({
        id: comments.id,
        body: comments.body,
        wordId: comments.wordId,
        createdAt: comments.createdAt,
        lemma: words.lemma,
      })
      .from(comments)
      .innerJoin(words, eq(comments.wordId, words.id))
      .where(
        and(
          eq(comments.userId, userId),
          eq(comments.status, 'published'),
          isNull(comments.deletedAt),
        ),
      )
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(limit);

    return rows.map((row) => {
      const snippet = row.body.length > 120 ? `${row.body.slice(0, 117)}…` : row.body;
      return {
        kind: 'comment' as const,
        occurredAt: row.createdAt,
        wordId: row.wordId,
        lemma: row.lemma,
        summary: snippet,
      };
    });
  }

  async listRecentVerifications(userId: string, limit: number): Promise<PublicActivityItem[]> {
    const rows = await this.db
      .select({
        id: contributionReviews.id,
        createdAt: contributionReviews.createdAt,
        entityType: contributions.entityType,
        entityId: contributions.entityId,
      })
      .from(contributionReviews)
      .innerJoin(contributions, eq(contributionReviews.contributionId, contributions.id))
      .where(
        and(
          eq(contributionReviews.reviewerId, userId),
          ne(contributionReviews.status, 'pending'),
          isNull(contributionReviews.deletedAt),
        ),
      )
      .orderBy(desc(contributionReviews.createdAt), desc(contributionReviews.id))
      .limit(limit);

    const resolved = await this.resolveContributionParents(rows);

    return rows.map((row) => {
      const parent = resolved.get(`${row.entityType}:${row.entityId}`);
      const label = ENTITY_LABEL[row.entityType] ?? row.entityType;
      const lemma = parent?.lemma ?? null;
      return {
        kind: 'verification' as const,
        occurredAt: row.createdAt,
        wordId: parent?.wordId ?? null,
        lemma,
        summary: lemma ? `Memverifikasi ${label}: ${lemma}` : `Memverifikasi ${label}`,
      };
    });
  }

  private async resolveContributionParents(
    items: Array<{ entityType: string; entityId: string }>,
  ): Promise<Map<string, { lemma: string; wordId: string }>> {
    const out = new Map<string, { lemma: string; wordId: string }>();
    if (items.length === 0) return out;

    const idsOf = (type: string) =>
      items.filter((i) => i.entityType === type).map((i) => i.entityId);

    const wordIds = idsOf('word');
    if (wordIds.length > 0) {
      const rows = await this.db
        .select({ id: words.id, lemma: words.lemma })
        .from(words)
        .where(inArray(words.id, wordIds));
      for (const r of rows) out.set(`word:${r.id}`, { lemma: r.lemma, wordId: r.id });
    }

    const pronIds = idsOf('pronunciation');
    if (pronIds.length > 0) {
      const rows = await this.db
        .select({ id: pronunciations.id, lemma: words.lemma, wordId: pronunciations.wordId })
        .from(pronunciations)
        .innerJoin(words, eq(pronunciations.wordId, words.id))
        .where(inArray(pronunciations.id, pronIds));
      for (const r of rows) out.set(`pronunciation:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    const imageIds = idsOf('word_image');
    if (imageIds.length > 0) {
      const rows = await this.db
        .select({ id: wordImages.id, lemma: words.lemma, wordId: wordImages.wordId })
        .from(wordImages)
        .innerJoin(words, eq(wordImages.wordId, words.id))
        .where(inArray(wordImages.id, imageIds));
      for (const r of rows) out.set(`word_image:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    const audioIds = idsOf('word_audio');
    if (audioIds.length > 0) {
      const rows = await this.db
        .select({ id: wordAudios.id, lemma: words.lemma, wordId: wordAudios.wordId })
        .from(wordAudios)
        .innerJoin(words, eq(wordAudios.wordId, words.id))
        .where(inArray(wordAudios.id, audioIds));
      for (const r of rows) out.set(`word_audio:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    const meaningIds = idsOf('meaning');
    if (meaningIds.length > 0) {
      const rows = await this.db
        .select({ id: meanings.id, lemma: words.lemma, wordId: meanings.wordId })
        .from(meanings)
        .innerJoin(words, eq(meanings.wordId, words.id))
        .where(inArray(meanings.id, meaningIds));
      for (const r of rows) out.set(`meaning:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    const exampleIds = idsOf('example');
    if (exampleIds.length > 0) {
      const rows = await this.db
        .select({ id: examples.id, lemma: words.lemma, wordId: meanings.wordId })
        .from(examples)
        .innerJoin(meanings, eq(examples.meaningId, meanings.id))
        .innerJoin(words, eq(meanings.wordId, words.id))
        .where(inArray(examples.id, exampleIds));
      for (const r of rows) out.set(`example:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    return out;
  }
}
