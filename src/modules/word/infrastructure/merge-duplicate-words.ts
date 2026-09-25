import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  bookmarks,
  comments,
  lexicalRelations,
  meanings,
  pronunciations,
  wordAudios,
  wordCategories,
  wordImages,
  wordVariants,
  words,
} from '@/shared/database/drizzle/schema';

/**
 * Gabung manual beberapa entri lemma sama ke satu penunggu (tab Duplikasi).
 * Beda dari publishOrMergeMeanings: penjaga dipilih admin, media ikut pindah,
 * status/verifikasi penjaga tidak diubah.
 */
export async function mergeDuplicateWordsInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  keepWordId: string,
  mergeWordIds: string[],
  actorId: string,
): Promise<{ keepWordId: string; mergedWordIds: string[] }> {
  const now = new Date();
  const sourceIds = [...new Set(mergeWordIds.filter((id) => id !== keepWordId))];
  if (sourceIds.length === 0) {
    return { keepWordId, mergedWordIds: [] };
  }

  const [keep] = await tx
    .select()
    .from(words)
    .where(and(eq(words.id, keepWordId), isNull(words.deletedAt)))
    .limit(1);
  if (!keep) {
    throw new Error('KEEP_NOT_FOUND');
  }

  const sources = await tx
    .select()
    .from(words)
    .where(and(inArray(words.id, sourceIds), isNull(words.deletedAt)));

  if (sources.length !== sourceIds.length) {
    throw new Error('SOURCE_NOT_FOUND');
  }

  const keepLemma = keep.lemma.trim().toLowerCase();
  for (const src of sources) {
    if (src.languageId !== keep.languageId || src.lemma.trim().toLowerCase() !== keepLemma) {
      throw new Error('LEMMA_MISMATCH');
    }
  }

  const [maxRow] = await tx
    .select({ max: sql<number>`coalesce(max(${meanings.orderIndex}), -1)` })
    .from(meanings)
    .where(and(eq(meanings.wordId, keepWordId), isNull(meanings.deletedAt)));
  let nextOrder = Number(maxRow?.max ?? -1) + 1;

  for (const sourceId of sourceIds) {
    const sourceMeanings = await tx
      .select({ id: meanings.id })
      .from(meanings)
      .where(and(eq(meanings.wordId, sourceId), isNull(meanings.deletedAt)))
      .orderBy(asc(meanings.orderIndex));

    for (const m of sourceMeanings) {
      await tx
        .update(meanings)
        .set({
          wordId: keepWordId,
          orderIndex: nextOrder++,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(meanings.id, m.id));
    }

    // Pelafalan - skip baris yang bentrok unique
    const keepPronKeys = new Set(
      (
        await tx
          .select({
            dialectId: pronunciations.dialectId,
            notation: pronunciations.notation,
            value: pronunciations.value,
          })
          .from(pronunciations)
          .where(and(eq(pronunciations.wordId, keepWordId), isNull(pronunciations.deletedAt)))
      ).map((p: { dialectId: string | null; notation: string; value: string }) =>
        `${p.dialectId ?? ''}\0${p.notation}\0${p.value}`,
      ),
    );
    const srcPron = await tx
      .select()
      .from(pronunciations)
      .where(and(eq(pronunciations.wordId, sourceId), isNull(pronunciations.deletedAt)));
    for (const p of srcPron) {
      const key = `${p.dialectId ?? ''}\0${p.notation}\0${p.value}`;
      if (keepPronKeys.has(key)) continue;
      await tx
        .update(pronunciations)
        .set({ wordId: keepWordId, updatedBy: actorId, updatedAt: now })
        .where(eq(pronunciations.id, p.id));
      keepPronKeys.add(key);
    }

    // Gambar - skip bentrok (word_id, provider, provider_file_id)
    const keepImgKeys = new Set(
      (
        await tx
          .select({
            provider: wordImages.provider,
            providerFileId: wordImages.providerFileId,
          })
          .from(wordImages)
          .where(and(eq(wordImages.wordId, keepWordId), isNull(wordImages.deletedAt)))
      ).map((i: { provider: string; providerFileId: string }) => `${i.provider}\0${i.providerFileId}`),
    );
    const srcImg = await tx
      .select()
      .from(wordImages)
      .where(and(eq(wordImages.wordId, sourceId), isNull(wordImages.deletedAt)));
    for (const img of srcImg) {
      const key = `${img.provider}\0${img.providerFileId}`;
      if (keepImgKeys.has(key)) continue;
      await tx
        .update(wordImages)
        .set({ wordId: keepWordId })
        .where(eq(wordImages.id, img.id));
      keepImgKeys.add(key);
    }

    // Audio - unique global (provider, file); cukup pindah word_id
    await tx
      .update(wordAudios)
      .set({ wordId: keepWordId })
      .where(and(eq(wordAudios.wordId, sourceId), isNull(wordAudios.deletedAt)));

    // Variasi penulisan
    const keepVarKeys = new Set(
      (
        await tx
          .select({ form: wordVariants.form, dialectId: wordVariants.dialectId })
          .from(wordVariants)
          .where(and(eq(wordVariants.wordId, keepWordId), isNull(wordVariants.deletedAt)))
      ).map((v: { form: string; dialectId: string | null }) => `${v.form}\0${v.dialectId ?? ''}`),
    );
    const srcVar = await tx
      .select()
      .from(wordVariants)
      .where(and(eq(wordVariants.wordId, sourceId), isNull(wordVariants.deletedAt)));
    for (const v of srcVar) {
      const key = `${v.form}\0${v.dialectId ?? ''}`;
      if (keepVarKeys.has(key)) continue;
      await tx
        .update(wordVariants)
        .set({ wordId: keepWordId, updatedBy: actorId, updatedAt: now })
        .where(eq(wordVariants.id, v.id));
      keepVarKeys.add(key);
    }

    // Kategori - composite PK; skip yang sudah ada di keep
    const keepCats = new Set(
      (
        await tx
          .select({ categoryId: wordCategories.categoryId })
          .from(wordCategories)
          .where(and(eq(wordCategories.wordId, keepWordId), isNull(wordCategories.deletedAt)))
      ).map((c: { categoryId: string }) => c.categoryId),
    );
    const srcCats = await tx
      .select()
      .from(wordCategories)
      .where(and(eq(wordCategories.wordId, sourceId), isNull(wordCategories.deletedAt)));
    for (const c of srcCats) {
      if (keepCats.has(c.categoryId)) {
        await tx
          .update(wordCategories)
          .set({ deletedAt: now })
          .where(and(eq(wordCategories.wordId, sourceId), eq(wordCategories.categoryId, c.categoryId)));
        continue;
      }
      // SQLite: tidak bisa update PK sebagian dengan aman di semua driver -
      // soft-delete sumber + insert ke keep.
      await tx
        .update(wordCategories)
        .set({ deletedAt: now })
        .where(and(eq(wordCategories.wordId, sourceId), eq(wordCategories.categoryId, c.categoryId)));
      await tx.insert(wordCategories).values({
        wordId: keepWordId,
        categoryId: c.categoryId,
        deletedAt: null,
      });
      keepCats.add(c.categoryId);
    }

    // Relasi leksikal (source & target)
    await reassignLexicalRelations(tx, sourceId, keepWordId, now, actorId);

    // Komentar
    await tx.update(comments).set({ wordId: keepWordId }).where(eq(comments.wordId, sourceId));

    // Bookmark - skip user yang sudah bookmark keep
    const keepBookUsers = new Set(
      (
        await tx
          .select({ userId: bookmarks.userId })
          .from(bookmarks)
          .where(eq(bookmarks.wordId, keepWordId))
      ).map((b: { userId: string }) => b.userId),
    );
    const srcBooks = await tx.select().from(bookmarks).where(eq(bookmarks.wordId, sourceId));
    for (const b of srcBooks) {
      if (keepBookUsers.has(b.userId)) {
        await tx.delete(bookmarks).where(eq(bookmarks.id, b.id));
      } else {
        await tx.update(bookmarks).set({ wordId: keepWordId }).where(eq(bookmarks.id, b.id));
        keepBookUsers.add(b.userId);
      }
    }

    // Soft-delete sumber
    await tx
      .update(words)
      .set({
        status: 'rejected',
        isVerified: false,
        deletedAt: now,
        deletedBy: actorId,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(eq(words.id, sourceId));
  }

  return { keepWordId, mergedWordIds: sourceIds };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reassignLexicalRelations(
  tx: any,
  sourceId: string,
  keepWordId: string,
  now: Date,
  actorId: string,
): Promise<void> {
  const asSource = await tx
    .select()
    .from(lexicalRelations)
    .where(and(eq(lexicalRelations.sourceWordId, sourceId), isNull(lexicalRelations.deletedAt)));
  for (const rel of asSource) {
    const newTarget = rel.targetWordId === sourceId ? keepWordId : rel.targetWordId;
    if (keepWordId === newTarget) {
      await tx
        .update(lexicalRelations)
        .set({ deletedAt: now, deletedBy: actorId })
        .where(eq(lexicalRelations.id, rel.id));
      continue;
    }
    const [dup] = await tx
      .select({ id: lexicalRelations.id })
      .from(lexicalRelations)
      .where(
        and(
          eq(lexicalRelations.sourceWordId, keepWordId),
          eq(lexicalRelations.targetWordId, newTarget),
          eq(lexicalRelations.relationType, rel.relationType),
          isNull(lexicalRelations.deletedAt),
        ),
      )
      .limit(1);
    if (dup) {
      await tx
        .update(lexicalRelations)
        .set({ deletedAt: now, deletedBy: actorId })
        .where(eq(lexicalRelations.id, rel.id));
    } else {
      await tx
        .update(lexicalRelations)
        .set({ sourceWordId: keepWordId, targetWordId: newTarget })
        .where(eq(lexicalRelations.id, rel.id));
    }
  }

  const asTarget = await tx
    .select()
    .from(lexicalRelations)
    .where(
      and(
        eq(lexicalRelations.targetWordId, sourceId),
        ne(lexicalRelations.sourceWordId, sourceId),
        isNull(lexicalRelations.deletedAt),
      ),
    );
  for (const rel of asTarget) {
    const newSource = rel.sourceWordId === sourceId ? keepWordId : rel.sourceWordId;
    if (newSource === keepWordId) {
      await tx
        .update(lexicalRelations)
        .set({ deletedAt: now, deletedBy: actorId })
        .where(eq(lexicalRelations.id, rel.id));
      continue;
    }
    const [dup] = await tx
      .select({ id: lexicalRelations.id })
      .from(lexicalRelations)
      .where(
        and(
          eq(lexicalRelations.sourceWordId, newSource),
          eq(lexicalRelations.targetWordId, keepWordId),
          eq(lexicalRelations.relationType, rel.relationType),
          isNull(lexicalRelations.deletedAt),
        ),
      )
      .limit(1);
    if (dup) {
      await tx
        .update(lexicalRelations)
        .set({ deletedAt: now, deletedBy: actorId })
        .where(eq(lexicalRelations.id, rel.id));
    } else {
      await tx
        .update(lexicalRelations)
        .set({ targetWordId: keepWordId })
        .where(eq(lexicalRelations.id, rel.id));
    }
  }
}
