import { and, asc, desc, eq, ilike, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NodePgDatabase, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import {
  categories,
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
import type { ChildStatus, Word, WordDetail, WordStatus, WordSummary } from '../domain/entities/word.entity';
import type {
  CursorPage,
  ExampleMedia,
  InlineCreatedWordSummary,
  MissingReferences,
  PronunciationMedia,
  ReferenceCheck,
  ResolvedInlineRelation,
  SaveWithInlineResult,
  SearchParams,
  WordImageMedia,
  WordRepository,
  WordToSave,
} from '../domain/repositories/word.repository';
import type { CreateWordRelatedDto } from '../application/dto/create-word.dto';

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

// Tipe transaction Drizzle (pg) - dipakai helper yang menerima tx
type Tx = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

function toWord(row: typeof words.$inferSelect): Word {
  return {
    id: row.id,
    languageId: row.languageId,
    lemma: row.lemma,
    notes: row.notes,
    wordType: row.wordType as Word['wordType'],
    status: row.status as WordStatus,
    isVerified: row.isVerified,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    isCorrected: row.isCorrected,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  };
}

function toPronunciation(row: typeof pronunciations.$inferSelect): PronunciationMedia {
  return {
    id: row.id,
    wordId: row.wordId,
    dialectId: row.dialectId,
    notation: row.notation,
    value: row.value,
    audioUrl: row.audioUrl,
    speakerName: row.speakerName,
    notes: row.notes,
    status: row.status as ChildStatus,
    isVerified: row.isVerified,
    isCorrected: row.isCorrected,
  };
}

function toWordImage(row: typeof wordImages.$inferSelect): WordImageMedia {
  return {
    id: row.id,
    wordId: row.wordId,
    provider: row.provider,
    providerFileId: row.providerFileId,
    url: row.url,
    altText: row.altText,
    isPrimary: row.isPrimary,
    status: row.status as ChildStatus,
    isVerified: row.isVerified,
    isCorrected: row.isCorrected,
  };
}

function toExample(row: typeof examples.$inferSelect): ExampleMedia {
  return {
    id: row.id,
    meaningId: row.meaningId,
    sourceLanguageId: row.sourceLanguageId,
    sourceSentence: row.sourceSentence,
    targetLanguageId: row.targetLanguageId,
    targetSentence: row.targetSentence,
    sourceType: row.sourceType,
    notes: row.notes,
    status: row.status as ChildStatus,
    isVerified: row.isVerified,
    isCorrected: row.isCorrected,
  };
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// Anak yang ikut submit kata mengikuti gerbang kata-nya (Section 22 -
// approval gate): kata pending → anak pending; approve/reject kata ikut
// memutuskan nasib anak-anaknya (lihat ContributionRepositoryImpl.review).
function childStatusOf(wordStatus: WordStatus): ChildStatus {
  return wordStatus === 'published' ? 'published' : 'pending_review';
}

// Status baris contributions - turunan dari status entity
function contributionStatusOf(entityStatus: string): 'pending' | 'approved' {
  return entityStatus === 'pending_review' ? 'pending' : 'approved';
}

// Mapping error PostgreSQL untuk insert kontribusi media - jangan bocor 500
function mapMediaViolation(err: unknown, uniqueField: string): void {
  const code = (err as { cause?: { code?: string } }).cause?.code;
  if (code === FOREIGN_KEY_VIOLATION) {
    throw new ValidationError([
      { field: '', message: 'Referensi data tidak valid (data terkait mungkin sudah dihapus)' },
    ]);
  }
  if (code === UNIQUE_VIOLATION) {
    throw new ValidationError([{ field: uniqueField, message: 'Data duplikat - sudah ada entri yang sama' }]);
  }
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
            isVerified: word.isVerified,
            isCorrected: word.isCorrected ?? false,
            createdBy: actorId,
          })
          .returning();
        const wordId = wordRow.id;

        await this.insertChildren(tx, wordId, word, actorId);

        // Catat kontribusi (Section 22 - approval gate): status antrean
        // turunan dari status entity; baris contribution_reviews dibuat
        // saat verifikator mengambil keputusan (modul contribution)
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word',
          entityId: wordId,
          action: 'create',
          status: contributionStatusOf(word.status),
        });

        return toWord(wordRow);
      });
    } catch (err) {
      // Race FK: id valid saat pre-check, tapi terhapus sebelum transaksi
      // jalan - petakan ke VALIDATION_ERROR, jangan bocor jadi 500
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
          { field: '', message: 'Data duplikat - kategori/terjemahan/gambar yang sama sudah dipakai' },
        ]);
      }
      throw err;
    }
  }

  /**
   * 04-api-sinonim-inline.md - induk + N kata inline dalam SATU transaksi:
   * 1) induk + anak2 + id makna induk utk provenance; 2) tiap kata inline
   * + makna hasil resolusi (kelola inherited_from_meaning_id); 3) relasi
   * lexical (source=induk, target=inline); 4) contributions satu per entitas.
   */
  async saveWithInlineRelations(
    word: WordToSave,
    actorId: string,
    related: ResolvedInlineRelation[],
  ): Promise<SaveWithInlineResult> {
    try {
      return await this.db.transaction(async (tx) => {
        // 1) INDUK + children; kumpulkan id makna induk (index = posisi array)
        const [wordRow] = await tx
          .insert(words)
          .values({
            languageId: word.languageId,
            lemma: word.lemma.trim(),
            notes: word.notes ?? null,
            wordType: word.wordType,
            status: word.status,
            isVerified: word.isVerified,
            isCorrected: word.isCorrected ?? false,
            createdBy: actorId,
          })
          .returning();
        const wordId = wordRow.id;

        const parentMeaningIds: string[] = [];
        await this.insertChildren(tx, wordId, word, actorId, { meaningIdsOut: parentMeaningIds });
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word',
          entityId: wordId,
          action: 'create',
          status: contributionStatusOf(word.status),
        });

        // 2) tiap kata inline
        const inlineCreatedWords: InlineCreatedWordSummary[] = [];
        for (const rel of related) {
          const [inlineRow] = await tx
            .insert(words)
            .values({
              languageId: word.languageId,
              lemma: rel.inlineWord.lemma.trim(),
              notes: rel.inlineWord.notes ?? null,
              wordType: rel.inlineWord.wordType,
              status: rel.inlineWord.status,
              isVerified: rel.inlineWord.isVerified,
              isCorrected: rel.inlineWord.isCorrected ?? false,
              createdBy: actorId,
            })
            .returning();
          const inlineId = inlineRow.id;

          // provenan: index makna inline → id makna INDUK (self-FK meanings).
          // Override TIDAK masuk map → kolom NULL (makna sudah mandiri).
          const inheritedByIdx: Record<number, string> = {};
          for (const [inlineIdx, parentIdx] of Object.entries(rel.inheritedFrom ?? {})) {
            const parentId = parentMeaningIds[parentIdx];
            if (parentId) inheritedByIdx[Number(inlineIdx)] = parentId;
          }
          await this.insertChildren(tx, inlineId, rel.inlineWord, actorId, {
            inheritedFrom: inheritedByIdx,
          });

          // 3) relasi: source = induk → target = inline
          await tx.insert(lexicalRelations).values({
            sourceWordId: wordId,
            targetWordId: inlineId,
            relationType: rel.relationType,
            createdBy: actorId,
          });

          // 4) contributions per entitas inline
          await tx.insert(contributions).values({
            userId: actorId,
            entityType: 'word',
            entityId: inlineId,
            action: 'create',
            status: contributionStatusOf(rel.inlineWord.status),
          });

          inlineCreatedWords.push({
            id: inlineId,
            lemma: inlineRow.lemma,
            relationType: rel.relationType,
            wordType: inlineRow.wordType as Word['wordType'],
            status: inlineRow.status as WordStatus,
            isVerified: inlineRow.isVerified,
            meaningsCount: rel.inlineWord.meanings.length,
            inheritedMeaningsCount: rel.inheritedMeaningsCount,
            overriddenMeaningsCount: rel.overriddenMeaningsCount,
          });
        }

        return { word: toWord(wordRow), inlineCreatedWords };
      });
    } catch (err) {
      // Race FK / duplikat unik - petakan ke 400, jangan bocor jadi 500
      const code = (err as { cause?: { code?: string } }).cause?.code;
      if (code === FOREIGN_KEY_VIOLATION) {
        throw new ValidationError([
          { field: '', message: 'Referensi data tidak valid (data terkait mungkin sudah dihapus)' },
        ]);
      }
      if (code === UNIQUE_VIOLATION) {
        throw new ValidationError([
          { field: '', message: 'Data duplikat - kategori/terjemahan/gambar yang sama sudah dipakai' },
        ]);
      }
      throw err;
    }
  }

  async findDuplicate(
    languageId: string,
    lemma: string,
    excludeWordId?: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: words.id })
      .from(words)
      .where(
        and(
          eq(words.languageId, languageId),
          sql`lower(${words.lemma}) = lower(${lemma.trim()})`,
          isNull(words.deletedAt),
          // 05-api-edit-kata.md: edit mengabaikan dirinya sendiri
          ...(excludeWordId ? [ne(words.id, excludeWordId)] : []),
        ),
      )
      .limit(1);
    return !!row;
  }

  async findDetailById(
    id: string,
    opts?: { includeAllStatuses?: boolean },
  ): Promise<WordDetail | null> {
    const includeAll = opts?.includeAllStatuses === true;
    const [wordRow] = await this.db
      .select()
      .from(words)
      .where(
        includeAll
          ? and(eq(words.id, id), isNull(words.deletedAt))
          : and(eq(words.id, id), eq(words.status, 'published'), isNull(words.deletedAt)),
      )
      .limit(1);
    if (!wordRow) return null;

    const meaningRows = await this.db
      .select()
      .from(meanings)
      .where(and(eq(meanings.wordId, id), isNull(meanings.deletedAt)))
      .orderBy(meanings.orderIndex);

    // Kelas kata tersemat per makna (Nomina/Verba/…) - satu query, map by id
    const wordClassIds = [...new Set(meaningRows.map((m) => m.wordClassId).filter((x): x is string => !!x))];
    const wcRows =
      wordClassIds.length > 0
        ? await this.db.select().from(wordClasses).where(inArray(wordClasses.id, wordClassIds))
        : [];
    const wcById = new Map(wcRows.map((wc) => [wc.id, wc]));

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
            .where(
              and(
                inArray(examples.meaningId, meaningIds),
                isNull(examples.deletedAt),
                // Approval gate: anak pending/rejected tidak tayang di publik
                includeAll ? undefined : eq(examples.status, 'published'),
              ),
            )
        : [];

    const categoryRows = await this.db
      .select({ id: categories.id, name: categories.name })
      .from(wordCategories)
      .innerJoin(categories, eq(wordCategories.categoryId, categories.id))
      .where(eq(wordCategories.wordId, id));

    const pronRows = await this.db
      .select()
      .from(pronunciations)
      .where(
        and(
          eq(pronunciations.wordId, id),
          isNull(pronunciations.deletedAt),
          includeAll ? undefined : eq(pronunciations.status, 'published'),
        ),
      );

    const imageRows = await this.db
      .select()
      .from(wordImages)
      .where(
        and(
          eq(wordImages.wordId, id),
          isNull(wordImages.deletedAt),
          includeAll ? undefined : eq(wordImages.status, 'published'),
        ),
      );

    // Relasi maju (entri ini → entri lain) + lemma target. Hanya tampil saat
    // TARGET juga published (Section 7.7: sinonim pending_review belum muncul).
    const relatedRows = await this.db
      .select({
        wordId: lexicalRelations.targetWordId,
        relationType: lexicalRelations.relationType,
        lemma: words.lemma,
      })
      .from(lexicalRelations)
      .innerJoin(words, eq(words.id, lexicalRelations.targetWordId))
      .where(
        and(
          eq(lexicalRelations.sourceWordId, id),
          isNull(lexicalRelations.deletedAt),
          includeAll ? undefined : and(eq(words.status, 'published'), isNull(words.deletedAt)),
        ),
      );

    // Relasi invers (entri lain → entri ini): "muncul dalam" - derived, tak disimpan.
    // Hanya tampil saat SUMBER relasi published.
    const appearsRows = await this.db
      .select({
        wordId: lexicalRelations.sourceWordId,
        relationType: lexicalRelations.relationType,
        lemma: words.lemma,
      })
      .from(lexicalRelations)
      .innerJoin(words, eq(words.id, lexicalRelations.sourceWordId))
      .where(
        and(
          eq(lexicalRelations.targetWordId, id),
          isNull(lexicalRelations.deletedAt),
          includeAll ? undefined : and(eq(words.status, 'published'), isNull(words.deletedAt)),
        ),
      );

    const variantRows = await this.db
      .select()
      .from(wordVariants)
      .where(and(eq(wordVariants.wordId, id), isNull(wordVariants.deletedAt)));

    return {
      ...toWord(wordRow),
      meanings: meaningRows.map((m) => ({
        id: m.id,
        wordId: m.wordId,
        wordClass: m.wordClassId
          ? (() => {
              const wc = wcById.get(m.wordClassId)!;
              return { id: wc.id, code: wc.code, name: wc.name, parentId: wc.parentId };
            })()
          : null,
        // 04: provenance - null = makna mandiri/sudah di-override
        inheritedFromMeaningId: m.inheritedFromMeaningId,
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
            id: e.id,
            sourceLanguageId: e.sourceLanguageId,
            sourceSentence: e.sourceSentence,
            targetLanguageId: e.targetLanguageId,
            targetSentence: e.targetSentence,
            sourceType: e.sourceType,
            // status/flag anak hanya diekspos untuk layar review
            ...(includeAll
              ? { status: e.status as ChildStatus, isVerified: e.isVerified, isCorrected: e.isCorrected }
              : {}),
          })),
      })),
      categories: categoryRows,
      pronunciations: pronRows.map((p) => ({
        id: p.id,
        notation: p.notation,
        value: p.value,
        dialectId: p.dialectId,
        ...(includeAll
          ? { status: p.status as ChildStatus, isVerified: p.isVerified, isCorrected: p.isCorrected }
          : {}),
      })),
      images: imageRows.map((i) => ({
        id: i.id,
        url: i.url,
        altText: i.altText,
        isPrimary: i.isPrimary,
        ...(includeAll
          ? { status: i.status as ChildStatus, isVerified: i.isVerified, isCorrected: i.isCorrected }
          : {}),
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
  // fetch limit+1 untuk has_more - tanpa OFFSET, tanpa COUNT(*).
  // Dua arah: 'lemma' (Sambas→Indonesia, default) atau 'translation'
  // (Indonesia→Sambas: cari meaning_translations.translation_text,
  // hasil = kata Sambas-nya + teks terjemahan yang cocok)
  async search(params: SearchParams): Promise<CursorPage<WordSummary>> {
    if (params.searchIn === 'translation') {
      return this.searchByTranslation(params);
    }

    const where = and(
      isNull(words.deletedAt),
      eq(words.status, 'published'), // draft tidak tayang di endpoint publik
      params.q ? ilike(words.lemma, `%${escapeLike(params.q.trim())}%`) : undefined,
      params.wordType ? eq(words.wordType, params.wordType) : undefined,
      params.isVerified === undefined ? undefined : eq(words.isVerified, params.isVerified),
      params.cursor ? lt(words.id, params.cursor) : undefined,
    );

    const rows = await this.db
      .select({
        id: words.id,
        lemma: words.lemma,
        languageId: words.languageId,
        languageCode: languages.code,
        wordType: words.wordType,
        isVerified: words.isVerified,
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
      isVerified: r.isVerified,
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
      eq(words.status, 'published'), // draft tidak tayang di endpoint publik
      isNull(meanings.deletedAt),
      isNull(meaningTranslations.deletedAt),
      params.q
        ? ilike(meaningTranslations.translationText, `%${escapeLike(params.q.trim())}%`)
        : undefined,
      params.translationLanguageId
        ? eq(meaningTranslations.languageId, params.translationLanguageId)
        : undefined,
      params.wordType ? eq(words.wordType, params.wordType) : undefined,
      params.isVerified === undefined ? undefined : eq(words.isVerified, params.isVerified),
      params.cursor ? lt(words.id, params.cursor) : undefined,
    );

    // DISTINCT ON (words.id): satu kata bisa punya banyak makna yang cocok -
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
        isVerified: words.isVerified,
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
      isVerified: r.isVerified,
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
    const inline = refs.inline;

    // Gabungan id induk + kata inline - SATU query per tabel (04: validasi
    // referensi bersama lalu error dipetakan ke field path yang benar)
    const allWordClassIds = uniqueIds([...refs.wordClassIds, ...inline.wordClassIds]);
    const allLanguageIds = uniqueIds([...refs.languageIds, ...inline.languageIds]);
    const allCategoryIds = uniqueIds([...refs.categoryIds, ...inline.categoryIds]);
    const allVariantDialectIds = uniqueIds([...refs.variantDialectIds, ...inline.variantDialectIds]);

    // Entri terkait (Form A) harus ada DAN belum soft-deleted
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

    // Dialek yang dipakai variants (kata induk; dialect utama dicek di atas)
    let missingDialects: string[] = [];
    let missingInlineDialects: string[] = [];
    if (allVariantDialectIds.length > 0) {
      const rows = await this.db
        .select({ id: dialects.id })
        .from(dialects)
        .where(inArray(dialects.id, allVariantDialectIds));
      const found = new Set(rows.map((r) => r.id));
      missingDialects = uniqueIds(refs.variantDialectIds).filter((id) => !found.has(id));
      missingInlineDialects = uniqueIds(inline.variantDialectIds).filter((id) => !found.has(id));
    }

    // Filter soft-deleted (Section 7: semua tabel wajib soft delete)
    const wcRows = await this.db
      .select({ id: wordClasses.id })
      .from(wordClasses)
      .where(and(inArray(wordClasses.id, allWordClassIds), isNull(wordClasses.deletedAt)));
    const catRows = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, allCategoryIds), isNull(categories.deletedAt)));
    const langRows = await this.db
      .select({ id: languages.id })
      .from(languages)
      .where(inArray(languages.id, allLanguageIds));
    const wcFound = new Set(wcRows.map((r) => r.id));
    const catFound = new Set(catRows.map((r) => r.id));
    const langFound = new Set(langRows.map((r) => r.id));

    return {
      languageId: !languageExists,
      dialectId: !dialectExists,
      languages: uniqueIds(refs.languageIds).filter((id) => !langFound.has(id)),
      wordClasses: uniqueIds(refs.wordClassIds).filter((id) => !wcFound.has(id)),
      categories: uniqueIds(refs.categoryIds).filter((id) => !catFound.has(id)),
      words: missingRelated,
      dialects: missingDialects,
      inlineWordClasses: uniqueIds(inline.wordClassIds).filter((id) => !wcFound.has(id)),
      inlineLanguages: uniqueIds(inline.languageIds).filter((id) => !langFound.has(id)),
      inlineCategories: uniqueIds(inline.categoryIds).filter((id) => !catFound.has(id)),
      inlineDialects: missingInlineDialects,
    };
  }

  async setVerified(
    id: string,
    data: { isVerified: boolean; verifiedBy: string; verifiedAt: Date },
  ): Promise<boolean> {
    const updated = await this.db
      .update(words)
      .set({ isVerified: data.isVerified, verifiedBy: data.verifiedBy, verifiedAt: data.verifiedAt })
      .where(and(eq(words.id, id), isNull(words.deletedAt)))
      .returning({ id: words.id });
    return updated.length > 0;
  }

  async findMeaningById(meaningId: string): Promise<{ id: string; wordId: string } | null> {
    const [row] = await this.db
      .select({ id: meanings.id, wordId: meanings.wordId })
      .from(meanings)
      .where(and(eq(meanings.id, meaningId), isNull(meanings.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async addPronunciation(
    wordId: string,
    data: {
      dialectId?: string | null;
      notation: string;
      value: string;
      audioUrl?: string | null;
      speakerName?: string | null;
      notes?: string | null;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<PronunciationMedia> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(pronunciations)
          .values({
            wordId,
            dialectId: data.dialectId ?? null,
            notation: data.notation,
            value: data.value,
            audioUrl: data.audioUrl ?? null,
            speakerName: data.speakerName ?? null,
            notes: data.notes ?? null,
            status: data.status,
            isVerified: data.isVerified,
            createdBy: actorId,
          })
          .returning();
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'pronunciation',
          entityId: row.id,
          action: 'create',
          status: contributionStatusOf(data.status),
        });
        return toPronunciation(row);
      });
    } catch (err) {
      mapMediaViolation(err, 'value');
      throw err;
    }
  }

  async addWordImage(
    wordId: string,
    data: {
      url: string;
      providerFileId: string;
      altText?: string | null;
      isPrimary: boolean;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<WordImageMedia> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(wordImages)
          .values({
            wordId,
            providerFileId: data.providerFileId,
            url: data.url,
            altText: data.altText ?? null,
            isPrimary: data.isPrimary,
            status: data.status,
            isVerified: data.isVerified,
            createdBy: actorId,
          })
          .returning();
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word_image',
          entityId: row.id,
          action: 'create',
          status: contributionStatusOf(data.status),
        });
        return toWordImage(row);
      });
    } catch (err) {
      mapMediaViolation(err, 'provider_file_id');
      throw err;
    }
  }

  async addExample(
    meaningId: string,
    data: {
      sourceLanguageId: string;
      sourceSentence: string;
      targetLanguageId?: string | null;
      targetSentence?: string | null;
      sourceType?: string | null;
      notes?: string | null;
      status: ChildStatus;
      isVerified: boolean;
    },
    actorId: string,
  ): Promise<ExampleMedia> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(examples)
          .values({
            meaningId,
            sourceLanguageId: data.sourceLanguageId,
            sourceSentence: data.sourceSentence,
            targetLanguageId: data.targetLanguageId ?? null,
            targetSentence: data.targetSentence ?? null,
            sourceType: data.sourceType ?? null,
            notes: data.notes ?? null,
            status: data.status,
            isVerified: data.isVerified,
            createdBy: actorId,
          })
          .returning();
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'example',
          entityId: row.id,
          action: 'create',
          status: contributionStatusOf(data.status),
        });
        return toExample(row);
      });
    } catch (err) {
      mapMediaViolation(err, '');
      throw err;
    }
  }

  async findById(id: string): Promise<Word | null> {
    const [row] = await this.db
      .select()
      .from(words)
      .where(and(eq(words.id, id), isNull(words.deletedAt)))
      .limit(1);
    return row ? toWord(row) : null;
  }

  async updateWithRelations(id: string, word: WordToSave, actorId: string): Promise<Word | null> {
    try {
      return await this.db.transaction(async (tx) => {
        // Update baris words
        const [wordRow] = await tx
          .update(words)
          .set({
            languageId: word.languageId,
            lemma: word.lemma.trim(),
            notes: word.notes ?? null,
            wordType: word.wordType,
            status: word.status,
            isVerified: word.isVerified,
            isCorrected: word.isCorrected ?? false,
            updatedBy: actorId,
            updatedAt: new Date(),
          })
          .where(and(eq(words.id, id), isNull(words.deletedAt)))
          .returning();
        if (!wordRow) return null;

        // Replace children: hapus lama (urutan FK-safe) lalu insert baru
        await tx.delete(examples).where(
          inArray(examples.meaningId, tx.select({ id: meanings.id }).from(meanings).where(eq(meanings.wordId, id)),
        ));
        await tx.delete(meaningTranslations).where(
          inArray(meaningTranslations.meaningId, tx.select({ id: meanings.id }).from(meanings).where(eq(meanings.wordId, id)),
        ));
        await tx.delete(meanings).where(eq(meanings.wordId, id));
        await tx.delete(wordCategories).where(eq(wordCategories.wordId, id));
        await tx.delete(lexicalRelations).where(eq(lexicalRelations.sourceWordId, id));
        await tx.delete(wordVariants).where(eq(wordVariants.wordId, id));
        await tx.delete(wordImages).where(eq(wordImages.wordId, id));
        await tx.delete(pronunciations).where(eq(pronunciations.wordId, id));

        // Insert children baru (pola sama dengan saveWithRelations)
        await this.insertChildren(tx, id, word, actorId);

        // Catat kontribusi update - status antrean turunan dari status entity
        // (correct oleh verifikator → published → 'approved', tidak mengotori antrean)
        await tx.insert(contributions).values({
          userId: actorId,
          entityType: 'word',
          entityId: id,
          action: 'update',
          status: contributionStatusOf(word.status),
        });

        return toWord(wordRow);
      });
    } catch (err) {
      const code = (err as { cause?: { code?: string } }).cause?.code;
      if (code === FOREIGN_KEY_VIOLATION) {
        throw new ValidationError([
          { field: '', message: 'Referensi data tidak valid (data terkait mungkin sudah dihapus)' },
        ]);
      }
      if (code === UNIQUE_VIOLATION) {
        throw new ValidationError([
          { field: '', message: 'Data duplikat - kategori/terjemahan/gambar yang sama sudah dipakai' },
        ]);
      }
      throw err;
    }
  }

  async softDelete(id: string, actorId: string): Promise<boolean> {
    const updated = await this.db
      .update(words)
      .set({ deletedAt: new Date(), deletedBy: actorId })
      .where(and(eq(words.id, id), isNull(words.deletedAt)))
      .returning({ id: words.id });
    return updated.length > 0;
  }

  // Helper: insert children untuk save & update (dipakai bersama)
  // opts.inheritedFrom = index makna → id makna INDUK (kolom provenance,
  // 04 - sinonim inline); opts.meaningIdsOut = kumpulan id makna sesuai
  // urutan array (dipakai induk utk memetakan provenance).
  private async insertChildren(
    tx: Tx,
    wordId: string,
    word: WordToSave,
    actorId: string,
    opts?: { inheritedFrom?: Record<number, string>; meaningIdsOut?: string[] },
  ): Promise<void> {
    for (const [index, meaning] of word.meanings.entries()) {
      const [meaningRow] = await tx
        .insert(meanings)
        .values({
          wordId,
          wordClassId: meaning.wordClassId,
          inheritedFromMeaningId: opts?.inheritedFrom?.[index] ?? null,
          definition: meaning.definition,
          orderIndex: meaning.orderIndex,
          createdBy: actorId,
        })
        .returning();
      const meaningId = meaningRow.id;
      opts?.meaningIdsOut?.push(meaningId);

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
            status: childStatusOf(word.status),
            isVerified: word.isVerified,
            createdBy: actorId,
          })),
        );
      }
    }

    if (word.categoryIds.length > 0) {
      await tx.insert(wordCategories).values(word.categoryIds.map((categoryId) => ({ wordId, categoryId })));
    }
    // Hanya link ke kata existing (Form A). Kata inline (Form B) relasinya
    // dibuat terpisah di saveWithInlineRelations (source=induk → target=inline).
    const linkRels = word.relatedWords.filter(
      (rel): rel is Extract<CreateWordRelatedDto, { wordId: string }> => 'wordId' in rel,
    );
    if (linkRels.length > 0) {
      await tx.insert(lexicalRelations).values(
        linkRels.map((rel) => ({
          sourceWordId: wordId,
          targetWordId: rel.wordId,
          relationType: rel.relationType,
          createdBy: actorId,
        })),
      );
    }
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
        dialectId: word.dialectId ?? null,
        notation: word.pronunciation.notation,
        value: word.pronunciation.value,
        status: childStatusOf(word.status),
        isVerified: word.isVerified,
        createdBy: actorId,
      });
    }
    if (word.images && word.images.length > 0) {
      await tx.insert(wordImages).values(
        word.images.map((img) => ({
          wordId,
          provider: img.provider,
          providerFileId: img.providerFileId,
          url: img.url,
          altText: img.altText ?? null,
          isPrimary: img.isPrimary ?? false,
          status: childStatusOf(word.status),
          isVerified: word.isVerified,
          createdBy: actorId,
        })),
      );
    }
  }

  async listWordClasses() {
    const rows = await this.db
      .select()
      .from(wordClasses)
      .where(isNull(wordClasses.deletedAt))
      .orderBy(wordClasses.code);
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, parentId: r.parentId }));
  }

  private async exists(table: typeof languages | typeof dialects, id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
    return !!row;
  }
}
