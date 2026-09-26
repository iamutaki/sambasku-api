import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  meaningTranslations,
  meanings,
  searchMisses,
  wordVariants,
  words,
} from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import { isUniqueViolation } from '@/shared/database/drizzle/sqlite-errors';
import { ConflictError } from '@/shared/errors/app-error';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { SearchMiss, SearchMissDirection } from '../domain/entities/search-miss.entity';
import { normalizeSearchMissTerm } from '../domain/normalize-term';
import type {
  SearchMissListFilter,
  SearchMissRepository,
  SearchMissUpdatePatch,
} from '../domain/repositories/search-miss.repository';

// Re-export supaya caller lama (SearchWordsUseCase) tetap bisa import dari sini
export const normalizeTerm = normalizeSearchMissTerm;

// Miss 'lemma' terjawab kalau ada kata published dengan lemma sama
// ATAU variasi penulisan (resolve-as-variant) yang form-nya = term
const lemmaFulfilledSql = sql`(
  EXISTS (
    SELECT 1 FROM ${words} w
    WHERE lower(trim(w.lemma)) = ${searchMisses.term}
      AND w.status = 'published'
      AND w.deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM ${wordVariants} v
    INNER JOIN ${words} w ON w.id = v.word_id
    WHERE lower(trim(v.form)) = ${searchMisses.term}
      AND v.deleted_at IS NULL
      AND w.status = 'published'
      AND w.deleted_at IS NULL
  )
)`;

// Miss 'translation' terjawab kalau ada terjemahan published yang teksnya = term
const translationFulfilledSql = sql`EXISTS (
  SELECT 1 FROM ${meaningTranslations} mt
  INNER JOIN ${meanings} m ON m.id = mt.meaning_id AND m.deleted_at IS NULL
  INNER JOIN ${words} w ON w.id = m.word_id
  WHERE lower(trim(mt.translation_text)) = ${searchMisses.term}
    AND w.status = 'published'
    AND w.deleted_at IS NULL
    AND mt.deleted_at IS NULL
)`;

const isFulfilledSql = sql`(
  CASE
    WHEN ${searchMisses.direction} = 'translation' THEN ${translationFulfilledSql}
    ELSE ${lemmaFulfilledSql}
  END
)`;

export class SearchMissRepositoryImpl implements SearchMissRepository {
  constructor(private readonly db: AppDatabase) {}

  async record(input: { term: string; direction: SearchMissDirection }): Promise<void> {
    const term = normalizeTerm(input.term);
    if (!term) return;
    await this.db
      .insert(searchMisses)
      .values({ term, direction: input.direction })
      // is_visible andalkan DEFAULT false (14-api); jangan set di insert
      .onConflictDoUpdate({
        target: [searchMisses.term, searchMisses.direction],
        set: {
          hitCount: sql`${searchMisses.hitCount} + 1`,
          lastSearchedAt: new Date(),
          updatedAt: new Date(),
          // Istilah dicari LAGI setelah di-dismiss → hidupkan kembali
          deletedAt: null,
          deletedBy: null,
          // JANGAN reset is_visible - keputusan admin tetap (14-api §7)
        },
      });
  }

  async findById(id: string): Promise<SearchMiss | null> {
    const [row] = await this.db
      .select()
      .from(searchMisses)
      .where(and(eq(searchMisses.id, id), isNull(searchMisses.deletedAt)))
      .limit(1);
    if (!row) return null;
    const fulfilled =
      row.direction === 'translation'
        ? (await this.fulfilledTranslationTerms([row.term])).has(row.term)
        : (await this.fulfilledLemmaTerms([row.term])).has(row.term);
    return this.toEntity(row, fulfilled);
  }

  async list(filter: SearchMissListFilter): Promise<CursorPage<SearchMiss>> {
    const isPublic = filter.scope === 'public';

    const rows = await this.db
      .select()
      .from(searchMisses)
      .where(
        and(
          isNull(searchMisses.deletedAt),
          filter.direction ? eq(searchMisses.direction, filter.direction) : undefined,
          // Beranda: hanya tayang + BELUM terjawab (14-api + 03-api)
          isPublic ? eq(searchMisses.isVisible, true) : undefined,
          isPublic ? sql`NOT ${isFulfilledSql}` : undefined,
          // Admin filter status fulfilled (derived)
          !isPublic && filter.fulfilled === true ? isFulfilledSql : undefined,
          !isPublic && filter.fulfilled === false ? sql`NOT ${isFulfilledSql}` : undefined,
          !isPublic && filter.visible === true ? eq(searchMisses.isVisible, true) : undefined,
          !isPublic && filter.visible === false ? eq(searchMisses.isVisible, false) : undefined,
          !isPublic && filter.cursor ? lt(searchMisses.id, filter.cursor) : undefined,
        ),
      )
      .orderBy(
        isPublic ? desc(searchMisses.hitCount) : desc(searchMisses.id),
        desc(searchMisses.id),
      )
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;

    const lemmaTerms = page.filter((r) => r.direction === 'lemma').map((r) => r.term);
    const translationTerms = page.filter((r) => r.direction === 'translation').map((r) => r.term);
    const [fulfilledLemmas, fulfilledTranslations] = await Promise.all([
      this.fulfilledLemmaTerms(lemmaTerms),
      this.fulfilledTranslationTerms(translationTerms),
    ]);

    const items: SearchMiss[] = page.map((r) =>
      this.toEntity(
        r,
        r.direction === 'translation'
          ? fulfilledTranslations.has(r.term)
          : fulfilledLemmas.has(r.term),
      ),
    );

    return {
      items,
      nextCursor: !isPublic && hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  }

  async dismiss(id: string, actorId: string): Promise<boolean> {
    const updated = await this.db
      .update(searchMisses)
      .set({ deletedAt: new Date(), deletedBy: actorId })
      .where(and(eq(searchMisses.id, id), isNull(searchMisses.deletedAt)))
      .returning({ id: searchMisses.id });
    return updated.length > 0;
  }

  async dismissMany(ids: string[], actorId: string): Promise<string[]> {
    if (ids.length === 0) return [];
    const updated = await this.db
      .update(searchMisses)
      .set({ deletedAt: new Date(), deletedBy: actorId })
      .where(and(inArray(searchMisses.id, ids), isNull(searchMisses.deletedAt)))
      .returning({ id: searchMisses.id });
    return updated.map((r) => r.id);
  }

  async update(id: string, patch: SearchMissUpdatePatch): Promise<SearchMiss | null> {
    const set: { term?: string; isVisible?: boolean; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (patch.term !== undefined) set.term = patch.term;
    if (patch.isVisible !== undefined) set.isVisible = patch.isVisible;

    let updated: (typeof searchMisses.$inferSelect)[];
    try {
      updated = await this.db
        .update(searchMisses)
        .set(set)
        .where(and(eq(searchMisses.id, id), isNull(searchMisses.deletedAt)))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          'SEARCH_MISS_TERM_CONFLICT',
          'Term yang dikoreksi sudah dipakai miss lain dengan arah yang sama',
        );
      }
      throw err;
    }

    if (updated.length === 0) return null;
    const row = updated[0];
    const fulfilled =
      row.direction === 'translation'
        ? (await this.fulfilledTranslationTerms([row.term])).has(row.term)
        : (await this.fulfilledLemmaTerms([row.term])).has(row.term);
    return this.toEntity(row, fulfilled);
  }

  private toEntity(
    row: typeof searchMisses.$inferSelect,
    isFulfilled: boolean,
  ): SearchMiss {
    return {
      id: row.id,
      term: row.term,
      direction: row.direction as SearchMissDirection,
      hitCount: row.hitCount,
      lastSearchedAt: row.lastSearchedAt,
      isFulfilled,
      isVisible: row.isVisible,
      createdAt: row.createdAt,
    };
  }

  private async fulfilledLemmaTerms(terms: string[]): Promise<Set<string>> {
    if (terms.length === 0) return new Set();
    const [lemmaRows, variantRows] = await Promise.all([
      this.db
        .select({ lemma: words.lemma })
        .from(words)
        .where(
          and(
            inArray(sql`lower(trim(${words.lemma}))`, terms),
            eq(words.status, 'published'),
            isNull(words.deletedAt),
          ),
        ),
      this.db
        .select({ form: wordVariants.form })
        .from(wordVariants)
        .innerJoin(words, eq(words.id, wordVariants.wordId))
        .where(
          and(
            inArray(sql`lower(trim(${wordVariants.form}))`, terms),
            isNull(wordVariants.deletedAt),
            eq(words.status, 'published'),
            isNull(words.deletedAt),
          ),
        ),
    ]);
    return new Set([
      ...lemmaRows.map((r) => r.lemma.trim().toLowerCase()),
      ...variantRows.map((r) => r.form.trim().toLowerCase()),
    ]);
  }

  private async fulfilledTranslationTerms(terms: string[]): Promise<Set<string>> {
    if (terms.length === 0) return new Set();
    const rows = await this.db
      .select({ text: meaningTranslations.translationText })
      .from(meaningTranslations)
      .innerJoin(meanings, and(eq(meanings.id, meaningTranslations.meaningId), isNull(meanings.deletedAt)))
      .innerJoin(words, eq(words.id, meanings.wordId))
      .where(
        and(
          inArray(sql`lower(trim(${meaningTranslations.translationText}))`, terms),
          eq(words.status, 'published'),
          isNull(words.deletedAt),
          isNull(meaningTranslations.deletedAt),
        ),
      );
    return new Set(rows.map((r) => r.text.trim().toLowerCase()));
  }
}
