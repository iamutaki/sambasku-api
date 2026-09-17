import { logger } from '@/shared/logging/logger';
import type { SearchMissRepository } from '@/modules/search-miss/domain/repositories/search-miss.repository';
import type { WordSummary } from '../../domain/entities/word.entity';
import type { CursorPage, WordRepository } from '../../domain/repositories/word.repository';

export interface SearchWordsQuery {
  q: string;
  limit: number;
  cursor?: string;
  searchIn?: 'lemma' | 'translation';
  translationLanguageId?: string;
  wordType?: string;
  isVerified?: boolean;
}

export interface SearchWordsResult extends CursorPage<WordSummary> {
  meta: { limit: number; next_cursor: string | null; has_more: boolean };
}

// Searchable dropdown sinonim/antonim di form admin - HANYA kata
// published + belum soft-deleted (draft tidak bocor ke publik).
// Pagination cursor-based (base-stack.md Section 13).
//
// Pencarian KOSONG dicatat sebagai search miss (03-api-kontribusi-verifikasi
// .md): muncul di panel admin + beranda user lain sebagai peluang kontribusi.
export class SearchWordsUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly searchMissRepo: SearchMissRepository,
  ) {}

  async execute(query: SearchWordsQuery): Promise<SearchWordsResult> {
    const { items, nextCursor, hasMore } = await this.wordRepo.search(query);

    if (items.length === 0 && query.q.trim().length >= 2) {
      // Best-effort: kegagalan pencatatan tidak boleh membatalkan response
      try {
        await this.searchMissRepo.record({
          term: query.q,
          direction: query.searchIn === 'translation' ? 'translation' : 'lemma',
        });
      } catch (err) {
        logger.warn({ err, q: query.q }, 'gagal mencatat search miss');
      }
    }

    return {
      items,
      nextCursor,
      hasMore,
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    };
  }
}
