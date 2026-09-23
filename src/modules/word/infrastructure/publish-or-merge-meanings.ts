import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { examples, meanings, pronunciations, wordAudios, wordImages, words } from '@/shared/database/drizzle/schema';

export type PublishOrMergeResult = {
  wordId: string;
  mergedIntoWordId: string | null;
};

/**
 * Tayangkan kata, atau merge meanings ke published twin (lemma+bahasa sama)
 * lalu soft-delete sumber (12-api §8). Dipakai WordRepository + review approve.
 *
 * @param opts.skipPublishIfNoTwin - true kalau kata sudah published+verified
 *   (mis. correct publish lewat updateWithRelations). Tanpa twin: return cepat
 *   tanpa UPDATE words / publishWordChildren. Dengan twin: tetap merge.
 */
export async function publishOrMergeMeaningsInTx(
  // ponytail: Drizzle tx/db share query builder; avoid NodePg generic coupling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  wordId: string,
  actorId: string,
  opts?: { skipPublishIfNoTwin?: boolean },
): Promise<PublishOrMergeResult | null> {
  const now = new Date();
  const [word] = await tx
    .select()
    .from(words)
    .where(and(eq(words.id, wordId), isNull(words.deletedAt)))
    .limit(1);
  if (!word) return null;

  const [twin] = await tx
    .select({ id: words.id })
    .from(words)
    .where(
      and(
        eq(words.languageId, word.languageId),
        sql`lower(${words.lemma}) = lower(${word.lemma.trim()})`,
        eq(words.status, 'published'),
        isNull(words.deletedAt),
        ne(words.id, wordId),
      ),
    )
    .orderBy(asc(words.createdAt))
    .limit(1);

  if (!twin) {
    if (opts?.skipPublishIfNoTwin) {
      return { wordId, mergedIntoWordId: null };
    }
    // Sudah terverifikasi: tutup antrean tanpa menimpa siapa yang menandai.
    const preserve = word.isVerified === true && word.verifiedBy != null;
    await tx
      .update(words)
      .set({
        status: 'published',
        isVerified: true,
        verifiedBy: preserve ? word.verifiedBy : actorId,
        verifiedAt: preserve ? (word.verifiedAt ?? now) : now,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(and(eq(words.id, wordId), isNull(words.deletedAt)));
    await publishWordChildren(tx, wordId, actorId, now);
    return { wordId, mergedIntoWordId: null };
  }

  const [maxRow] = await tx
    .select({ max: sql<number>`coalesce(max(${meanings.orderIndex}), -1)` })
    .from(meanings)
    .where(and(eq(meanings.wordId, twin.id), isNull(meanings.deletedAt)));
  let nextOrder = Number(maxRow?.max ?? -1) + 1;

  const sourceMeanings = await tx
    .select({ id: meanings.id })
    .from(meanings)
    .where(and(eq(meanings.wordId, wordId), isNull(meanings.deletedAt)))
    .orderBy(asc(meanings.orderIndex));

  for (const m of sourceMeanings) {
    await tx
      .update(meanings)
      .set({
        wordId: twin.id,
        orderIndex: nextOrder++,
        status: 'published',
        isVerified: true,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(eq(meanings.id, m.id));
    await tx
      .update(examples)
      .set({
        status: 'published',
        isVerified: true,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(and(eq(examples.meaningId, m.id), isNull(examples.deletedAt)));
  }

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
    .where(eq(words.id, wordId));

  await tx
    .update(pronunciations)
    .set({ status: 'rejected', isVerified: false, updatedBy: actorId, updatedAt: now })
    .where(and(eq(pronunciations.wordId, wordId), isNull(pronunciations.deletedAt)));
  await tx
    .update(wordImages)
    .set({ status: 'rejected', isVerified: false })
    .where(and(eq(wordImages.wordId, wordId), isNull(wordImages.deletedAt)));
  await tx
    .update(wordAudios)
    .set({ status: 'rejected', isVerified: false })
    .where(and(eq(wordAudios.wordId, wordId), isNull(wordAudios.deletedAt)));

  return { wordId: twin.id, mergedIntoWordId: twin.id };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function publishWordChildren(tx: any, wordId: string, actorId: string, now: Date): Promise<void> {
  // Makna ikut gerbang kata: tanpa ini GET publik memfilter
  // status='published' → meanings:[] → key definition/translations hilang.
  await tx
    .update(meanings)
    .set({ status: 'published', isVerified: true, updatedBy: actorId, updatedAt: now })
    .where(and(eq(meanings.wordId, wordId), isNull(meanings.deletedAt)));
  // Set-based: subquery meaning ids - hemat 1 SELECT round-trip vs select lalu inArray.
  await tx
    .update(examples)
    .set({ status: 'published', isVerified: true, updatedBy: actorId, updatedAt: now })
    .where(
      and(
        isNull(examples.deletedAt),
        inArray(
          examples.meaningId,
          tx.select({ id: meanings.id }).from(meanings).where(and(eq(meanings.wordId, wordId), isNull(meanings.deletedAt))),
        ),
      ),
    );
  await tx
    .update(pronunciations)
    .set({ status: 'published', isVerified: true, updatedBy: actorId, updatedAt: now })
    .where(eq(pronunciations.wordId, wordId));
  await tx.update(wordImages).set({ status: 'published', isVerified: true }).where(eq(wordImages.wordId, wordId));
  await tx.update(wordAudios).set({ status: 'published', isVerified: true }).where(eq(wordAudios.wordId, wordId));
}
