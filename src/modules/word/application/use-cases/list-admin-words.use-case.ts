import type { WordSummary } from '../../domain/entities/word.entity';
import type { CursorPage, WordRepository } from '../../domain/repositories/word.repository';

export interface ListAdminWordsQuery {
  q: string;
  limit: number;
  cursor?: string;
  wordType?: string;
  isVerified?: boolean;
  /**
   * true = tayang; false = tidak tayang; omit = semua.
   * Tidak mencatat search miss (beda dari SearchWordsUseCase publik).
   */
  published?: boolean;
}

export interface ListAdminWordsResult extends CursorPage<WordSummary> {
  meta: { limit: number; next_cursor: string | null; has_more: boolean };
}

/** Panel admin Kata: list semua status + filter tayang (tabs). */
export class ListAdminWordsUseCase {
  constructor(private readonly wordRepo: WordRepository) {}

  async execute(query: ListAdminWordsQuery): Promise<ListAdminWordsResult> {
    const { items, nextCursor, hasMore } = await this.wordRepo.search({
      q: query.q,
      limit: query.limit,
      cursor: query.cursor,
      wordType: query.wordType,
      isVerified: query.isVerified,
      published: query.published,
      // Panel list: selalu arah lemma (bukan reverse lookup publik)
      searchIn: 'lemma',
    });

    return {
      items,
      nextCursor,
      hasMore,
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    };
  }
}
