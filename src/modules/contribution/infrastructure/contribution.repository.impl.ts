import { and, desc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import {
  contributionReviews,
  contributions,
  examples,
  meanings,
  meaningTranslations,
  pronunciations,
  searchMisses,
  users,
  wordAudios,
  wordImages,
  words,
} from '@/shared/database/drizzle/schema';
import type { AppDatabase, AppTransaction } from '@/shared/database/drizzle/client';
import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
import { publishOrMergeMeaningsInTx } from '@/modules/word/infrastructure/publish-or-merge-meanings';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  Contribution,
  ContributionEntityType,
  ContributionReview,
  ContributionStatus,
  MySubmission,
  ReviewOutcome,
} from '../domain/entities/contribution.entity';
import type {
  ApplyChildCorrectionCommand,
  ChildEntityWithParent,
  ContributionListFilter,
  ContributionRepository,
  MyContributionListFilter,
  ReviewCommand,
} from '../domain/repositories/contribution.repository';

// Tipe transaction Drizzle (pg) - sama dengan word.repository.impl.ts
type Tx = AppTransaction;

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
  searchMissId: string | null;
  searchMissTerm: string | null;
  searchMissDirection: string | null;
  wordLemma?: string | null;
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
    searchMissId: row.searchMissId,
    searchMissTerm: row.searchMissTerm,
    searchMissDirection:
      row.searchMissDirection === 'lemma' || row.searchMissDirection === 'translation'
        ? row.searchMissDirection
        : null,
    wordLemma: row.wordLemma ?? null,
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
  searchMissId: contributions.searchMissId,
  searchMissTerm: searchMisses.term,
  searchMissDirection: searchMisses.direction,
};

export class ContributionRepositoryImpl implements ContributionRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(filter: ContributionListFilter): Promise<CursorPage<Contribution>> {
    const rows = await this.db
      .select(contributionColumns)
      .from(contributions)
      .leftJoin(users, eq(users.id, contributions.userId))
      .leftJoin(searchMisses, eq(searchMisses.id, contributions.searchMissId))
      .where(
        and(
          isNull(contributions.deletedAt),
          filter.status ? eq(contributions.status, filter.status) : undefined,
          filter.entityType ? eq(contributions.entityType, filter.entityType) : undefined,
          filter.action ? eq(contributions.action, filter.action) : undefined,
          filter.wordId ? this.belongsToWord(filter.wordId) : undefined,
          filter.cursor ? lt(contributions.id, filter.cursor) : undefined,
        ),
      )
      .orderBy(desc(contributions.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const sliced = hasMore ? rows.slice(0, filter.limit) : rows;
    const lemmaByKey = await this.resolveWordLemmas(sliced);
    const items = sliced.map((row) =>
      toContribution({
        ...row,
        wordLemma: lemmaByKey.get(`${row.entityType}:${row.entityId}`) ?? null,
      }),
    );
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  }

  async listMine(filter: MyContributionListFilter): Promise<CursorPage<MySubmission>> {
    const rows = await this.db
      .select(contributionColumns)
      .from(contributions)
      .leftJoin(users, eq(users.id, contributions.userId))
      .leftJoin(searchMisses, eq(searchMisses.id, contributions.searchMissId))
      .where(
        and(
          isNull(contributions.deletedAt),
          eq(contributions.userId, filter.userId),
          filter.status ? eq(contributions.status, filter.status) : undefined,
          filter.cursor ? lt(contributions.id, filter.cursor) : undefined,
        ),
      )
      .orderBy(desc(contributions.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const sliced = hasMore ? rows.slice(0, filter.limit) : rows;
    const parents = await this.resolveWordParents(sliced);
    const comments = await this.resolveReviewComments(sliced.map((r) => r.id));
    const items: MySubmission[] = sliced.map((row) => {
      const key = `${row.entityType}:${row.entityId}`;
      const parent = parents.get(key);
      const wordId =
        row.entityType === 'word' ? row.entityId : (parent?.wordId ?? null);
      return {
        id: row.id,
        kind: 'contribution',
        entityType: row.entityType as ContributionEntityType,
        lemma: parent?.lemma ?? null,
        status: row.status as ContributionStatus,
        createdAt: row.createdAt,
        reviewComment: comments.get(row.id) ?? null,
        wordId,
        action: row.action,
        reason: null,
        reasonCode: null,
        reviewedAt: null,
      };
    });
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }

  async findById(id: string): Promise<Contribution | null> {
    const [row] = await this.db
      .select(contributionColumns)
      .from(contributions)
      .leftJoin(users, eq(users.id, contributions.userId))
      .leftJoin(searchMisses, eq(searchMisses.id, contributions.searchMissId))
      .where(and(eq(contributions.id, id), isNull(contributions.deletedAt)))
      .limit(1);
    if (!row) return null;
    const lemmaByKey = await this.resolveWordLemmas([row]);
    return toContribution({
      ...row,
      wordLemma: lemmaByKey.get(`${row.entityType}:${row.entityId}`) ?? null,
    });
  }

  /**
   * Batch-resolve lemma + word_id parent untuk antrean / Kontribusi Saya.
   * word = lemma + id sendiri; entity anak = parent.
   */
  private async resolveWordParents(
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

    const pronunciationIds = idsOf('pronunciation');
    if (pronunciationIds.length > 0) {
      const rows = await this.db
        .select({ id: pronunciations.id, lemma: words.lemma, wordId: pronunciations.wordId })
        .from(pronunciations)
        .innerJoin(words, eq(words.id, pronunciations.wordId))
        .where(inArray(pronunciations.id, pronunciationIds));
      for (const r of rows) out.set(`pronunciation:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    const imageIds = idsOf('word_image');
    if (imageIds.length > 0) {
      const rows = await this.db
        .select({ id: wordImages.id, lemma: words.lemma, wordId: wordImages.wordId })
        .from(wordImages)
        .innerJoin(words, eq(words.id, wordImages.wordId))
        .where(inArray(wordImages.id, imageIds));
      for (const r of rows) out.set(`word_image:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    const audioIds = idsOf('word_audio');
    if (audioIds.length > 0) {
      const rows = await this.db
        .select({ id: wordAudios.id, lemma: words.lemma, wordId: wordAudios.wordId })
        .from(wordAudios)
        .innerJoin(words, eq(words.id, wordAudios.wordId))
        .where(inArray(wordAudios.id, audioIds));
      for (const r of rows) out.set(`word_audio:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    const meaningIds = idsOf('meaning');
    if (meaningIds.length > 0) {
      const rows = await this.db
        .select({ id: meanings.id, lemma: words.lemma, wordId: meanings.wordId })
        .from(meanings)
        .innerJoin(words, eq(words.id, meanings.wordId))
        .where(inArray(meanings.id, meaningIds));
      for (const r of rows) out.set(`meaning:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    const exampleIds = idsOf('example');
    if (exampleIds.length > 0) {
      const rows = await this.db
        .select({ id: examples.id, lemma: words.lemma, wordId: meanings.wordId })
        .from(examples)
        .innerJoin(meanings, eq(meanings.id, examples.meaningId))
        .innerJoin(words, eq(words.id, meanings.wordId))
        .where(inArray(examples.id, exampleIds));
      for (const r of rows) out.set(`example:${r.id}`, { lemma: r.lemma, wordId: r.wordId });
    }

    return out;
  }

  private async resolveWordLemmas(
    items: Array<{ entityType: string; entityId: string }>,
  ): Promise<Map<string, string>> {
    const parents = await this.resolveWordParents(items);
    const out = new Map<string, string>();
    for (const [key, value] of parents) out.set(key, value.lemma);
    return out;
  }

  private async resolveReviewComments(ids: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (ids.length === 0) return out;
    const rows = await this.db
      .select({
        contributionId: contributionReviews.contributionId,
        comment: contributionReviews.comment,
        createdAt: contributionReviews.createdAt,
      })
      .from(contributionReviews)
      .where(
        and(inArray(contributionReviews.contributionId, ids), isNull(contributionReviews.deletedAt)),
      )
      .orderBy(desc(contributionReviews.createdAt));
    for (const row of rows) {
      if (out.has(row.contributionId)) continue;
      out.set(row.contributionId, row.comment);
    }
    return out;
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
    entityType: 'pronunciation' | 'word_image' | 'word_audio' | 'example' | 'meaning',
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

    if (entityType === 'word_audio') {
      const [row] = await this.db
        .select({
          id: wordAudios.id,
          wordId: wordAudios.wordId,
          wordLemma: words.lemma,
          exampleId: wordAudios.exampleId,
          dialectId: wordAudios.dialectId,
          url: wordAudios.url,
          mimeType: wordAudios.mimeType,
          fileSize: wordAudios.fileSize,
          durationMs: wordAudios.durationMs,
          speakerName: wordAudios.speakerName,
          isPrimary: wordAudios.isPrimary,
          status: wordAudios.status,
          isVerified: wordAudios.isVerified,
          isCorrected: wordAudios.isCorrected,
        })
        .from(wordAudios)
        .innerJoin(words, eq(words.id, wordAudios.wordId))
        .where(and(eq(wordAudios.id, entityId), isNull(wordAudios.deletedAt)))
        .limit(1);
      if (!row) return null;
      const {
        id,
        wordId,
        wordLemma,
        exampleId,
        dialectId,
        url,
        mimeType,
        fileSize,
        durationMs,
        speakerName,
        isPrimary,
        status,
        isVerified,
        isCorrected,
      } = row;
      return {
        id,
        wordId,
        wordLemma,
        data: {
          word_id: wordId,
          example_id: exampleId,
          url,
          speaker_name: speakerName,
          dialect_id: dialectId,
          is_primary: isPrimary,
          duration_ms: durationMs,
          mime_type: mimeType,
          file_size: fileSize,
        },
        status,
        isVerified,
        isCorrected,
      };
    }

    // 17-api-usul-definisi.md: definisi kontribusi pada kata existing -
    // makna + terjemahannya (batch kedua, pola word detail).
    if (entityType === 'meaning') {
      const [row] = await this.db
        .select({
          id: meanings.id,
          wordId: meanings.wordId,
          wordLemma: words.lemma,
          wordClassId: meanings.wordClassId,
          definition: meanings.definition,
          status: meanings.status,
          isVerified: meanings.isVerified,
          isCorrected: meanings.isCorrected,
        })
        .from(meanings)
        .innerJoin(words, eq(words.id, meanings.wordId))
        .where(and(eq(meanings.id, entityId), isNull(meanings.deletedAt)))
        .limit(1);
      if (!row) return null;

      const translationRows = row.wordId
        ? await this.db
            .select({
              languageId: meaningTranslations.languageId,
              translationText: meaningTranslations.translationText,
              translationType: meaningTranslations.translationType,
            })
            .from(meaningTranslations)
            .where(
              and(
                eq(meaningTranslations.meaningId, row.id),
                isNull(meaningTranslations.deletedAt),
              ),
            )
        : [];

      return {
        id: row.id,
        wordId: row.wordId,
        wordLemma: row.wordLemma,
        data: {
          word_class_id: row.wordClassId,
          definition: row.definition,
          translations: translationRows.map((t) => ({
            language_id: t.languageId,
            translation_text: t.translationText,
            translation_type: t.translationType,
          })),
        },
        status: row.status,
        isVerified: row.isVerified,
        isCorrected: row.isCorrected,
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

  /**
   * Kontribusi milik satu kata: baris word itu sendiri, atau anak
   * (pelafalan, gambar, audio, makna, contoh) yang parent-nya kata itu.
   */
  private belongsToWord(wordId: string) {
    return or(
      and(eq(contributions.entityType, 'word'), eq(contributions.entityId, wordId)),
      and(
        eq(contributions.entityType, 'pronunciation'),
        inArray(
          contributions.entityId,
          this.db.select({ id: pronunciations.id }).from(pronunciations).where(eq(pronunciations.wordId, wordId)),
        ),
      ),
      and(
        eq(contributions.entityType, 'word_image'),
        inArray(
          contributions.entityId,
          this.db.select({ id: wordImages.id }).from(wordImages).where(eq(wordImages.wordId, wordId)),
        ),
      ),
      and(
        eq(contributions.entityType, 'word_audio'),
        inArray(
          contributions.entityId,
          this.db.select({ id: wordAudios.id }).from(wordAudios).where(eq(wordAudios.wordId, wordId)),
        ),
      ),
      and(
        eq(contributions.entityType, 'meaning'),
        inArray(
          contributions.entityId,
          this.db.select({ id: meanings.id }).from(meanings).where(eq(meanings.wordId, wordId)),
        ),
      ),
      and(
        eq(contributions.entityType, 'example'),
        inArray(
          contributions.entityId,
          this.db
            .select({ id: examples.id })
            .from(examples)
            .innerJoin(meanings, eq(examples.meaningId, meanings.id))
            .where(eq(meanings.wordId, wordId)),
        ),
      ),
    );
  }

  async withPendingLock<T>(id: string, work: (tx: unknown) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await this.claimPending(tx, id);
      return work(tx);
    });
  }

  /**
   * LibSQL/SQLite tidak punya SELECT FOR UPDATE. Klaim = UPDATE yang hanya
   * cocok selagi status masih pending; menulis baris itu memegang write
   * lock sampai transaksi commit. Panggilan kedua menunggu, lalu 409.
   */
  private async claimPending(tx: Tx, id: string): Promise<void> {
    const [contrib] = await tx
      .select({ id: contributions.id, description: contributions.description, status: contributions.status })
      .from(contributions)
      .where(and(eq(contributions.id, id), isNull(contributions.deletedAt)))
      .limit(1);
    if (!contrib) {
      throw new NotFoundError('CONTRIBUTION_NOT_FOUND', 'Kontribusi dengan id tersebut tidak ditemukan');
    }
    if (contrib.status !== 'pending') {
      throw new ConflictError(
        'CONTRIBUTION_ALREADY_REVIEWED',
        'Kontribusi ini sudah diproses - sudah ada keputusan review',
      );
    }
    const claimed = await tx
      .update(contributions)
      .set({ description: contrib.description })
      .where(and(eq(contributions.id, id), eq(contributions.status, 'pending'), isNull(contributions.deletedAt)))
      .returning({ id: contributions.id });
    if (claimed.length === 0) {
      throw new ConflictError(
        'CONTRIBUTION_ALREADY_REVIEWED',
        'Kontribusi ini sudah diproses - sudah ada keputusan review',
      );
    }
  }

  async review(cmd: ReviewCommand, tx?: unknown): Promise<ReviewOutcome> {
    if (tx) return this.reviewOn(tx as Tx, cmd);
    return this.db.transaction((inner) => this.reviewOn(inner, cmd));
  }

  private async reviewOn(tx: Tx, cmd: ReviewCommand): Promise<ReviewOutcome> {
      // Klaim baris dulu. Dua verifikator bersamaan: satu sukses, satu 409.
      await this.claimPending(tx, cmd.contributionId);
      const [contrib] = await tx
        .select()
        .from(contributions)
        .where(and(eq(contributions.id, cmd.contributionId), isNull(contributions.deletedAt)))
        .limit(1);
      if (!contrib) {
        throw new NotFoundError('CONTRIBUTION_NOT_FOUND', 'Kontribusi dengan id tersebut tidak ditemukan');
      }
      if (contrib.status !== 'pending') {
        throw new ConflictError(
          'CONTRIBUTION_ALREADY_REVIEWED',
          'Kontribusi ini sudah diproses - sudah ada keputusan review',
        );
      }

      const now = new Date();
      const entityType = contrib.entityType as ContributionEntityType;
      let entityId = contrib.entityId;
      let mergedIntoWordId: string | null = null;

      switch (entityType) {
        case 'word': {
          const wordOutcome = await this.reviewWord(tx, contrib.entityId, cmd, now);
          entityId = wordOutcome.entityId;
          mergedIntoWordId = wordOutcome.mergedIntoWordId;
          break;
        }
        case 'pronunciation':
          await this.reviewPronunciation(tx, contrib.entityId, cmd, now);
          break;
        case 'word_image':
          await this.reviewWordImage(tx, contrib.entityId, cmd);
          break;
        case 'word_audio':
          await this.reviewWordAudio(tx, contrib.entityId, cmd);
          break;
        case 'example':
          await this.reviewExample(tx, contrib.entityId, cmd, now);
          break;
        case 'meaning':
          await this.reviewMeaning(tx, contrib.entityId, cmd, now);
          break;
      }

      const status = decisionToStatus(cmd.decision);
      const closed = await tx
        .update(contributions)
        .set({ status })
        .where(and(eq(contributions.id, contrib.id), eq(contributions.status, 'pending')))
        .returning({ id: contributions.id });
      if (closed.length === 0) {
        throw new ConflictError(
          'CONTRIBUTION_ALREADY_REVIEWED',
          'Kontribusi ini sudah diproses - sudah ada keputusan review',
        );
      }
      await tx.insert(contributionReviews).values({
        contributionId: contrib.id,
        reviewerId: cmd.reviewerId,
        status,
        comment: cmd.comment,
      });

      return {
        contributionId: contrib.id,
        entityType,
        entityId,
        status,
        contributorUserId: contrib.userId,
        ...(mergedIntoWordId ? { mergedIntoWordId } : {}),
      };
  }

  // Koreksi tanpa publish: isi berubah, is_corrected true, kontribusi tetap pending.
  // Kata/media yang sudah tayang tetap tayang (belum diverifikasi). Yang masih
  // pending_review (usulan tamu) tetap tersembunyi.
  private async childStatusAfterQuietCorrection(
    tx: Tx,
    cmd: ApplyChildCorrectionCommand,
  ): Promise<'published' | 'pending_review'> {
    const id = cmd.entityId;
    const alive = isNull(
      cmd.entityType === 'pronunciation'
        ? pronunciations.deletedAt
        : cmd.entityType === 'word_image'
          ? wordImages.deletedAt
          : cmd.entityType === 'word_audio'
            ? wordAudios.deletedAt
            : examples.deletedAt,
    );
    const table =
      cmd.entityType === 'pronunciation'
        ? pronunciations
        : cmd.entityType === 'word_image'
          ? wordImages
          : cmd.entityType === 'word_audio'
            ? wordAudios
            : examples;
    const [row] = await tx
      .select({ status: table.status })
      .from(table)
      .where(and(eq(table.id, id), alive))
      .limit(1);
    return row?.status === 'published' ? 'published' : 'pending_review';
  }

  async applyChildCorrection(cmd: ApplyChildCorrectionCommand): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const [pending] = await tx
        .select({ id: contributions.id })
        .from(contributions)
        .where(
          and(
            eq(contributions.entityType, cmd.entityType),
            eq(contributions.entityId, cmd.entityId),
            eq(contributions.status, 'pending'),
            isNull(contributions.deletedAt),
          ),
        )
        .limit(1);
      if (!pending) {
        throw new ConflictError(
          'CONTRIBUTION_ALREADY_REVIEWED',
          'Kontribusi ini sudah diproses - sudah ada keputusan review',
        );
      }
      await this.claimPending(tx, pending.id);
      const nextStatus = await this.childStatusAfterQuietCorrection(tx, cmd);
      switch (cmd.entityType) {
        case 'pronunciation': {
          const p = cmd.pronunciation;
          if (!p) throw new Error('patch pronunciation hilang pada koreksi tanpa publish');
          await tx
            .update(pronunciations)
            .set({
              notation: p.notation,
              value: p.value,
              dialectId: p.dialectId,
              audioUrl: p.audioUrl,
              speakerName: p.speakerName,
              notes: p.notes,
              status: nextStatus,
              isVerified: false,
              isCorrected: true,
              updatedBy: cmd.actorId,
              updatedAt: now,
            })
            .where(and(eq(pronunciations.id, cmd.entityId), isNull(pronunciations.deletedAt)));
          break;
        }
        case 'word_image': {
          const p = cmd.wordImage;
          if (!p) throw new Error('patch word_image hilang pada koreksi tanpa publish');
          await tx
            .update(wordImages)
            .set({
              url: p.url,
              providerFileId: p.providerFileId,
              altText: p.altText,
              isPrimary: p.isPrimary,
              status: nextStatus,
              isVerified: false,
              isCorrected: true,
            })
            .where(and(eq(wordImages.id, cmd.entityId), isNull(wordImages.deletedAt)));
          break;
        }
        case 'word_audio': {
          const p = cmd.wordAudio;
          if (!p) throw new Error('patch word_audio hilang pada koreksi tanpa publish');
          await tx
            .update(wordAudios)
            .set({
              speakerName: p.speakerName,
              dialectId: p.dialectId,
              isPrimary: p.isPrimary,
              status: nextStatus,
              isVerified: false,
              isCorrected: true,
            })
            .where(and(eq(wordAudios.id, cmd.entityId), isNull(wordAudios.deletedAt)));
          break;
        }
        case 'example': {
          const p = cmd.example;
          if (!p) throw new Error('patch example hilang pada koreksi tanpa publish');
          await tx
            .update(examples)
            .set({
              sourceSentence: p.sourceSentence,
              targetSentence: p.targetSentence,
              sourceType: p.sourceType,
              notes: p.notes,
              status: nextStatus,
              isVerified: false,
              isCorrected: true,
              updatedBy: cmd.actorId,
              updatedAt: now,
            })
            .where(and(eq(examples.id, cmd.entityId), isNull(examples.deletedAt)));
          break;
        }
      }
    });
  }

  // Kata: keputusan pada kata ikut memutuskan anak-anaknya (anak yang ikut
  // submit kata mengikuti gerbang kata - lihat childStatusOf word repository)
  private async reviewWord(
    tx: Tx,
    wordId: string,
    cmd: ReviewCommand,
    now: Date,
  ): Promise<{ entityId: string; mergedIntoWordId: string | null }> {
    if (cmd.decision === 'correct') {
      // Isi sudah di-update use case; publishOrMerge agar tidak ada 2 published
      // lemma sama (12-api §8). Kalau sudah soft-deleted oleh merge, skip jejak.
      // Kata yang sudah terverifikasi: jangan timpa verified_by / verified_at.
      const [before] = await tx
        .select({ isVerified: words.isVerified })
        .from(words)
        .where(and(eq(words.id, wordId), isNull(words.deletedAt)))
        .limit(1);
      const merge = await publishOrMergeMeaningsInTx(tx, wordId, cmd.reviewerId);
      if (merge?.mergedIntoWordId) {
        return { entityId: merge.wordId, mergedIntoWordId: merge.mergedIntoWordId };
      }
      if (!before?.isVerified) {
        await tx
          .update(words)
          .set({ verifiedBy: cmd.reviewerId, verifiedAt: now, updatedBy: cmd.reviewerId, updatedAt: now })
          .where(and(eq(words.id, wordId), isNull(words.deletedAt)));
      }
      return { entityId: wordId, mergedIntoWordId: null };
    }

    if (cmd.decision === 'approve') {
      const merge = await publishOrMergeMeaningsInTx(tx, wordId, cmd.reviewerId);
      if (!merge) {
        throw new NotFoundError('WORD_NOT_FOUND', 'Kata kontribusi tidak ditemukan');
      }
      return { entityId: merge.wordId, mergedIntoWordId: merge.mergedIntoWordId };
    }

    await tx
      .update(words)
      .set({ status: 'rejected', updatedBy: cmd.reviewerId, updatedAt: now })
      .where(and(eq(words.id, wordId), isNull(words.deletedAt)));
    await this.setWordChildrenStatus(tx, wordId, 'rejected', false, cmd.reviewerId, now);
    return { entityId: wordId, mergedIntoWordId: null };
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
    await tx
      .update(meanings)
      .set({ status, isVerified, updatedBy: reviewerId, updatedAt: now })
      .where(eq(meanings.wordId, wordId));
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
    // word_images / word_audios tidak punya kolom updated_by/updated_at (lihat schema)
    await tx.update(wordImages).set({ status, isVerified }).where(eq(wordImages.wordId, wordId));
    await tx.update(wordAudios).set({ status, isVerified }).where(eq(wordAudios.wordId, wordId));
  }

  // ponytail: patch koreksi anak tidak memvalidasi FK baru (dialect dsb) -
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

  // word_images tidak punya updated_by/updated_at (lihat schema) - tanpa param now
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

  // word_audios tidak punya updated_by/updated_at (lihat schema) - tanpa param now
  private async reviewWordAudio(tx: Tx, entityId: string, cmd: ReviewCommand): Promise<void> {
    const where = and(eq(wordAudios.id, entityId), isNull(wordAudios.deletedAt));
    if (cmd.decision === 'approve') {
      await tx.update(wordAudios).set({ status: 'published', isVerified: true }).where(where);
    } else if (cmd.decision === 'reject') {
      await tx.update(wordAudios).set({ status: 'rejected', isVerified: false }).where(where);
    } else {
      const p = cmd.childPatch?.wordAudio;
      if (!p) throw new Error('childPatch.wordAudio hilang pada decision correct');
      await tx
        .update(wordAudios)
        .set({
          speakerName: p.speakerName,
          dialectId: p.dialectId,
          isPrimary: p.isPrimary,
          status: 'published',
          isVerified: true,
          isCorrected: true,
        })
        .where(where);
    }
  }

  // 17-api-usul-definisi.md: approve → publish + bersihkan placeholder "-"
  // pada kata yang sama (satu tx); reject → status rejected (baris tetap,
  // preseden reviewPronunciation). 'correct' tidak didukung untuk makna.
  private async reviewMeaning(tx: Tx, entityId: string, cmd: ReviewCommand, now: Date): Promise<void> {
    const where = and(eq(meanings.id, entityId), isNull(meanings.deletedAt));

    if (cmd.decision === 'reject') {
      await tx
        .update(meanings)
        .set({ status: 'rejected', isVerified: false, updatedBy: cmd.reviewerId, updatedAt: now })
        .where(where);
      return;
    }

    if (cmd.decision === 'correct') {
      throw new ConflictError(
        'CONTRIBUTION_ALREADY_REVIEWED',
        'Koreksi langsung tidak didukung untuk kontribusi makna - reject + usul ulang',
      );
    }

    // approve
    const [approved] = await tx
      .update(meanings)
      .set({ status: 'published', isVerified: true, updatedBy: cmd.reviewerId, updatedAt: now })
      .where(where)
      .returning({ wordId: meanings.wordId, isHaveDefinition: meanings.isHaveDefinition });
    if (!approved) return;

    // Placeholder "-" tidak lagi diperlukan begitu definisi nyata tayang.
    // GUARD: hanya bersihkan kalau baris yang di-approve memang definisi
    // nyata (isHaveDefinition=true) - placeholder tidak menghapus placeholder.
    if (approved.isHaveDefinition) {
      await tx
        .update(meanings)
        .set({ deletedAt: now, deletedBy: cmd.reviewerId })
        .where(
          and(
            eq(meanings.wordId, approved.wordId),
            eq(meanings.isHaveDefinition, false),
            eq(meanings.status, 'published'),
            isNull(meanings.deletedAt),
            ne(meanings.id, entityId),
          ),
        );
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
