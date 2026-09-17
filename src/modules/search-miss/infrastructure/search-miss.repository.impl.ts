import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { searchMisses, words } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { SearchMiss, SearchMissDirection } from '../domain/entities/search-miss.entity';
import type { SearchMissListFilter, SearchMissRepository } from '../domain/repositories/search-miss.repository';

// Normalisasi istilah: trim + lowercase + rapikan spasi ganda - kunci unik
// upsert, sekaligus bikin "Kalintiak" dan "kalintiak" dihitung sama
export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 255);
}

// Miss 'lemma' terjawab kalau sudah ada kata published dengan lemma sama
// (case-insensitive). Dievaluasi saat BACA - tanpa kolom status yang harus
// disinkronkan tiap ada kata baru di-approve.
const lemmaFulfilledSql = sql`EXISTS (
  SELECT 1 FROM ${words} w
  WHERE lower(w.lemma) = ${searchMisses.term}
    AND w.status = 'published'
    AND w.deleted_at IS NULL
)`;

export class SearchMissRepositoryImpl implements SearchMissRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async record(input: { term: string; direction: SearchMissDirection }): Promise<void> {
    const term = normalizeTerm(input.term);
    if (!term) return;
    await this.db
      .insert(searchMisses)
      .values({ term, direction: input.direction })
      .onConflictDoUpdate({
        target: [searchMisses.term, searchMisses.direction],
        set: {
          hitCount: sql`${searchMisses.hitCount} + 1`,
          lastSearchedAt: new Date(),
          updatedAt: new Date(),
          // Istilah dicari LAGI setelah di-dismiss → hidupkan kembali
          // (menjadi peluang kontribusi aktif yang valid saat ini)
          deletedAt: null,
          deletedBy: null,
        },
      });
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
          // Beranda: hanya yang BELUM terjawab (masih jadi peluang kontribusi)
          isPublic ? sql`NOT ${lemmaFulfilledSql}` : undefined,
          // Cursor id DESC hanya untuk panel admin (order stabil & unik);
          // beranda pakai hit_count DESC - top-N single page (lihat routes)
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

    // Status terjawab untuk ditampilkan (panel admin butuh keduanya)
    const fulfilled = await this.fulfilledTerms(
      page.filter((r) => r.direction === 'lemma').map((r) => r.term),
    );

    const items: SearchMiss[] = page.map((r) => ({
      id: r.id,
      term: r.term,
      direction: r.direction as SearchMissDirection,
      hitCount: r.hitCount,
      lastSearchedAt: r.lastSearchedAt,
      isFulfilled: r.direction === 'lemma' && fulfilled.has(r.term),
      createdAt: r.createdAt,
    }));

    return {
      items,
      // Beranda top-N: halaman tunggal, tak perlu cursor majemuk (hit_count
      // tidak unik) - ponytail: tambahkan compound-cursor kalau butuh paging
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

  private async fulfilledTerms(terms: string[]): Promise<Set<string>> {
    if (terms.length === 0) return new Set();
    const rows = await this.db
      .select({ lemma: words.lemma })
      .from(words)
      .where(
        and(
          inArray(sql`lower(${words.lemma})`, terms),
          eq(words.status, 'published'),
          isNull(words.deletedAt),
        ),
      );
    return new Set(rows.map((r) => r.lemma.toLowerCase()));
  }
}
