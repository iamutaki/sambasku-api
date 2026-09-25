import { and, asc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import { generateId } from '@/shared/utils/ulid';
import {
  examples,
  languages,
  meaningTranslations,
  meanings,
  words,
} from '@/shared/database/drizzle/schema';
import {
  normalizeSplitParts,
  splitCommaParts,
} from '../application/utils/split-comma-parts';
import type {
  CommaSplitCandidates,
  CommaSplitLemmaCandidate,
  CommaSplitTranslationCandidate,
  LemmaSplitMeaningOverride,
  LemmaSplitResult,
} from '../domain/repositories/word.repository';
import type { WordStatus, WordType } from '../domain/entities/word.entity';

function alignLemmaOverrides(
  partCount: number,
  overrides: LemmaSplitMeaningOverride[] | undefined,
): LemmaSplitMeaningOverride[] {
  const needed = partCount - 1;
  if (!overrides) {
    return Array.from({ length: needed }, () => ({ mode: 'copy' }));
  }
  if (overrides.length !== needed) {
    throw new Error('OVERRIDE_COUNT_MISMATCH');
  }
  return overrides;
}

/**
 * Pecah lemma berkoma: entri asli rename ke parts[0], buat kata baru
 * untuk parts[1..]. Default menyalin makna. Override replace menulis
 * satu makna baru tanpa contoh, catatan, atau label sumber.
 */
export async function applyCommaSplitLemmaInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  wordId: string,
  parts: string[],
  overrides: LemmaSplitMeaningOverride[] | undefined,
  actorId: string,
): Promise<LemmaSplitResult> {
  const cleaned = normalizeSplitParts(parts);
  if (cleaned.length < 2) {
    throw new Error('PARTS_TOO_FEW');
  }
  const aligned = alignLemmaOverrides(cleaned.length, overrides);
  for (const ov of aligned) {
    if (ov.mode === 'replace' && ov.translationText.trim().length === 0) {
      throw new Error('REPLACE_TRANSLATION_REQUIRED');
    }
  }

  const [source] = await tx
    .select()
    .from(words)
    .where(and(eq(words.id, wordId), isNull(words.deletedAt)))
    .limit(1);
  if (!source) {
    throw new Error('WORD_NOT_FOUND');
  }

  const now = new Date();
  await tx
    .update(words)
    .set({
      lemma: cleaned[0],
      lemmaAllowsComma: false,
      updatedBy: actorId,
      updatedAt: now,
    })
    .where(eq(words.id, wordId));

  const sourceMeanings = await tx
    .select()
    .from(meanings)
    .where(and(eq(meanings.wordId, wordId), isNull(meanings.deletedAt)))
    .orderBy(asc(meanings.orderIndex));

  const translationsByMeaning = new Map<string, (typeof meaningTranslations.$inferSelect)[]>();
  const examplesByMeaning = new Map<string, (typeof examples.$inferSelect)[]>();
  let inheritedLanguageId: string | null = null;
  const meaningSnapshots: LemmaSplitResult['meanings'] = [];

  for (const m of sourceMeanings) {
    const translations = await tx
      .select()
      .from(meaningTranslations)
      .where(and(eq(meaningTranslations.meaningId, m.id), isNull(meaningTranslations.deletedAt)));
    translationsByMeaning.set(m.id, translations);
    if (!inheritedLanguageId && translations[0]) {
      inheritedLanguageId = translations[0].languageId;
    }

    const exRows = await tx
      .select()
      .from(examples)
      .where(and(eq(examples.meaningId, m.id), isNull(examples.deletedAt)));
    examplesByMeaning.set(m.id, exRows);

    const definition =
      m.isHaveDefinition && m.definition && m.definition !== '-' ? m.definition : null;
    meaningSnapshots.push({
      translationTexts: translations.map(
        (t: typeof meaningTranslations.$inferSelect) => t.translationText,
      ),
      definition,
    });
  }

  const needsReplace = aligned.some((ov) => ov.mode === 'replace');
  let targetLanguageId = inheritedLanguageId;
  if (needsReplace && !targetLanguageId) {
    const [indonesian] = await tx
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.code, 'id'))
      .limit(1);
    if (!indonesian) {
      throw new Error('INDONESIAN_LANGUAGE_NOT_FOUND');
    }
    targetLanguageId = indonesian.id;
  }

  const copiedGloss = meaningSnapshots
    .flatMap((m) => m.translationTexts)
    .join(' · ');
  const created: LemmaSplitResult['created'] = [];
  const firstMeaning = sourceMeanings[0];

  for (let i = 0; i < aligned.length; i++) {
    const lemma = cleaned[i + 1]!;
    const override = aligned[i]!;
    const replacing = override.mode === 'replace';
    const newWordId = generateId();
    await tx.insert(words).values({
      id: newWordId,
      languageId: source.languageId,
      lemma,
      lemmaAllowsComma: false,
      notes: replacing ? null : source.notes,
      wordType: source.wordType,
      usageLabels: replacing ? [] : (source.usageLabels ?? []),
      status: source.status,
      isVerified: source.isVerified,
      verifiedBy: source.verifiedBy,
      verifiedAt: source.verifiedAt,
      isCorrected: false,
      createdBy: actorId,
      updatedBy: actorId,
      updatedAt: now,
    });

    if (replacing) {
      const definitionText = override.definition?.trim() || '-';
      const hasDefinition = definitionText !== '-';
      const newMeaningId = generateId();
      await tx.insert(meanings).values({
        id: newMeaningId,
        wordId: newWordId,
        wordClassId: override.wordClassId,
        inheritedFromMeaningId: null,
        definition: definitionText,
        isHaveDefinition: hasDefinition,
        isHaveTranslation: true,
        orderIndex: 0,
        notes: null,
        status: firstMeaning?.status ?? source.status,
        isVerified: firstMeaning?.isVerified ?? source.isVerified,
        isCorrected: false,
        createdBy: actorId,
      });
      await tx.insert(meaningTranslations).values({
        meaningId: newMeaningId,
        languageId: targetLanguageId,
        translationText: override.translationText.trim(),
        translationType: 'direct',
        translationAllowsComma: false,
        createdBy: actorId,
      });
      created.push({
        wordId: newWordId,
        lemma,
        mode: 'replace',
        translationText: override.translationText.trim(),
        meaningSource: override.meaningSource,
      });
      continue;
    }

    for (const m of sourceMeanings) {
      const newMeaningId = generateId();
      await tx.insert(meanings).values({
        id: newMeaningId,
        wordId: newWordId,
        wordClassId: m.wordClassId,
        inheritedFromMeaningId: null,
        definition: m.definition,
        isHaveDefinition: m.isHaveDefinition,
        isHaveTranslation: m.isHaveTranslation,
        orderIndex: m.orderIndex,
        notes: m.notes,
        status: m.status,
        isVerified: m.isVerified,
        isCorrected: false,
        createdBy: actorId,
      });

      const translations = translationsByMeaning.get(m.id) ?? [];
      if (translations.length > 0) {
        await tx.insert(meaningTranslations).values(
          translations.map((t) => ({
            meaningId: newMeaningId,
            languageId: t.languageId,
            translationText: t.translationText,
            translationType: t.translationType,
            translationAllowsComma: t.translationAllowsComma ?? false,
            notes: t.notes,
            createdBy: actorId,
          })),
        );
      }

      const exRows = examplesByMeaning.get(m.id) ?? [];
      if (exRows.length > 0) {
        await tx.insert(examples).values(
          exRows.map((e) => ({
            meaningId: newMeaningId,
            sourceLanguageId: e.sourceLanguageId,
            sourceSentence: e.sourceSentence,
            targetLanguageId: e.targetLanguageId,
            targetSentence: e.targetSentence,
            sourceType: e.sourceType,
            sourceReference: e.sourceReference,
            notes: e.notes,
            status: e.status,
            isVerified: e.isVerified,
            isCorrected: false,
            createdBy: actorId,
          })),
        );
      }
    }

    created.push({
      wordId: newWordId,
      lemma,
      mode: 'copy',
      translationText: copiedGloss,
      meaningSource: 'copied',
    });
  }

  return {
    wordId,
    keptLemma: cleaned[0]!,
    oldLemma: source.lemma,
    meanings: meaningSnapshots,
    created,
  };
}

/**
 * Pecah terjemahan berkoma jadi beberapa makna: terjemahan sumber → parts[0],
 * makna baru (salin definisi/kelas) untuk parts[1..].
 */
export async function applyCommaSplitTranslationInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  meaningTranslationId: string,
  parts: string[],
  actorId: string,
): Promise<{ wordId: string; meaningIds: string[] }> {
  const cleaned = normalizeSplitParts(parts);
  if (cleaned.length < 2) {
    throw new Error('PARTS_TOO_FEW');
  }

  const [tr] = await tx
    .select()
    .from(meaningTranslations)
    .where(
      and(eq(meaningTranslations.id, meaningTranslationId), isNull(meaningTranslations.deletedAt)),
    )
    .limit(1);
  if (!tr) {
    throw new Error('TRANSLATION_NOT_FOUND');
  }

  const [meaning] = await tx
    .select()
    .from(meanings)
    .where(and(eq(meanings.id, tr.meaningId), isNull(meanings.deletedAt)))
    .limit(1);
  if (!meaning) {
    throw new Error('MEANING_NOT_FOUND');
  }

  const [word] = await tx
    .select({ id: words.id })
    .from(words)
    .where(and(eq(words.id, meaning.wordId), isNull(words.deletedAt)))
    .limit(1);
  if (!word) {
    throw new Error('WORD_NOT_FOUND');
  }

  const now = new Date();
  await tx
    .update(meaningTranslations)
    .set({
      translationText: cleaned[0],
      translationAllowsComma: false,
      updatedBy: actorId,
      updatedAt: now,
    })
    .where(eq(meaningTranslations.id, meaningTranslationId));

  const meaningIds = [meaning.id];

  const [maxRow] = await tx
    .select({ max: sql<number>`coalesce(max(${meanings.orderIndex}), -1)` })
    .from(meanings)
    .where(and(eq(meanings.wordId, meaning.wordId), isNull(meanings.deletedAt)));
  let nextOrder = Number(maxRow?.max ?? -1) + 1;

  for (const translation of cleaned.slice(1)) {
    const newMeaningId = generateId();
    await tx.insert(meanings).values({
      id: newMeaningId,
      wordId: meaning.wordId,
      wordClassId: meaning.wordClassId,
      inheritedFromMeaningId: null,
      definition: meaning.definition,
      isHaveDefinition: meaning.isHaveDefinition,
      isHaveTranslation: true,
      orderIndex: nextOrder++,
      notes: meaning.notes,
      status: meaning.status,
      isVerified: meaning.isVerified,
      isCorrected: false,
      createdBy: actorId,
    });

    await tx.insert(meaningTranslations).values({
      meaningId: newMeaningId,
      languageId: tr.languageId,
      translationText: translation,
      translationType: tr.translationType,
      translationAllowsComma: false,
      createdBy: actorId,
    });

    meaningIds.push(newMeaningId);
  }

  return { wordId: word.id, meaningIds };
}

export async function listCommaSplitCandidatesInDb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<CommaSplitCandidates> {
  const lemmaRows = await db
    .select({
      wordId: words.id,
      lemma: words.lemma,
      languageId: words.languageId,
      languageCode: languages.code,
      wordType: words.wordType,
      status: words.status,
      isVerified: words.isVerified,
    })
    .from(words)
    .innerJoin(languages, eq(words.languageId, languages.id))
    .where(
      and(isNull(words.deletedAt), eq(words.lemmaAllowsComma, false), like(words.lemma, '%,%')),
    )
    .orderBy(asc(sql`lower(${words.lemma})`));

  const lemmaWordIds = lemmaRows.map((r: { wordId: string }) => r.wordId);
  const meaningPreviewByWord = new Map<string, string[]>();
  const meaningsCountByWord = new Map<string, number>();
  const copiedTranslationByWord = new Map<string, string>();
  const copiedDefinitionByWord = new Map<string, string>();

  if (lemmaWordIds.length > 0) {
    const mRows = await db
      .select({
        wordId: meanings.wordId,
        definition: meanings.definition,
        isHaveDefinition: meanings.isHaveDefinition,
        meaningId: meanings.id,
      })
      .from(meanings)
      .where(and(inArray(meanings.wordId, lemmaWordIds), isNull(meanings.deletedAt)))
      .orderBy(asc(meanings.orderIndex));

    for (const m of mRows) {
      meaningsCountByWord.set(m.wordId, (meaningsCountByWord.get(m.wordId) ?? 0) + 1);
    }

    const meaningIds = mRows.map((m: { meaningId: string }) => m.meaningId);
    const tRows =
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

    const trByMeaning = new Map<string, string[]>();
    for (const t of tRows) {
      const list = trByMeaning.get(t.meaningId) ?? [];
      list.push(t.translationText);
      trByMeaning.set(t.meaningId, list);
    }

    for (const m of mRows) {
      const glosses = trByMeaning.get(m.meaningId) ?? [];
      if (!copiedTranslationByWord.has(m.wordId) && glosses[0]) {
        copiedTranslationByWord.set(m.wordId, glosses[0]);
      }
      if (
        !copiedDefinitionByWord.has(m.wordId) &&
        m.isHaveDefinition &&
        m.definition &&
        m.definition !== '-'
      ) {
        copiedDefinitionByWord.set(m.wordId, m.definition);
      }
      const preview =
        glosses.length > 0
          ? glosses
          : m.isHaveDefinition && m.definition && m.definition !== '-'
            ? [m.definition]
            : [];
      if (preview.length === 0) continue;
      const list = meaningPreviewByWord.get(m.wordId) ?? [];
      for (const g of preview) {
        if (!list.includes(g)) list.push(g);
      }
      meaningPreviewByWord.set(m.wordId, list);
    }
  }

  const lemmas: CommaSplitLemmaCandidate[] = [];
  for (const r of lemmaRows) {
    const suggestedParts = splitCommaParts(r.lemma);
    if (suggestedParts.length < 2) continue;
    lemmas.push({
      wordId: r.wordId,
      lemma: r.lemma,
      languageId: r.languageId,
      languageCode: r.languageCode,
      wordType: r.wordType as WordType,
      status: r.status as WordStatus,
      isVerified: r.isVerified,
      meaningsCount: meaningsCountByWord.get(r.wordId) ?? 0,
      suggestedParts,
      meaningPreview: meaningPreviewByWord.get(r.wordId) ?? [],
      copiedTranslation: copiedTranslationByWord.get(r.wordId) ?? '',
      copiedDefinition: copiedDefinitionByWord.get(r.wordId) ?? '',
    });
  }

  const translationRows = await db
    .select({
      meaningTranslationId: meaningTranslations.id,
      meaningId: meanings.id,
      wordId: words.id,
      lemma: words.lemma,
      translationText: meaningTranslations.translationText,
      languageId: meaningTranslations.languageId,
      languageCode: languages.code,
      definition: meanings.definition,
      wordClassId: meanings.wordClassId,
    })
    .from(meaningTranslations)
    .innerJoin(meanings, eq(meaningTranslations.meaningId, meanings.id))
    .innerJoin(words, eq(meanings.wordId, words.id))
    .innerJoin(languages, eq(meaningTranslations.languageId, languages.id))
    .where(
      and(
        isNull(meaningTranslations.deletedAt),
        isNull(meanings.deletedAt),
        isNull(words.deletedAt),
        eq(meaningTranslations.translationAllowsComma, false),
        like(meaningTranslations.translationText, '%,%'),
      ),
    )
    .orderBy(asc(sql`lower(${words.lemma})`));

  const translations: CommaSplitTranslationCandidate[] = [];
  for (const r of translationRows) {
    const suggestedParts = splitCommaParts(r.translationText);
    if (suggestedParts.length < 2) continue;
    translations.push({
      meaningTranslationId: r.meaningTranslationId,
      meaningId: r.meaningId,
      wordId: r.wordId,
      lemma: r.lemma,
      translationText: r.translationText,
      languageId: r.languageId,
      languageCode: r.languageCode,
      suggestedParts,
      definition: r.definition,
      wordClassId: r.wordClassId,
    });
  }

  return { lemmas, translations };
}
