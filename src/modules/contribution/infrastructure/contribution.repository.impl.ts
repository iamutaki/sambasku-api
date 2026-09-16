import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NodePgDatabase, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import {
  contributionReviews,
  contributions,
  examples,
  meanings,
  pronunciations,
  users,
  wordImages,
  words,
} from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  Contribution,
  ContributionEntityType,
  ContributionReview,
  ContributionStatus,
  ReviewOutcome,
} from '../domain/entities/contribution.entity';
import type {
  ChildEntityWithParent,
  ContributionListFilter,
  ContributionRepository,
  ReviewCommand,
} from '../domain/repositories/contribution.repository';

// Tipe transaction Drizzle (pg) — sama dengan word.repository.impl.ts
type Tx = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

function decisionToStatus(decision: ReviewCommand['decision']): ContributionStatus {
  if (decision === 'approve') return 'approved';
  if (decision === 'reject') return 'rejected';
  return 'corrected';
}

function toContribution(row: {
  id: string;
  userId: string;
  username: string | null;
  entityType: string;
  entityId: string;
  action: string;
  status: string;
  description: string | null;
  createdAt: Date;
}): Contribution {
  return {
    id: row.id,
    userId: row.userId,
    contributorUsername: row.username,
    entityType: row.entityType as Contribution['entityType'],
    entityId: row.entityId,
    action: row.action,
    status: row.status as ContributionStatus,
    description: row.description,
    createdAt: row.createdAt,
  };
}

const contributionColumns = {
  id: contributions.id,
  userId: contributions.userId,
  username: users.username,
  entityType: contributions.entityType,
  entityId: contributions.entityId,
  action: contributions.action,
  status: contributions.status,
  description: contributions.description,
  createdAt: contributions.createdAt,
};

export class ContributionRepositoryImpl implements ContributionRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async list(filter: ContributionListFilter): Promise<CursorPage<Contribution>> {
    const rows = await this.db
      .select(contributionColumns)
      .from(contributions)
      .leftJoin(users, eq(users.id, contributions.userId))
      .where(
        and(
          isNull(contributions.deletedAt),
          filter.status ? eq(contributions.status, filter.status) : undefined,
          filter.entityType ? eq(contributions.entityType, filter.entityType) : undefined,
          filter.action ? eq(contributions.action, filter.action) : undefined,
          filter.cursor ? lt(contributions.id, filter.cursor) : undefined,
        ),
      )
      .orderBy(desc(contributions.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const items = (hasMore ? rows.slice(0, filter.limit) : rows).map(toContribution);
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  }

  async findById(id: string): Promise<Contribution | null> {
    const [row] = await this.db
      .select(contributionColumns)
      .from(contributions)
      .leftJoin(users, eq(users.id, contributions.userId))
      .where(and(eq(contributions.id, id), isNull(contributions.deletedAt)))
      .limit(1);
    return row ? toContribution(row) : null;
  }

  async findReview(contributionId: string): Promise<ContributionReview | null> {
    const [row] = await this.db
      .select({
        reviewerId: contributionReviews.reviewerId,
        status: contributionReviews.status,
        comment: contributionReviews.comment,
        createdAt: contributionReviews.createdAt,
      })
      .from(contributionReviews)
      .where(and(eq(contributionReviews.contributionId, contributionId), isNull(contributionReviews.deletedAt)))
      .orderBy(desc(contributionReviews.createdAt))
      .limit(1);
    return row ? { ...row, status: row.status as ContributionStatus } : null;
  }

  async findChildWithParent(
    entityType: 'pronunciation' | 'word_image' | 'example',
    entityId: string,
  ): Promise<ChildEntityWithParent | null> {
    if (entityType === 'pronunciation') {
      const [row] = await this.db
        .select({
          id: pronunciations.id,
          wordId: pronunciations.wordId,
          wordLemma: words.lemma,
          notation: pronunciations.notation,
          value: pronunciations.value,
          dialectId: pronunciations.dialectId,
          audioUrl: pronunciations.audioUrl,
          speakerName: pronunciations.speakerName,
          notes: pronunciations.notes,
          status: pronunciations.status,
          isVerified: pronunciations.isVerified,
          isCorrected: pronunciations.isCorrected,
        })
        .from(pronunciations)
        .innerJoin(words, eq(words.id, pronunciations.wordId))
        .where(and(eq(pronunciations.id, entityId), isNull(pronunciations.deletedAt)))
        .limit(1);
      if (!row) return null;
      const { id, wordId, wordLemma, notation, value, dialectId, audioUrl, speakerName, notes, status, isVerified, isCorrected } = row;
      return {
        id,
        wordId,
        wordLemma,
        data: { notation, value, dialect_id: dialectId, audio_url: audioUrl, speaker_name: speakerName, notes },
        status,
        isVerified,
        isCorrected,
      };
    }

    if (entityType === 'word_image') {
      const [row] = await this.db
        .select({
          id: wordImages.id,
          wordId: wordImages.wordId,
          wordLemma: words.lemma,
          provider: wordImages.provider,
          providerFileId: wordImages.providerFileId,
          url: wordImages.url,
          altText: wordImages.altText,
          isPrimary: wordImages.isPrimary,
          status: wordImages.status,
          isVerified: wordImages.isVerified,
          isCorrected: wordImages.isCorrected,
        })
        .from(wordImages)
        .innerJoin(words, eq(words.id, wordImages.wordId))
        .where(and(eq(wordImages.id, entityId), isNull(wordImages.deletedAt)))
        .limit(1);
      if (!row) return null;
      const { id, wordId, wordLemma, provider, providerFileId, url, altText, isPrimary, status, isVerified, isCorrected } = row;
      return {
        id,
        wordId,
        wordLemma,
        data: { provider, provider_file_id: providerFileId, url, alt_text: altText, is_primary: isPrimary },
        status,
        isVerified,
        isCorrected,
      };
    }

    const [row] = await this.db
      .select({
        id: examples.id,
        meaningId: examples.meaningId,
        wordId: meanings.wordId,
        wordLemma: words.lemma,
        sourceLanguageId: examples.sourceLanguageId,
        sourceSentence: examples.sourceSentence,
        targetLanguageId: examples.targetLanguageId,
        targetSentence: examples.targetSentence,
        sourceType: examples.sourceType,
        notes: examples.notes,
        status: examples.status,
        isVerified: examples.isVerified,
        isCorrected: examples.isCorrected,
      })
      .from(examples)
      .innerJoin(meanings, eq(meanings.id, examples.meaningId))
      .innerJoin(words, eq(words.id, meanings.wordId))
      .where(and(eq(examples.id, entityId), isNull(examples.deletedAt)))
      .limit(1);
    if (!row) return null;
    const {
      id,
      meaningId,
      wordId,
      wordLemma,
      sourceLanguageId,
      sourceSentence,
      targetLanguageId,
      targetSentence,
      sourceType,
      notes,
      status,
      isVerified,
      isCorrected,
    } = row;
    return {
      id,
      wordId,
      wordLemma,
      meaningId,
      data: {
        source_language_id: sourceLanguageId,
        source_sentence: sourceSentence,
        target_language_id: targetLanguageId,
        target_sentence: targetSentence,
        source_type: sourceType,
        notes,
      },
      status,
      isVerified,
      isCorrected,
    };
  }

  async review(cmd: ReviewCommand): Promise<ReviewOutcome> {
    return this.db.transaction(async (tx) => {
      // Kunci baris kontribsi — dua verifikator klik bersamaan: satu
      // sukses, satu dapat 409 (bukan 500). Cek pending DI DALAM transaksi.
      const [contrib] = await tx
        .select()
        .from(contributions)
        .where(and(eq(contributions.id, cmd.contributionId), isNull(contributions.deletedAt)))
        .limit(1)
        .for('update');
      if (!contrib) {
        throw new NotFoundError('CONTRIBUTION_NOT_FOUND', 'Kontribusi dengan id tersebut tidak ditemukan');
      }
      if (contrib.status !== 'pending') {
        throw new ConflictError(
          'CONTRIBUTION_ALREADY_REVIEWED',
          'Kontribusi ini sudah diproses — sudah ada keputusan review',
        );
      }

      const now = new Date();
      const entityType = contrib.entityType as ContributionEntityType;

      switch (entityType) {
        case 'word':
          await this.reviewWord(tx, contrib.entityId, cmd, now);
          break;
        case 'pronunciation':
          await this.reviewPronunciation(tx, contrib.entityId, cmd, now);
          break;
        case 'word_image':
          await this.reviewWordImage(tx, contrib.entityId, cmd);
          break;
        case 'example':
          await this.reviewExample(tx, contrib.entityId, cmd, now);
          break;
      }

      const status = decisionToStatus(cmd.decision);
      await tx.update(contributions).set({ status }).where(eq(contributions.id, contrib.id));
      await tx.insert(contributionReviews).values({
        contributionId: contrib.id,
        reviewerId: cmd.reviewerId,
        status,
        comment: cmd.comment,
      });

      return { contributionId: contrib.id, entityType, entityId: contrib.entityId, status };
    });
  }

  // Kata: keputusan pada kata ikut memutuskan anak-anaknya (anak yang ikut
  // submit kata mengikuti gerbang kata — lihat childStatusOf word repository)
  private async reviewWord(tx: Tx, wordId: string, cmd: ReviewCommand, now: Date): Promise<void> {
    if (cmd.decision === 'correct') {
      // Isi + status/isVerified/isCorrected sudah diterapkan use case lewat
      // WordRepository.updateWithRelations — di sini tinggal jejak verifikator
      await tx
        .update(words)
        .set({ verifiedBy: cmd.reviewerId, verifiedAt: now, updatedBy: cmd.reviewerId, updatedAt: now })
        .where(and(eq(words.id, wordId), isNull(words.deletedAt)));
      return;
    }

    const approved = cmd.decision === 'approve';
    await tx
      .update(words)
      .set(
        approved
          ? { status: 'published', isVerified: true, verifiedBy: cmd.reviewerId, verifiedAt: now, updatedBy: cmd.reviewerId, updatedAt: now }
          : { status: 'rejected', updatedBy: cmd.reviewerId, updatedAt: now },
      )
      .where(and(eq(words.id, wordId), isNull(words.deletedAt)));

    await this.setWordChildrenStatus(tx, wordId, approved ? 'published' : 'rejected', approved, cmd.reviewerId, now);
  }

  private async setWordChildrenStatus(
    tx: Tx,
    wordId: string,
    status: 'published' | 'rejected',
    isVerified: boolean,
    reviewerId: string,
    now: Date,
  ): Promise<void> {
    const meaningRows = await tx.select({ id: meanings.id }).from(meanings).where(eq(meanings.wordId, wordId));
    if (meaningRows.length > 0) {
      await tx
        .update(examples)
        .set({ status, isVerified, updatedBy: reviewerId, updatedAt: now })
        .where(inArray(examples.meaningId, meaningRows.map((m) => m.id)));
    }
    await tx
      .update(pronunciations)
      .set({ status, isVerified, updatedBy: reviewerId, updatedAt: now })
      .where(eq(pronunciations.wordId, wordId));
    // word_images tidak punya kolom updated_by/updated_at (lihat schema)
    await tx.update(wordImages).set({ status, isVerified }).where(eq(wordImages.wordId, wordId));
  }

  // ponytail: patch koreksi anak tidak memvalidasi FK baru (dialect dsb) —
  // input sudah ULID-validated & hanya verifikator yang bisa memanggil;
  // tambahkan pre-check kalau suatu saat dibuka untuk role lain
  private async reviewPronunciation(tx: Tx, entityId: string, cmd: ReviewCommand, now: Date): Promise<void> {
    const where = and(eq(pronunciations.id, entityId), isNull(pronunciations.deletedAt));
    if (cmd.decision === 'approve') {
      await tx.update(pronunciations).set({ status: 'published', isVerified: true, updatedBy: cmd.reviewerId, updatedAt: now }).where(where);
    } else if (cmd.decision === 'reject') {
      await tx.update(pronunciations).set({ status: 'rejected', isVerified: false, updatedBy: cmd.reviewerId, updatedAt: now }).where(where);
    } else {
      const p = cmd.childPatch?.pronunciation;
      if (!p) throw new Error('childPatch.pronunciation hilang pada decision correct');
      await tx
        .update(pronunciations)
        .set({
          notation: p.notation,
          value: p.value,
          dialectId: p.dialectId,
          audioUrl: p.audioUrl,
          speakerName: p.speakerName,
          notes: p.notes,
          status: 'published',
          isVerified: true,
          isCorrected: true,
          updatedBy: cmd.reviewerId,
          updatedAt: now,
        })
        .where(where);
    }
  }

  // word_images tidak punya updated_by/updated_at (lihat schema) — tanpa param now
  private async reviewWordImage(tx: Tx, entityId: string, cmd: ReviewCommand): Promise<void> {
    const where = and(eq(wordImages.id, entityId), isNull(wordImages.deletedAt));
    if (cmd.decision === 'approve') {
      await tx.update(wordImages).set({ status: 'published', isVerified: true }).where(where);
    } else if (cmd.decision === 'reject') {
      await tx.update(wordImages).set({ status: 'rejected', isVerified: false }).where(where);
    } else {
      const p = cmd.childPatch?.wordImage;
      if (!p) throw new Error('childPatch.wordImage hilang pada decision correct');
      await tx
        .update(wordImages)
        .set({
          url: p.url,
          providerFileId: p.providerFileId,
          altText: p.altText,
          isPrimary: p.isPrimary,
          status: 'published',
          isVerified: true,
          isCorrected: true,
        })
        .where(where);
    }
  }

  private async reviewExample(tx: Tx, entityId: string, cmd: ReviewCommand, now: Date): Promise<void> {
    const where = and(eq(examples.id, entityId), isNull(examples.deletedAt));
    if (cmd.decision === 'approve') {
      await tx.update(examples).set({ status: 'published', isVerified: true, updatedBy: cmd.reviewerId, updatedAt: now }).where(where);
    } else if (cmd.decision === 'reject') {
      await tx.update(examples).set({ status: 'rejected', isVerified: false, updatedBy: cmd.reviewerId, updatedAt: now }).where(where);
    } else {
      const p = cmd.childPatch?.example;
      if (!p) throw new Error('childPatch.example hilang pada decision correct');
      await tx
        .update(examples)
        .set({
          sourceSentence: p.sourceSentence,
          targetSentence: p.targetSentence,
          sourceType: p.sourceType,
          notes: p.notes,
          status: 'published',
          isVerified: true,
          isCorrected: true,
          updatedBy: cmd.reviewerId,
          updatedAt: now,
        })
        .where(where);
    }
  }
}
