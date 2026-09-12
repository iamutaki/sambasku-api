import type { WordSummary } from '../../domain/entities/word.entity';
import type { CursorPage, WordRepository } from '../../domain/repositories/word.repository';

export interface SearchWordsQuery {
  q: string;
  limit: number;
  cursor?: string;
  searchIn?: 'lemma' | 'translation';
  translationLanguageId?: string;
  wordType?: string;
}

export interface SearchWordsResult extends CursorPage<WordSummary> {
  meta: { limit: number; next_cursor: string | null; has_more: boolean };
}

// Searchable dropdown sinonim/antonim di form admin — semua kata yang
// belum soft-deleted, apa pun statusnya (draft boleh jadi rujukan).
// Pagination cursor-based (base-stack.md Section 13).
export class SearchWordsUseCase {
  constructor(private readonly wordRepo: WordRepository) {}

  async execute(query: SearchWordsQuery): Promise<SearchWordsResult> {
    const { items, nextCursor, hasMore } = await this.wordRepo.search(query);
    return {
      items,
      nextCursor,
      hasMore,
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    };
  }
}
