import { eq, and, desc, isNull, inArray, lt, asc } from 'drizzle-orm';
import { db } from '@/shared/database/drizzle/client';
import {
  words,
  wordEditSuggestions,
  users,
  meanings,
  meaningTranslations,
  wordCategories,
  wordClasses,
  auditLogs,
  lexicalRelations,
  wordVariants,
  wordImages,
} from '@/shared/database/drizzle/schema';
import type { WordSuggestionRepository, ChangeHistoryItem, SuggestionSource } from '../domain/repositories/word-suggestion.repository';
import type {
  WordEditSuggestion,
  SuggestionDetail,
  SuggestionSummary,
  CurrentWordSnapshot,
  DiffResult,
  ProposedChanges,
  SuggestionStatus,
  SuggestionReasonCode,
} from '../domain/entities/word-suggestion.entity';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '@/shared/errors/app-error';
import { verifyProposedChanges } from '../application/utils/verify-proposed-changes';
import { applyChangesToWord } from '../application/utils/apply-changes-to-word';
import {
  deleteProposedStagingImages,
  prepareProposedImagesForApprove,
} from '../application/utils/suggestion-image-moderation';
import {
  deleteStagingWordImage,
  promoteWordImageFromStaging,
} from '@/modules/contribution/application/utils/promote-word-image-staging';
import type { ImageStoragePort } from '@/modules/image/application/ports/image-storage.port';
import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';

async function getUsername(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.username ?? null;
}

async function getUsernames(ids: string[]): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, ids));
  const map: Record<string, string | null> = {};
  for (const r of rows) map[r.id] = r.username;
  return map;
}

async function captureBaseline(
  wordId: string,
  lemma: string,
  notes: string | null,
  isVerified: boolean,
) {
  const meaningRows = await db
    .select({ id: meanings.id, definition: meanings.definition })
    .from(meanings)
    .where(and(eq(meanings.wordId, wordId), isNull(meanings.deletedAt)));
  const meaningIds = meaningRows.map((m) => m.id);
  const translationRows = meaningIds.length
    ? await db
        .select({
          id: meaningTranslations.id,
          meaningId: meaningTranslations.meaningId,
          translationText: meaningTranslations.translationText,
        })
        .from(meaningTranslations)
        .where(and(inArray(meaningTranslations.meaningId, meaningIds), isNull(meaningTranslations.deletedAt)))
    : [];
  return {
    lemma,
    notes,
    isVerified,
    meanings: meaningRows.map((m) => ({
      id: m.id,
      definition: m.definition,
      translations: translationRows
        .filter((t) => t.meaningId === m.id)
        .map((t) => ({ id: t.id, translationText: t.translationText })),
    })),
  };
}

async function restoreBaseline(wordId: string, raw: unknown): Promise<void> {
  const snap = raw as Awaited<ReturnType<typeof captureBaseline>> | null;
  if (!snap || typeof snap !== 'object' || !snap.lemma) return;
  await db
    .update(words)
    .set({
      lemma: snap.lemma,
      notes: snap.notes,
      isVerified: snap.isVerified,
      updatedAt: new Date(),
    })
    .where(eq(words.id, wordId));
  for (const meaning of snap.meanings ?? []) {
    await db
      .update(meanings)
      .set({ definition: meaning.definition, updatedAt: new Date() })
      .where(eq(meanings.id, meaning.id));
    for (const translation of meaning.translations ?? []) {
      await db
        .update(meaningTranslations)
        .set({ translationText: translation.translationText, updatedAt: new Date() })
        .where(eq(meaningTranslations.id, translation.id));
    }
  }
}

async function getCurrentWordSnapshot(wordId: string): Promise<CurrentWordSnapshot | null> {
  const [word] = await db
    .select({ lemma: words.lemma, notes: words.notes })
    .from(words)
    .where(and(eq(words.id, wordId), isNull(words.deletedAt)))
    .limit(1);
  if (!word) return null;

  const meaningRows = await db
    .select({
      id: meanings.id,
      definition: meanings.definition,
      wordClassCode: wordClasses.code,
      wordClassName: wordClasses.name,
    })
    .from(meanings)
    .leftJoin(wordClasses, eq(meanings.wordClassId, wordClasses.id))
    .where(and(eq(meanings.wordId, wordId), isNull(meanings.deletedAt)))
    .orderBy(asc(meanings.orderIndex));

  const meaningIds = meaningRows.map((m) => m.id);
  const translations =
    meaningIds.length === 0
      ? []
      : await db
          .select({
            meaningId: meaningTranslations.meaningId,
            translationText: meaningTranslations.translationText,
          })
          .from(meaningTranslations)
          .where(
            and(
              inArray(meaningTranslations.meaningId, meaningIds),
              isNull(meaningTranslations.deletedAt),
            ),
          );

  const byMeaning = new Map<string, { translationText: string }[]>();
  for (const t of translations) {
    const list = byMeaning.get(t.meaningId) ?? [];
    list.push({ translationText: t.translationText });
    byMeaning.set(t.meaningId, list);
  }

  const catRows = await db
    .select({ categoryId: wordCategories.categoryId })
    .from(wordCategories)
    .where(and(eq(wordCategories.wordId, wordId), isNull(wordCategories.deletedAt)));

  const relRows = await db
    .select({
      relationType: lexicalRelations.relationType,
      wordId: lexicalRelations.targetWordId,
      lemma: words.lemma,
    })
    .from(lexicalRelations)
    .innerJoin(words, eq(words.id, lexicalRelations.targetWordId))
    .where(
      and(eq(lexicalRelations.sourceWordId, wordId), isNull(lexicalRelations.deletedAt)),
    );

  const variantRows = await db
    .select({
      form: wordVariants.form,
      variantType: wordVariants.variantType,
      dialectId: wordVariants.dialectId,
    })
    .from(wordVariants)
    .where(and(eq(wordVariants.wordId, wordId), isNull(wordVariants.deletedAt)));

  const imageRows = await db
    .select({
      id: wordImages.id,
      url: wordImages.url,
      isPrimary: wordImages.isPrimary,
      altText: wordImages.altText,
    })
    .from(wordImages)
    .where(and(eq(wordImages.wordId, wordId), isNull(wordImages.deletedAt)));

  return {
    lemma: word.lemma,
    notes: word.notes,
    meanings: meaningRows.map((m) => ({
      id: m.id,
      wordClass:
        m.wordClassCode && m.wordClassName
          ? { code: m.wordClassCode, name: m.wordClassName }
          : { code: '', name: '' },
      definition: m.definition,
      translations: byMeaning.get(m.id) ?? [],
    })),
    categoryIds: catRows.map((c) => c.categoryId),
    relations: relRows.map((r) => ({
      relationType: r.relationType,
      wordId: r.wordId,
      lemma: r.lemma,
    })),
    variants: variantRows.map((v) => ({
      form: v.form,
      variantType: v.variantType,
      dialectId: v.dialectId,
    })),
    images: imageRows.map((i) => ({
      id: i.id,
      url: i.url,
      isPrimary: i.isPrimary,
      altText: i.altText,
    })),
  };
}

function buildDiff(proposed: ProposedChanges, current: CurrentWordSnapshot): DiffResult {
  const lemma: DiffResult['lemma'] = {
    current: current.lemma,
    proposed: proposed.lemma ?? null,
    changed: proposed.lemma !== undefined && proposed.lemma !== current.lemma,
  };
  const notes: DiffResult['notes'] = {
    current: current.notes,
    proposed: proposed.notes ?? null,
    changed: proposed.notes !== undefined && proposed.notes !== current.notes,
  };

  const meaningsDiff: DiffResult['meanings'] = [];
  for (const mc of proposed.meanings ?? []) {
    const changes: DiffResult['meanings'][0]['changes'] = [];
    if (mc.action === 'add') {
      if (mc.definition !== undefined) {
        changes.push({ current: null, proposed: mc.definition, changed: true });
      }
      meaningsDiff.push({ meaningId: null, changes });
      continue;
    }
    if (!mc.meaningId) continue;
    const cur = current.meanings.find((m) => m.id === mc.meaningId);
    if (mc.definition !== undefined) {
      const d = cur?.definition ?? null;
      changes.push({ current: d, proposed: mc.definition, changed: mc.definition !== d });
    }
    if (mc.translations) {
      for (const t of mc.translations) {
        changes.push({ current: null, proposed: t.translationText, changed: true });
      }
    }
    meaningsDiff.push({ meaningId: mc.meaningId, changes });
  }

  const curCats = new Set(current.categoryIds);
  const relAdded = (proposed.relations ?? [])
    .filter((r) => r.action === 'add')
    .map((r) => ({
      relationType: r.relationType,
      wordId: r.wordId,
      lemma: current.relations.find((c) => c.wordId === r.wordId)?.lemma,
    }));
  const relRemoved = (proposed.relations ?? [])
    .filter((r) => r.action === 'remove')
    .map((r) => ({
      relationType: r.relationType,
      wordId: r.wordId,
      lemma: current.relations.find((c) => c.wordId === r.wordId)?.lemma,
    }));

  return {
    lemma,
    notes,
    meanings: meaningsDiff,
    categories: {
      added: (proposed.categoryIdsToAdd ?? []).filter((c) => !curCats.has(c)),
      removed: (proposed.categoryIdsToRemove ?? []).filter((c) => curCats.has(c)),
    },
    relations: { added: relAdded, removed: relRemoved },
    variants: {
      added: (proposed.variants ?? [])
        .filter((v) => v.action === 'add')
        .map((v) => ({ form: v.form, variantType: v.variantType ?? 'alternative' })),
      removed: (proposed.variants ?? [])
        .filter((v) => v.action === 'remove')
        .map((v) => ({ form: v.form, variantType: v.variantType ?? 'alternative' })),
    },
    images: {
      added: (proposed.images ?? [])
        .filter((i) => i.action === 'add' && i.url)
        .map((i) => ({
          url: i.url!,
          isPrimary: i.isPrimary ?? false,
          provider: i.provider ?? null,
          providerFileId: i.providerFileId ?? null,
        })),
      removed: (proposed.images ?? [])
        .filter((i) => i.action === 'remove' && i.imageId)
        .map((i) => ({ imageId: i.imageId! })),
      setPrimary: (proposed.images ?? [])
        .filter((i) => i.action === 'set_primary' && i.imageId)
        .map((i) => ({ imageId: i.imageId! })),
    },
  };
}

function asProposed(raw: unknown): ProposedChanges {
  return (raw ?? {}) as ProposedChanges;
}

export class WordSuggestionRepositoryImpl implements WordSuggestionRepository {
  constructor(
    private readonly publicImageStorage: PublicImageStoragePort,
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async createSuggestion(
    userId: string,
    wordId: string,
    proposedChanges: ProposedChanges,
    reason: string,
    reasonCode: string,
  ): Promise<WordEditSuggestion> {
    const [word] = await db
      .select({
        id: words.id,
        lemma: words.lemma,
        notes: words.notes,
        status: words.status,
        isVerified: words.isVerified,
        createdBy: words.createdBy,
      })
      .from(words)
      .where(and(eq(words.id, wordId), isNull(words.deletedAt)))
      .limit(1);
    if (!word) throw new NotFoundError('WORD_NOT_FOUND', 'Kata tidak ditemukan');
    if (word.status !== 'published') {
      throw new BadRequestError('WORD_NOT_PUBLISHED', 'Hanya kata yang tayang bisa diusulkan');
    }

    const validation = verifyProposedChanges(proposedChanges);
    if (!validation.valid) {
      throw new BadRequestError(
        'INVALID_SUGGESTION_CHANGES',
        'Perubahan tidak valid',
        validation.errors.map((e) => ({ field: e.field, message: e.message })),
      );
    }

    if (word.createdBy === userId) {
      throw new ForbiddenError(
        'CANNOT_SUGGEST_OWN_WORD',
        'Tidak bisa mengusulkan perubahan pada kata sendiri',
      );
    }

    const [open] = await db
      .select({ id: wordEditSuggestions.id })
      .from(wordEditSuggestions)
      .where(
        and(
          eq(wordEditSuggestions.wordId, wordId),
          eq(wordEditSuggestions.status, 'pending'),
          isNull(wordEditSuggestions.deletedAt),
        ),
      )
      .limit(1);
    if (open) {
      throw new ConflictError(
        'SUGGESTION_ALREADY_PENDING',
        'Kata ini sudah punya usulan yang belum selesai. Tunggu pemeriksaan tim sebelum mengirim usulan lain.',
      );
    }

    const applyNow = !word.isVerified;
    const baseline = applyNow ? await captureBaseline(wordId, word.lemma, word.notes, word.isVerified) : null;

    const [suggestion] = await db
      .insert(wordEditSuggestions)
      .values({
        userId,
        wordId,
        proposedChanges: proposedChanges as unknown as Record<string, unknown>,
        reason,
        reasonCode,
        status: 'pending',
        ...(baseline ? { baselineSnapshot: baseline } : {}),
      })
      .returning();

    if (applyNow) {
      await applyChangesToWord(suggestion.id, userId, 'apply_pending');
    }

    await db.insert(auditLogs).values({
      userId,
      action: 'create',
      entityType: 'word_suggestion',
      entityId: suggestion.id,
      oldData: null,
      newData: { word_id: wordId, status: 'pending', reason_code: reasonCode },
      requestId: null,
      sourceContributionId: suggestion.id,
    });

    const username = await getUsername(userId);
    return {
      id: suggestion.id,
      userId: suggestion.userId,
      wordId: suggestion.wordId,
      proposedChanges,
      reason: suggestion.reason,
      reasonCode: (suggestion.reasonCode ?? 'other') as SuggestionReasonCode,
      status: suggestion.status as SuggestionStatus,
      reviewedBy: suggestion.reviewedBy,
      reviewedAt: suggestion.reviewedAt,
      reviewComment: suggestion.reviewComment,
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt,
      deletedAt: suggestion.deletedAt,
      deletedBy: suggestion.deletedBy,
      contributorUsername: username,
      wordLemma: word.lemma,
    };
  }

  async listSuggestions(opts: {
    status?: SuggestionStatus;
    limit: number;
    cursor?: string;
  }): Promise<{ items: SuggestionSummary[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = Math.min(opts.limit, 100);
    const conditions = [isNull(wordEditSuggestions.deletedAt)];
    if (opts.status) conditions.push(eq(wordEditSuggestions.status, opts.status));
    if (opts.cursor) conditions.push(lt(wordEditSuggestions.id, opts.cursor));

    const rows = await db
      .select({
        id: wordEditSuggestions.id,
        wordId: wordEditSuggestions.wordId,
        userId: wordEditSuggestions.userId,
        reason: wordEditSuggestions.reason,
        reasonCode: wordEditSuggestions.reasonCode,
        status: wordEditSuggestions.status,
        createdAt: wordEditSuggestions.createdAt,
        proposedChanges: wordEditSuggestions.proposedChanges,
        lemma: words.lemma,
        username: users.username,
      })
      .from(wordEditSuggestions)
      .innerJoin(words, eq(wordEditSuggestions.wordId, words.id))
      .innerJoin(users, eq(wordEditSuggestions.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(wordEditSuggestions.id))
      .limit(limit + 1);

    const slice = rows.slice(0, limit);
    const items: SuggestionSummary[] = slice.map((s) => {
      const pc = asProposed(s.proposedChanges);
      return {
        id: s.id,
        wordId: s.wordId,
        wordLemma: s.lemma,
        contributorId: s.userId,
        contributorUsername: s.username,
        reason: s.reason,
        reasonCode: (s.reasonCode ?? 'other') as SuggestionReasonCode,
        status: s.status as SuggestionStatus,
        createdAt: s.createdAt,
        summaryChanges: {
          lemma: pc.lemma ?? null,
          notes: pc.notes ?? null,
          meaningsCount: pc.meanings?.length ?? 0,
          categoriesAdded: pc.categoryIdsToAdd?.length ?? 0,
          categoriesRemoved: pc.categoryIdsToRemove?.length ?? 0,
          relationsCount: pc.relations?.length ?? 0,
          variantsCount: pc.variants?.length ?? 0,
          imagesCount: pc.images?.length ?? 0,
        },
      };
    });

    const hasMore = rows.length > limit;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  async listMine(opts: {
    userId: string;
    status?: SuggestionStatus;
    limit: number;
    cursor?: string;
  }): Promise<{
    items: Array<{
      id: string;
      wordId: string;
      wordLemma: string;
      status: SuggestionStatus;
      createdAt: Date;
      reviewComment: string | null;
      reason: string;
      reasonCode: SuggestionReasonCode;
      reviewedAt: Date | null;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(opts.limit, 100);
    const conditions = [
      isNull(wordEditSuggestions.deletedAt),
      eq(wordEditSuggestions.userId, opts.userId),
    ];
    if (opts.status) conditions.push(eq(wordEditSuggestions.status, opts.status));
    if (opts.cursor) conditions.push(lt(wordEditSuggestions.id, opts.cursor));

    const rows = await db
      .select({
        id: wordEditSuggestions.id,
        wordId: wordEditSuggestions.wordId,
        reason: wordEditSuggestions.reason,
        reasonCode: wordEditSuggestions.reasonCode,
        status: wordEditSuggestions.status,
        createdAt: wordEditSuggestions.createdAt,
        reviewComment: wordEditSuggestions.reviewComment,
        reviewedAt: wordEditSuggestions.reviewedAt,
        lemma: words.lemma,
      })
      .from(wordEditSuggestions)
      .innerJoin(words, eq(wordEditSuggestions.wordId, words.id))
      .where(and(...conditions))
      .orderBy(desc(wordEditSuggestions.id))
      .limit(limit + 1);

    const slice = rows.slice(0, limit);
    const items = slice.map((s) => ({
      id: s.id,
      wordId: s.wordId,
      wordLemma: s.lemma,
      status: s.status as SuggestionStatus,
      createdAt: s.createdAt,
      reviewComment: s.reviewComment,
      reason: s.reason,
      reasonCode: (s.reasonCode ?? 'other') as SuggestionReasonCode,
      reviewedAt: s.reviewedAt,
    }));
    const hasMore = rows.length > limit;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  async getSuggestionDetail(id: string): Promise<SuggestionDetail | null> {
    const [row] = await db
      .select({
        suggestion: wordEditSuggestions,
        lemma: words.lemma,
        username: users.username,
      })
      .from(wordEditSuggestions)
      .innerJoin(words, eq(wordEditSuggestions.wordId, words.id))
      .innerJoin(users, eq(wordEditSuggestions.userId, users.id))
      .where(and(eq(wordEditSuggestions.id, id), isNull(wordEditSuggestions.deletedAt)))
      .limit(1);
    if (!row) return null;

    const current = await getCurrentWordSnapshot(row.suggestion.wordId);
    if (!current) return null;

    const proposed = asProposed(row.suggestion.proposedChanges);
    return {
      suggestion: {
        id: row.suggestion.id,
        userId: row.suggestion.userId,
        wordId: row.suggestion.wordId,
        proposedChanges: proposed,
        reason: row.suggestion.reason,
        reasonCode: (row.suggestion.reasonCode ?? 'other') as SuggestionReasonCode,
        status: row.suggestion.status as SuggestionStatus,
        reviewedBy: row.suggestion.reviewedBy,
        reviewedAt: row.suggestion.reviewedAt,
        reviewComment: row.suggestion.reviewComment,
        createdAt: row.suggestion.createdAt,
        updatedAt: row.suggestion.updatedAt,
        deletedAt: row.suggestion.deletedAt,
        deletedBy: row.suggestion.deletedBy,
        contributorUsername: row.username,
        wordLemma: row.lemma,
      },
      currentWord: current,
      diff: buildDiff(proposed, current),
    };
  }

  async findById(id: string): Promise<WordEditSuggestion | null> {
    const [result] = await db
      .select()
      .from(wordEditSuggestions)
      .where(and(eq(wordEditSuggestions.id, id), isNull(wordEditSuggestions.deletedAt)))
      .limit(1);
    if (!result) return null;
    return {
      id: result.id,
      userId: result.userId,
      wordId: result.wordId,
      proposedChanges: asProposed(result.proposedChanges),
      reason: result.reason,
      reasonCode: (result.reasonCode ?? 'other') as SuggestionReasonCode,
      status: result.status as SuggestionStatus,
      reviewedBy: result.reviewedBy,
      reviewedAt: result.reviewedAt,
      reviewComment: result.reviewComment,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      deletedAt: result.deletedAt,
      deletedBy: result.deletedBy,
    };
  }

  async approveSuggestion(
    id: string,
    reviewerId: string,
    comment?: string,
    imageOpts?: {
      decisions?: { key: string; decision: 'approve' | 'reject' }[];
      censoredFiles?: Record<string, { bytes: Uint8Array; mimeType: string | null }>;
    },
  ): Promise<{ applied: boolean; changesApplied: number; wordLemma: string; wordId: string }> {
    const [row] = await db
      .select({
        wordId: wordEditSuggestions.wordId,
        status: wordEditSuggestions.status,
        baselineSnapshot: wordEditSuggestions.baselineSnapshot,
        proposedChanges: wordEditSuggestions.proposedChanges,
      })
      .from(wordEditSuggestions)
      .where(and(eq(wordEditSuggestions.id, id), isNull(wordEditSuggestions.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError('SUGGESTION_NOT_FOUND', 'Usulan tidak ditemukan');
    if (row.status !== 'pending') {
      throw new ConflictError('SUGGESTION_ALREADY_REVIEWED', 'Usulan sudah pernah diverifikasi');
    }
    if (row.baselineSnapshot) {
      await this.moderateAppliedStagingImages(
        row.wordId,
        asProposed(row.proposedChanges),
        imageOpts,
      );
      const [word] = await db
        .select({ lemma: words.lemma })
        .from(words)
        .where(eq(words.id, row.wordId))
        .limit(1);
      await db
        .update(words)
        .set({
          isVerified: true,
          verifiedBy: reviewerId,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(words.id, row.wordId));
      await db
        .update(wordEditSuggestions)
        .set({
          status: 'approved',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewComment: comment ?? null,
          updatedAt: new Date(),
        })
        .where(eq(wordEditSuggestions.id, id));
      return {
        applied: false,
        changesApplied: 0,
        wordLemma: word?.lemma ?? '',
        wordId: row.wordId,
      };
    }

    const prepared = await prepareProposedImagesForApprove(asProposed(row.proposedChanges), {
      publicImageStorage: this.publicImageStorage,
      imageStorage: this.imageStorage,
      decisions: imageOpts?.decisions,
      censoredFiles: imageOpts?.censoredFiles,
    });
    return applyChangesToWord(id, reviewerId, 'approve', comment, prepared);
  }

  async rejectSuggestion(id: string, reviewerId: string, comment: string): Promise<boolean> {
    if (!comment.trim()) {
      throw new BadRequestError('VALIDATION_ERROR', 'Alasan penolakan wajib diisi', [
        { field: 'comment', message: 'Alasan penolakan wajib diisi' },
      ]);
    }
    const [current] = await db
      .select({
        wordId: wordEditSuggestions.wordId,
        baselineSnapshot: wordEditSuggestions.baselineSnapshot,
        proposedChanges: wordEditSuggestions.proposedChanges,
      })
      .from(wordEditSuggestions)
      .where(
        and(
          eq(wordEditSuggestions.id, id),
          eq(wordEditSuggestions.status, 'pending'),
          isNull(wordEditSuggestions.deletedAt),
        ),
      )
      .limit(1);
    if (!current) {
      const existing = await this.findById(id);
      if (!existing) throw new NotFoundError('SUGGESTION_NOT_FOUND', 'Usulan tidak ditemukan');
      throw new BadRequestError('SUGGESTION_ALREADY_REVIEWED', 'Usulan sudah pernah diverifikasi');
    }

    const proposed = asProposed(current.proposedChanges);
    await deleteProposedStagingImages(proposed, this.imageStorage);
    if (current.baselineSnapshot) {
      await restoreBaseline(current.wordId, current.baselineSnapshot);
      await this.softDeleteAppliedStagingImages(current.wordId, proposed);
    }

    const [updated] = await db
      .update(wordEditSuggestions)
      .set({
        status: 'rejected',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewComment: comment,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wordEditSuggestions.id, id),
          eq(wordEditSuggestions.status, 'pending'),
          isNull(wordEditSuggestions.deletedAt),
        ),
      )
      .returning();
    if (!updated) {
      throw new BadRequestError('SUGGESTION_ALREADY_REVIEWED', 'Usulan sudah pernah diverifikasi');
    }

    await db.insert(auditLogs).values({
      userId: reviewerId,
      action: 'suggest_edit_rejected',
      entityType: 'word',
      entityId: updated.wordId,
      oldData: null,
      newData: { status: 'rejected', comment },
      requestId: null,
      sourceContributionId: id,
    });

    return true;
  }

  async correctSuggestion(
    id: string,
    reviewerId: string,
    correctedChanges: ProposedChanges,
    publish: boolean,
    comment?: string,
    imageOpts?: {
      decisions?: { key: string; decision: 'approve' | 'reject' }[];
      censoredFiles?: Record<string, { bytes: Uint8Array; mimeType: string | null }>;
    },
  ): Promise<{
    applied: boolean;
    changesApplied: number;
    status: SuggestionStatus;
    wordLemma: string;
  }> {
    const validation = verifyProposedChanges(correctedChanges);
    if (!validation.valid) {
      throw new BadRequestError(
        'INVALID_SUGGESTION_CHANGES',
        'Perubahan tidak valid',
        validation.errors.map((e) => ({ field: e.field, message: e.message })),
      );
    }

    if (publish) {
      const prepared = await prepareProposedImagesForApprove(correctedChanges, {
        publicImageStorage: this.publicImageStorage,
        imageStorage: this.imageStorage,
        decisions: imageOpts?.decisions,
        censoredFiles: imageOpts?.censoredFiles,
      });
      const result = await applyChangesToWord(
        id,
        reviewerId,
        'correct_and_publish',
        comment,
        prepared,
      );
      return {
        applied: result.applied,
        changesApplied: result.changesApplied,
        status: 'corrected',
        wordLemma: result.wordLemma,
      };
    }

    const [updated] = await db
      .update(wordEditSuggestions)
      .set({
        proposedChanges: correctedChanges as unknown as Record<string, unknown>,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewComment: comment ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(wordEditSuggestions.id, id), isNull(wordEditSuggestions.deletedAt)))
      .returning();
    if (!updated) throw new NotFoundError('SUGGESTION_NOT_FOUND', 'Usulan tidak ditemukan');

    const [word] = await db
      .select({ lemma: words.lemma })
      .from(words)
      .where(eq(words.id, updated.wordId))
      .limit(1);

    return {
      applied: false,
      changesApplied: 0,
      status: 'pending',
      wordLemma: word?.lemma ?? '',
    };
  }

  /**
   * Usulan sudah apply_pending: foto ImageKit ada di word_images (isVerified=false).
   * Promote yang ditayangkan; soft-delete + hapus staging yang ditolak.
   */
  private async moderateAppliedStagingImages(
    wordId: string,
    changes: ProposedChanges,
    imageOpts?: {
      decisions?: { key: string; decision: 'approve' | 'reject' }[];
      censoredFiles?: Record<string, { bytes: Uint8Array; mimeType: string | null }>;
    },
  ): Promise<void> {
    const decisionByKey = new Map(
      (imageOpts?.decisions ?? []).map((d) => [d.key, d.decision] as const),
    );
    let addIndex = 0;

    for (const img of changes.images ?? []) {
      if (img.action !== 'add' || img.provider !== 'imagekit' || !img.providerFileId || !img.url) {
        if (img.action === 'add') addIndex += 1;
        continue;
      }

      const indexKey = String(addIndex);
      const fileKey = img.providerFileId;
      addIndex += 1;

      const decision =
        decisionByKey.get(indexKey) ??
        decisionByKey.get(fileKey) ??
        'approve';

      const [row] = await db
        .select({
          id: wordImages.id,
          url: wordImages.url,
          provider: wordImages.provider,
          providerFileId: wordImages.providerFileId,
        })
        .from(wordImages)
        .where(
          and(
            eq(wordImages.wordId, wordId),
            eq(wordImages.providerFileId, img.providerFileId),
            eq(wordImages.provider, 'imagekit'),
            isNull(wordImages.deletedAt),
          ),
        )
        .limit(1);
      if (!row) continue;

      const staging = {
        id: row.id,
        url: row.url,
        provider: row.provider,
        providerFileId: row.providerFileId,
      };

      if (decision === 'reject') {
        await deleteStagingWordImage(staging, this.imageStorage);
        await db
          .update(wordImages)
          .set({ deletedAt: new Date(), isPrimary: false, isVerified: false })
          .where(eq(wordImages.id, row.id));
        continue;
      }

      const censored =
        imageOpts?.censoredFiles?.[indexKey] ?? imageOpts?.censoredFiles?.[fileKey];
      const promoted = await promoteWordImageFromStaging(staging, this.publicImageStorage, {
        bytes: censored?.bytes,
        mimeType: censored?.mimeType,
      });
      await db
        .update(wordImages)
        .set({
          url: promoted.url,
          provider: promoted.provider,
          providerFileId: promoted.providerFileId,
          sha: promoted.sha,
          isVerified: true,
          status: 'published',
        })
        .where(eq(wordImages.id, row.id));
      await deleteStagingWordImage(staging, this.imageStorage);
    }
  }

  /** Soft-delete baris staging ImageKit yang sudah terpasang lewat apply_pending. */
  private async softDeleteAppliedStagingImages(
    wordId: string,
    changes: ProposedChanges,
  ): Promise<void> {
    const fileIds = (changes.images ?? [])
      .filter((i) => i.action === 'add' && i.provider === 'imagekit' && i.providerFileId)
      .map((i) => i.providerFileId!);
    if (fileIds.length === 0) return;

    await db
      .update(wordImages)
      .set({ deletedAt: new Date(), isPrimary: false, isVerified: false })
      .where(
        and(
          eq(wordImages.wordId, wordId),
          eq(wordImages.provider, 'imagekit'),
          inArray(wordImages.providerFileId, fileIds),
          isNull(wordImages.deletedAt),
        ),
      );
  }

  async getChangeHistory(
    wordId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: ChangeHistoryItem[]; nextCursor: string | null; hasMore: boolean }> {
    const [word] = await db
      .select({ id: words.id })
      .from(words)
      .where(and(eq(words.id, wordId), isNull(words.deletedAt)))
      .limit(1);
    if (!word) throw new NotFoundError('WORD_NOT_FOUND', 'Kata tidak ditemukan');

    const conditions = [eq(auditLogs.entityType, 'word'), eq(auditLogs.entityId, wordId)];
    if (cursor) conditions.push(lt(auditLogs.id, cursor));

    const rows = await db
      .select({
        auditId: auditLogs.id,
        auditUserId: auditLogs.userId,
        action: auditLogs.action,
        oldData: auditLogs.oldData,
        newData: auditLogs.newData,
        createdAt: auditLogs.createdAt,
        sourceContributionId: auditLogs.sourceContributionId,
      })
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(Math.min(limit + 1, 101));

    if (rows.length === 0) return { items: [], nextCursor: null, hasMore: false };

    const userIds = [
      ...new Set(rows.filter((r) => r.auditUserId).map((r) => r.auditUserId as string)),
    ];
    const sourceIds = [
      ...new Set(
        rows.filter((r) => r.sourceContributionId).map((r) => r.sourceContributionId as string),
      ),
    ];

    const suggestionMap: Record<
      string,
      { userId: string; reason: string; reviewedBy: string | null; reviewComment: string | null }
    > = {};
    if (sourceIds.length > 0) {
      const sugRows = await db
        .select({
          id: wordEditSuggestions.id,
          userId: wordEditSuggestions.userId,
          reason: wordEditSuggestions.reason,
          reviewedBy: wordEditSuggestions.reviewedBy,
          reviewComment: wordEditSuggestions.reviewComment,
        })
        .from(wordEditSuggestions)
        .where(inArray(wordEditSuggestions.id, sourceIds));
      for (const s of sugRows) {
        suggestionMap[s.id] = {
          userId: s.userId,
          reason: s.reason,
          reviewedBy: s.reviewedBy,
          reviewComment: s.reviewComment,
        };
        userIds.push(s.userId);
        if (s.reviewedBy) userIds.push(s.reviewedBy);
      }
    }

    const usernameMap = await getUsernames([...new Set(userIds)]);

    const mapped: ChangeHistoryItem[] = rows.map((r) => {
      const type: 'direct_edit' | 'suggest_edit' = r.sourceContributionId
        ? 'suggest_edit'
        : 'direct_edit';
      const changes = this._extractChanges(r.oldData, r.newData);
      let source: SuggestionSource | null = null;
      if (r.sourceContributionId && suggestionMap[r.sourceContributionId]) {
        const sug = suggestionMap[r.sourceContributionId];
        source = {
          suggestionId: r.sourceContributionId,
          suggestedByUserId: sug.userId,
          suggestedByUsername: usernameMap[sug.userId] ?? '',
          reason: sug.reason,
          reviewerUserId: sug.reviewedBy,
          reviewerUsername: sug.reviewedBy ? (usernameMap[sug.reviewedBy] ?? null) : null,
          reviewComment: sug.reviewComment,
        };
      }
      return {
        id: r.auditId,
        timestamp: r.createdAt,
        actorUserId: r.auditUserId ?? '',
        actorUsername: r.auditUserId ? (usernameMap[r.auditUserId] ?? null) : null,
        type,
        changes,
        source,
      };
    });

    const hasMore = mapped.length > limit;
    const items = mapped.slice(0, limit);
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  private _extractChanges(oldData: unknown, newData: unknown): ChangeHistoryItem['changes'] {
    if (!oldData && !newData) return [];
    const oObj = (oldData ?? {}) as Record<string, unknown>;
    const nObj = (newData ?? {}) as Record<string, unknown>;
    const changes: ChangeHistoryItem['changes'] = [];
    const allKeys = new Set([...Object.keys(oObj), ...Object.keys(nObj)]);
    for (const key of allKeys) {
      const o = oObj[key] ?? null;
      const n = nObj[key] ?? null;
      if (JSON.stringify(o) !== JSON.stringify(n)) {
        changes.push({
          entity: 'word',
          field: key,
          oldValue: o,
          newValue: n,
          displayOld: this._display(o),
          displayNew: this._display(n),
        });
      }
    }
    return changes;
  }

  private _display(val: unknown): string {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) return `[${val.length} items]`;
    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      if (typeof obj.lemma === 'string') return obj.lemma;
      if (typeof obj.translation_text === 'string') return obj.translation_text;
      if (typeof obj.definition === 'string') return obj.definition;
      return JSON.stringify(val);
    }
    return String(val);
  }
}
