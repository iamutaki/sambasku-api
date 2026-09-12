import { and, asc, desc, eq, ilike, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  categories,
  contributionReviews,
  contributions,
  dialects,
  examples,
  languages,
  lexicalRelations,
  meanings,
  meaningTranslations,
  pronunciations,
  wordCategories,
  wordClasses,
  wordImages,
  wordVariants,
  words,
} from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import { ValidationError } from '@/shared/errors/app-error';
import type { Word, WordDetail, WordStatus, WordSummary } from '../domain/entities/word.entity';
import type {
  CursorPage,
  MissingReferences,
  ReferenceCheck,
  SearchParams,
  WordRepository,
  WordToSave,
} from '../domain/repositories/word.repository';

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

function toWord(row: typeof words.$inferSelect): Word {
  return {
    id: row.id,
    languageId: row.languageId,
    lemma: row.lemma,
    notes: row.notes,
    wordType: row.wordType as Word['wordType'],
    status: row.status as WordStatus,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  };
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export class WordRepositoryImpl implements WordRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async saveWithRelations(word: WordToSave, actorId: string): Promise<Word> {
    try {
      return await this.db.transaction(async (tx) => {
        const [wordRow] = await tx
          .insert(words)
          .values({
            languageId: word.languageId,
            lemma: word.lemma.trim(),
            notes: word.notes ?? null,
            wordType: word.wordType,
            status: word.status,
            createdBy: actorId,
          })
          .returning();
        const wordId = wordRow.id;

        for (const meaning of word.meanings) {
          const [meaningRow] = await tx
            .insert(meanings)
            .values({
              wordId,
              wordClassId: meaning.wordClassId,
              definition: meaning.definition,
              orderIndex: meaning.orderIndex,
              createdBy: actorId,
            })
            .returning();
          const meaningId = meaningRow.id;

          if (meaning.translations.length > 0) {
            await tx.insert(meaningTranslations).values(
              meaning.translations.map((t) => ({
                meaningId,
                languageId: t.languageId,
                translationText: t.translationText,
                translationType: t.translationType,
                createdBy: actorId,
              })),
            );
          }
          if (meaning.examples && meaning.examples.length > 0) {
            await tx.insert(examples).values(
              meaning.examples.map((e) => ({
                meaningId,
                sourceLanguageId: e.sourceLanguageId,
                sourceSentence: e.sourceSentence,
                targetLanguageId: e.targetLanguageId ?? null,
                targetSentence: e.targetSentence ?? null,
                sourceType: e.sourceType ?? null,
                createdBy: actorId,
              })),
            );
          }
        }

        if (word.categoryIds.length > 0) {
          await tx
            .insert(wordCategories)
            .values(word.categoryIds.map((categoryId) => ({ wordId, categoryId })));
        }

        // Relasi leksikal ber-tipe: synonym | antonym | has_component | derived_from.
        // Arah: source = entri ini, target = entri lain (has_component: frasa → komponen)
        if (word.relatedWords.length > 0) {
          await tx.insert(lexicalRelations).values(
            word.relatedWords.map((rel) => ({
              sourceWordId: wordId,
              targetWordId: rel.wordId,
              relationType: rel.relationType,
              createdBy: actorId,
            })),
          );
        }

        // Bentuk surface (mis. "memakan" milik entri "makan") + afiks terstruktur
        if (word.variants && word.variants.length > 0) {
          await tx.insert(wordVariants).values(
            word.variants.map((v) => ({
              wordId,
              form: v.form,
              variantType: v.variantType,
              affixType: v.affixType ?? null,
              affixValue: v.affixValue ?? null,
              dialectId: v.dialectId ?? null,
              notes: v.notes ?? null,
              createdBy: actorId,
            })),
          );
        }

        if (word.pronunciation) {
          await tx.insert(pronunciations).values({
            wordId,
            dialectId: word.dialectId ?? null, // dialek tersimpan di level pengucapan
            notation: word.pronunciation.notation,
            value: word.pronunciation.value,
            createdBy: actorId,
          });
        }

        // Gambar contoh (referensi hasil direct-upload, Section 8) —
        // nama provider datang dari dto (diisi controller dari provider aktif)
        if (word.images && word.images.length > 0) {
          await tx.insert(wordImages).values(
            word.images.map((img) => ({
              wordId,
              provider: img.provider,
              providerFileId: img.providerFileId,
              url: img.url,
              altText: img.altText ?? null,
              isPrimary: img.isPrimary ?? false,
              createdBy: actorId,
            })),
          );
        }

        // Catat kontribusi; kata pending langsung dapat baris review
        const [contribution] = await tx
          .insert(contributions)
          .values({
            userId: actorId,
            entityType: 'word',
            entityId: wordId,
            action: 'create',
          })
          .returning();
        if (word.status === 'pending_review') {
          await tx.insert(contributionReviews).values({
            contributionId: contribution.id,
            status: 'pending',
          });
        }

        return toWord(wordRow);
      });
    } catch (err) {
      // Race FK: id valid saat pre-check, tapi terhapus sebelum transaksi
      // jalan — petakan ke VALIDATION_ERROR, jangan bocor jadi 500
      const code = (err as { cause?: { code?: string } }).cause?.code;
      if (code === FOREIGN_KEY_VIOLATION) {
        throw new ValidationError([
          { field: '', message: 'Referensi data tidak valid (data terkait mungkin sudah dihapus)' },
        ]);
      }
      // Duplikat unik (kategori sama 2×, terjemahan identik, file gambar
      // sudah dipakai kata lain) → juga 400, bukan 500
      if (code === UNIQUE_VIOLATION) {
        throw new ValidationError([
          { field: '', message: 'Data duplikat — kategori/terjemahan/gambar yang sama sudah dipakai' },
        ]);
      }
      throw err;
    }
  }

  async findDuplicate(languageId: string, lemma: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: words.id })
      .from(words)
      .where(
        and(
          eq(words.languageId, languageId),
          sql`lower(${words.lemma}) = lower(${lemma.trim()})`,
          isNull(words.deletedAt),
        ),
      )
      .limit(1);
    return !!row;
  }

  async findDetailById(id: string): Promise<WordDetail | null> {
    const [wordRow] = await this.db
      .select()
      .from(words)
      .where(and(eq(words.id, id), eq(words.status, 'published'), isNull(words.deletedAt)))
      .limit(1);
    if (!wordRow) return null;

    const meaningRows = await this.db
      .select()
      .from(meanings)
      .where(and(eq(meanings.wordId, id), isNull(meanings.deletedAt)))
      .orderBy(meanings.orderIndex);

    const meaningIds = meaningRows.map((m) => m.id);

    const translationRows =
      meaningIds.length > 0
        ? await this.db
            .select()
            .from(meaningTranslations)
            .where(
              and(inArray(meaningTranslations.meaningId, meaningIds), isNull(meaningTranslations.deletedAt)),
            )
        : [];

    const exampleRows =
      meaningIds.length > 0
        ? await this.db
            .select()
            .from(examples)
            .where(and(inArray(examples.meaningId, meaningIds), isNull(examples.deletedAt)))
        : [];

    const categoryRows = await this.db
      .select({ id: categories.id, name: categories.name })
      .from(wordCategories)
      .innerJoin(categories, eq(wordCategories.categoryId, categories.id))
      .where(eq(wordCategories.wordId, id));

    const pronRows = await this.db
      .select()
      .from(pronunciations)
      .where(and(eq(pronunciations.wordId, id), isNull(pronunciations.deletedAt)));

    const imageRows = await this.db
      .select()
      .from(wordImages)
      .where(and(eq(wordImages.wordId, id), isNull(wordImages.deletedAt)));

    // Relasi maju (entri ini → entri lain) + lemma target
    const relatedRows = await this.db
      .select({
        wordId: lexicalRelations.targetWordId,
        relationType: lexicalRelations.relationType,
        lemma: words.lemma,
      })
      .from(lexicalRelations)
      .innerJoin(words, eq(words.id, lexicalRelations.targetWordId))
      .where(eq(lexicalRelations.sourceWordId, id));

    // Relasi invers (entri lain → entri ini): "muncul dalam" — derived, tak disimpan
    const appearsRows = await this.db
      .select({
        wordId: lexicalRelations.sourceWordId,
        relationType: lexicalRelations.relationType,
        lemma: words.lemma,
      })
      .from(lexicalRelations)
      .innerJoin(words, eq(words.id, lexicalRelations.sourceWordId))
      .where(eq(lexicalRelations.targetWordId, id));

    const variantRows = await this.db
      .select()
      .from(wordVariants)
      .where(and(eq(wordVariants.wordId, id), isNull(wordVariants.deletedAt)));

    return {
      ...toWord(wordRow),
      meanings: meaningRows.map((m) => ({
        id: m.id,
        wordId: m.wordId,
        wordClassId: m.wordClassId,
        definition: m.definition,
        orderIndex: m.orderIndex,
        notes: m.notes,
        translations: translationRows
          .filter((t) => t.meaningId === m.id)
          .map((t) => ({
            languageId: t.languageId,
            translationText: t.translationText,
            translationType: t.translationType,
          })),
        examples: exampleRows
          .filter((e) => e.meaningId === m.id)
          .map((e) => ({
            sourceLanguageId: e.sourceLanguageId,
            sourceSentence: e.sourceSentence,
            targetLanguageId: e.targetLanguageId,
            targetSentence: e.targetSentence,
            sourceType: e.sourceType,
          })),
      })),
      categories: categoryRows,
      pronunciations: pronRows.map((p) => ({
        id: p.id,
        notation: p.notation,
        value: p.value,
        dialectId: p.dialectId,
      })),
      images: imageRows.map((i) => ({
        url: i.url,
        altText: i.altText,
        isPrimary: i.isPrimary,
      })),
      relatedWords: relatedRows,
      appearsIn: appearsRows,
      variants: variantRows.map((v) => ({
        id: v.id,
        form: v.form,
        variantType: v.variantType,
        affixType: v.affixType,
        affixValue: v.affixValue,
        dialectId: v.dialectId,
        notes: v.notes,
      })),
    };
  }

  // Cursor-based (Section 13): cursor = ULID id item terakhir, id DESC,
  // fetch limit+1 untuk has_more — tanpa OFFSET, tanpa COUNT(*).
  // Dua arah: 'lemma' (Sambas→Indonesia, default) atau 'translation'
  // (Indonesia→Sambas: cari meaning_translations.translation_text,
  // hasil = kata Sambas-nya + teks terjemahan yang cocok)
  async search(params: SearchParams): Promise<CursorPage<WordSummary>> {
    if (params.searchIn === 'translation') {
      return this.searchByTranslation(params);
    }

    const where = and(
      isNull(words.deletedAt),
      params.q ? ilike(words.lemma, `%${escapeLike(params.q.trim())}%`) : undefined,
      params.wordType ? eq(words.wordType, params.wordType) : undefined,
      params.cursor ? lt(words.id, params.cursor) : undefined,
    );

    const rows = await this.db
      .select({
        id: words.id,
        lemma: words.lemma,
        languageId: words.languageId,
        languageCode: languages.code,
        wordType: words.wordType,
        status: words.status,
      })
      .from(words)
      .innerJoin(languages, eq(words.languageId, languages.id))
      .where(where)
      .orderBy(desc(words.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page = (hasMore ? rows.slice(0, params.limit) : rows).map((r) => ({
      id: r.id,
      lemma: r.lemma,
      languageId: r.languageId,
      languageCode: r.languageCode,
      wordType: r.wordType as Word['wordType'],
      status: r.status as WordStatus,
    }));

    return {
      items: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  private async searchByTranslation(params: SearchParams): Promise<CursorPage<WordSummary>> {
    const where = and(
      isNull(words.deletedAt),
      isNull(meanings.deletedAt),
      isNull(meaningTranslations.deletedAt),
      params.q
        ? ilike(meaningTranslations.translationText, `%${escapeLike(params.q.trim())}%`)
        : undefined,
      params.translationLanguageId
        ? eq(meaningTranslations.languageId, params.translationLanguageId)
        : undefined,
      params.wordType ? eq(words.wordType, params.wordType) : undefined,
      params.cursor ? lt(words.id, params.cursor) : undefined,
    );

    // DISTINCT ON (words.id): satu kata bisa punya banyak makna yang cocok —
    // ambil satu baris per kata (ORDER BY harus diawali words.id).
    // Sort kedua: translation_text ASC → terjemahan TERPENDEK yang cocok
    // (paling mendekati query) dipilih secara deterministik
    const rows = await this.db
      .selectDistinctOn([words.id], {
        id: words.id,
        lemma: words.lemma,
        languageId: words.languageId,
        languageCode: languages.code,
        wordType: words.wordType,
        status: words.status,
        matchedTranslation: meaningTranslations.translationText,
      })
      .from(words)
      .innerJoin(meanings, eq(meanings.wordId, words.id))
      .innerJoin(meaningTranslations, eq(meaningTranslations.meaningId, meanings.id))
      .innerJoin(languages, eq(words.languageId, languages.id))
      .where(where)
      .orderBy(desc(words.id), asc(meaningTranslations.translationText))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page = (hasMore ? rows.slice(0, params.limit) : rows).map((r) => ({
      id: r.id,
      lemma: r.lemma,
      languageId: r.languageId,
      languageCode: r.languageCode,
      wordType: r.wordType as Word['wordType'],
      status: r.status as WordStatus,
      matchedTranslation: r.matchedTranslation,
    }));

    return {
      items: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  async findMissingReferences(refs: ReferenceCheck): Promise<MissingReferences> {
    const languageExists = await this.exists(languages, refs.languageId);
    const dialectExists = refs.dialectId ? await this.exists(dialects, refs.dialectId) : true;

    const uniqueIds = (ids: string[]) => [...new Set(ids)];

    // Entri terkait harus ada DAN belum soft-deleted
    const relatedIds = uniqueIds(refs.relatedWordIds);
    let missingRelated: string[] = [];
    if (relatedIds.length > 0) {
      const rows = await this.db
        .select({ id: words.id })
        .from(words)
        .where(and(inArray(words.id, relatedIds), isNull(words.deletedAt)));
      const found = new Set(rows.map((r) => r.id));
      missingRelated = relatedIds.filter((id) => !found.has(id));
    }

    // Dialek yang dipakai variants (dialect utama dicek via exists di bawah)
    let missingDialects: string[] = [];
    if (refs.variantDialectIds.length > 0) {
      const rows = await this.db
        .select({ id: dialects.id })
        .from(dialects)
        .where(inArray(dialects.id, uniqueIds(refs.variantDialectIds)));
      const found = new Set(rows.map((r) => r.id));
      missingDialects = uniqueIds(refs.variantDialectIds).filter((id) => !found.has(id));
    }

    return {
      languageId: !languageExists,
      dialectId: !dialectExists,
      languages: await this.missingIds(languages, uniqueIds(refs.languageIds)),
      wordClasses: await this.missingIds(wordClasses, uniqueIds(refs.wordClassIds)),
      categories: await this.missingIds(categories, uniqueIds(refs.categoryIds)),
      words: missingRelated,
      dialects: missingDialects,
    };
  }

  async listWordClasses() {
    const rows = await this.db
      .select()
      .from(wordClasses)
      .orderBy(wordClasses.code);
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, parentId: r.parentId }));
  }

  private async exists(table: typeof languages | typeof dialects, id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
    return !!row;
  }

  private async missingIds(
    table: typeof languages | typeof wordClasses | typeof categories | typeof words,
    ids: string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select({ id: table.id }).from(table).where(inArray(table.id, ids));
    const found = new Set(rows.map((r) => r.id));
    return ids.filter((id) => !found.has(id));
  }
}
