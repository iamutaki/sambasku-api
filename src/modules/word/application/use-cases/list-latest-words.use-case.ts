import { ValidationError } from '@/shared/errors/app-error';
import type { LatestWordSummary } from '../../domain/entities/word.entity';
import {
  decodeLatestCursor,
  type CursorPage,
  type WordRepository,
} from '../../domain/repositories/word.repository';

export interface ListLatestWordsQuery {
  limit: number;
  cursor?: string;
}

export interface ListLatestWordsResult extends CursorPage<LatestWordSummary> {
  meta: { limit: number; next_cursor: string | null; has_more: boolean };
}

/**
 * Feed beranda: kata published urut waktu persetujuan. Bukan pencarian
 * (tanpa search-miss) dan bukan daftar A-Z.
 */
export class ListLatestWordsUseCase {
  constructor(private readonly wordRepo: WordRepository) {}

  async execute(query: ListLatestWordsQuery): Promise<ListLatestWordsResult> {
    let cursor: { approvedAt: Date; id: string } | undefined;
    if (query.cursor) {
      try {
        cursor = decodeLatestCursor(query.cursor);
      } catch {
        throw new ValidationError([{ field: 'cursor', message: 'Format cursor tidak valid' }]);
      }
    }

    const { items, nextCursor, hasMore } = await this.wordRepo.listLatest({
      limit: query.limit,
      cursor,
    });

    return {
      items,
      nextCursor,
      hasMore,
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    };
  }
}
