import type { ProposedChanges } from '../../domain/entities/word-suggestion.entity';
import { NotFoundError, ConflictError } from '@/shared/errors/app-error';
import { db } from '@/shared/database/drizzle/client';
import {
  wordEditSuggestions,
  words,
  meanings,
  meaningTranslations,
  wordCategories,
  auditLogs,
  lexicalRelations,
  wordVariants,
  wordImages,
} from '@/shared/database/drizzle/schema';
import { eq, and, isNull } from 'drizzle-orm';

export interface ApplyResult {
  applied: boolean;
  changesApplied: number;
  wordLemma: string;
  wordId: string;
}

/**
 * Terapkan proposed_changes ke kata. Dipakai oleh approveSuggestion dan
 * correctSuggestion (publish=true).
 */
export async function applyChangesToWord(
  suggestionId: string,
  reviewerId: string,
  action: 'approve' | 'correct_and_publish',
  comment?: string,
  customChanges?: ProposedChanges,
): Promise<ApplyResult> {
  const suggestion = await db.query.wordEditSuggestions.findFirst({
    where: and(eq(wordEditSuggestions.id, suggestionId), isNull(wordEditSuggestions.deletedAt)),
    columns: { id: true, wordId: true, proposedChanges: true, status: true },
  });

  if (!suggestion) throw new NotFoundError('SUGGESTION_NOT_FOUND', 'Usulan tidak ditemukan');
  if (suggestion.status !== 'pending') {
    throw new ConflictError('SUGGESTION_ALREADY_REVIEWED', 'Usulan sudah pernah diverifikasi');
  }

  const changes = customChanges ?? (suggestion.proposedChanges as ProposedChanges);
  let changesApplied = 0;

  const word = await db.query.words.findFirst({
    where: and(eq(words.id, suggestion.wordId), isNull(words.deletedAt)),
    columns: { id: true, lemma: true, notes: true },
  });

  if (!word) throw new NotFoundError('WORD_NOT_FOUND', 'Kata tidak ditemukan');

  const oldAudit: Record<string, unknown> = {
    lemma: word.lemma,
    notes: word.notes,
  };
  const newAudit: Record<string, unknown> = {
    lemma: changes.lemma ?? word.lemma,
    notes: changes.notes ?? word.notes,
  };

  if (changes.lemma !== undefined && changes.lemma !== word.lemma) {
    await db
      .update(words)
      .set({ lemma: changes.lemma, updatedAt: new Date() })
      .where(eq(words.id, word.id));
    changesApplied++;
  }

  if (changes.notes !== undefined && changes.notes !== word.notes) {
    await db
      .update(words)
      .set({ notes: changes.notes, updatedAt: new Date() })
      .where(eq(words.id, word.id));
    changesApplied++;
  }

  if (changes.meanings && changes.meanings.length > 0) {
    const existingMeanings = await db.query.meanings.findMany({
      where: and(eq(meanings.wordId, word.id), isNull(meanings.deletedAt)),
      orderBy: (m, { asc }) => [asc(m.orderIndex)],
    });
    const existingMap = new Map(existingMeanings.map((m) => [m.id, m]));

    for (const mc of changes.meanings) {
      if (mc.action === 'add' && !mc.meaningId) {
        const newMeaning = await db
          .insert(meanings)
          .values({
            wordId: word.id,
            wordClassId: mc.wordClassId ?? null,
            definition: mc.definition ?? '',
            orderIndex: existingMeanings.length,
            createdBy: reviewerId,
          })
          .returning({ id: meanings.id });
        const newMeaningId = newMeaning[0]?.id;
        if (mc.translations && mc.translations.length > 0) {
          for (const t of mc.translations) {
            await db
              .insert(meaningTranslations)
              .values({
                meaningId: newMeaningId!,
                languageId: t.languageId,
                translationText: t.translationText,
                translationType: t.translationType ?? 'direct',
                createdBy: reviewerId,
              })
              .onConflictDoNothing();
          }
        }
        changesApplied++;
      } else if (mc.action === 'update' && mc.meaningId) {
        const existing = existingMap.get(mc.meaningId);
        if (existing) {
          if (mc.definition !== undefined && mc.definition !== existing.definition) {
            await db
              .update(meanings)
              .set({ definition: mc.definition, updatedAt: new Date() })
              .where(eq(meanings.id, mc.meaningId));
            changesApplied++;
          }
          if (mc.wordClassId !== undefined && mc.wordClassId !== existing.wordClassId) {
            await db
              .update(meanings)
              .set({ wordClassId: mc.wordClassId, updatedAt: new Date() })
              .where(eq(meanings.id, mc.meaningId));
            changesApplied++;
          }
          if (mc.translations && mc.translations.length > 0) {
            for (const t of mc.translations) {
              const exists = await db.query.meaningTranslations.findFirst({
                where: and(
                  eq(meaningTranslations.meaningId, mc.meaningId),
                  eq(meaningTranslations.languageId, t.languageId),
                  eq(meaningTranslations.translationText, t.translationText),
                ),
              });
              if (!exists) {
                await db
                  .insert(meaningTranslations)
                  .values({
                    meaningId: mc.meaningId,
                    languageId: t.languageId,
                    translationText: t.translationText,
                    translationType: t.translationType ?? 'direct',
                    createdBy: reviewerId,
                  })
                  .onConflictDoNothing();
                changesApplied++;
              }
            }
          }
        }
      } else if (mc.action === 'delete' && mc.meaningId) {
        await db
          .update(meanings)
          .set({ deletedAt: new Date(), deletedBy: reviewerId })
          .where(eq(meanings.id, mc.meaningId));
        changesApplied++;
      }
    }
  }

  if (changes.categoryIdsToAdd && changes.categoryIdsToAdd.length > 0) {
    for (const catId of changes.categoryIdsToAdd) {
      const exists = await db.query.wordCategories.findFirst({
        where: and(
          eq(wordCategories.wordId, word.id),
          eq(wordCategories.categoryId, catId),
          isNull(wordCategories.deletedAt),
        ),
      });
      if (!exists) {
        await db
          .insert(wordCategories)
          .values({ wordId: word.id, categoryId: catId })
          .onConflictDoNothing();
        changesApplied++;
      }
    }
  }

  if (changes.categoryIdsToRemove && changes.categoryIdsToRemove.length > 0) {
    for (const catId of changes.categoryIdsToRemove) {
      await db
        .update(wordCategories)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(wordCategories.wordId, word.id),
            eq(wordCategories.categoryId, catId),
            isNull(wordCategories.deletedAt),
          ),
        );
      changesApplied++;
    }
  }

  // Relations (Form A only)
  const relationAudit: { added: unknown[]; removed: unknown[] } = { added: [], removed: [] };
  if (changes.relations?.length) {
    for (const rel of changes.relations) {
      if (rel.wordId === word.id) continue;
      if (rel.action === 'add') {
        await db
          .insert(lexicalRelations)
          .values({
            sourceWordId: word.id,
            targetWordId: rel.wordId,
            relationType: rel.relationType,
            createdBy: reviewerId,
          })
          .onConflictDoNothing();
        if (rel.relationType === 'synonym') {
          await db
            .insert(lexicalRelations)
            .values({
              sourceWordId: rel.wordId,
              targetWordId: word.id,
              relationType: 'synonym',
              createdBy: reviewerId,
            })
            .onConflictDoNothing();
        }
        relationAudit.added.push(rel);
        changesApplied++;
      } else if (rel.action === 'remove') {
        await db
          .update(lexicalRelations)
          .set({ deletedAt: new Date(), deletedBy: reviewerId })
          .where(
            and(
              eq(lexicalRelations.sourceWordId, word.id),
              eq(lexicalRelations.targetWordId, rel.wordId),
              eq(lexicalRelations.relationType, rel.relationType),
              isNull(lexicalRelations.deletedAt),
            ),
          );
        if (rel.relationType === 'synonym') {
          await db
            .update(lexicalRelations)
            .set({ deletedAt: new Date(), deletedBy: reviewerId })
            .where(
              and(
                eq(lexicalRelations.sourceWordId, rel.wordId),
                eq(lexicalRelations.targetWordId, word.id),
                eq(lexicalRelations.relationType, 'synonym'),
                isNull(lexicalRelations.deletedAt),
              ),
            );
        }
        relationAudit.removed.push(rel);
        changesApplied++;
      }
    }
    newAudit.relations = relationAudit;
  }

  // Variants
  const variantAudit: { added: unknown[]; removed: unknown[] } = { added: [], removed: [] };
  if (changes.variants?.length) {
    for (const v of changes.variants) {
      const form = v.form.trim();
      if (v.action === 'add') {
        if (form.toLowerCase() === word.lemma.toLowerCase()) continue;
        await db
          .insert(wordVariants)
          .values({
            wordId: word.id,
            form,
            variantType: v.variantType ?? 'alternative',
            dialectId: v.dialectId ?? null,
            createdBy: reviewerId,
          })
          .onConflictDoNothing();
        variantAudit.added.push({ form, variant_type: v.variantType ?? 'alternative' });
        changesApplied++;
      } else if (v.action === 'remove') {
        const conditions = [
          eq(wordVariants.wordId, word.id),
          eq(wordVariants.form, form),
          isNull(wordVariants.deletedAt),
        ];
        await db
          .update(wordVariants)
          .set({ deletedAt: new Date(), deletedBy: reviewerId })
          .where(and(...conditions));
        variantAudit.removed.push({ form, variant_type: v.variantType ?? 'alternative' });
        changesApplied++;
      }
    }
    newAudit.variants = variantAudit;
  }

  // Images
  const imageAudit: { added: unknown[]; removed: unknown[]; set_primary: unknown[] } = {
    added: [],
    removed: [],
    set_primary: [],
  };
  if (changes.images?.length) {
    for (const img of changes.images) {
      if (img.action === 'add' && img.url && img.providerFileId) {
        if (img.isPrimary) {
          await db
            .update(wordImages)
            .set({ isPrimary: false })
            .where(and(eq(wordImages.wordId, word.id), isNull(wordImages.deletedAt)));
        }
        await db
          .insert(wordImages)
          .values({
            wordId: word.id,
            url: img.url,
            providerFileId: img.providerFileId,
            altText: img.altText ?? null,
            isPrimary: img.isPrimary ?? false,
            createdBy: reviewerId,
            status: 'published',
          })
          .onConflictDoNothing();
        imageAudit.added.push({ url: img.url, is_primary: img.isPrimary ?? false });
        changesApplied++;
      } else if (img.action === 'remove' && img.imageId) {
        await db
          .update(wordImages)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(wordImages.id, img.imageId),
              eq(wordImages.wordId, word.id),
              isNull(wordImages.deletedAt),
            ),
          );
        imageAudit.removed.push({ image_id: img.imageId });
        changesApplied++;
      } else if (img.action === 'set_primary' && img.imageId) {
        await db
          .update(wordImages)
          .set({ isPrimary: false })
          .where(and(eq(wordImages.wordId, word.id), isNull(wordImages.deletedAt)));
        await db
          .update(wordImages)
          .set({ isPrimary: true })
          .where(
            and(
              eq(wordImages.id, img.imageId),
              eq(wordImages.wordId, word.id),
              isNull(wordImages.deletedAt),
            ),
          );
        imageAudit.set_primary.push({ image_id: img.imageId });
        changesApplied++;
      }
    }
    newAudit.images = imageAudit;
  }

  const newStatus = action === 'approve' ? 'approved' : 'corrected';
  await db
    .update(wordEditSuggestions)
    .set({
      status: newStatus,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewComment: comment ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(wordEditSuggestions.id, suggestionId), isNull(wordEditSuggestions.deletedAt)));

  await db
    .insert(auditLogs)
    .values({
      userId: reviewerId,
      action: `suggest_edit_${action}`,
      entityType: 'word',
      entityId: word.id,
      oldData: oldAudit,
      newData: newAudit,
      requestId: null,
      sourceContributionId: suggestionId,
    })
    .onConflictDoNothing();

  return {
    applied: true,
    changesApplied,
    wordLemma: (changes.lemma ?? word.lemma) as string,
    wordId: word.id,
  };
}
