import { ValidationError } from '@/shared/errors/app-error';
import {
  decodeVoteDeckCursor,
  type VoteDeckListResult,
  type VoteRepository,
} from '../../domain/repositories/vote.repository';

export interface GetVoteDeckQuery {
  limit: number;
  cursor?: string;
}

/**
 * Antrean kata published yang pemohon belum vote (34-api-vote-deck.md).
 */
export class GetVoteDeckUseCase {
  constructor(private readonly voteRepo: VoteRepository) {}

  async execute(userId: string, query: GetVoteDeckQuery): Promise<VoteDeckListResult & {
    meta: { limit: number; next_cursor: string | null; has_more: boolean };
  }> {
    let cursor;
    if (query.cursor) {
      try {
        cursor = decodeVoteDeckCursor(query.cursor);
      } catch {
        throw new ValidationError([{ field: 'cursor', message: 'Format cursor tidak valid' }]);
      }
    }

    const page = await this.voteRepo.listDeckWords(userId, {
      limit: query.limit,
      cursor,
    });

    return {
      ...page,
      meta: {
        limit: query.limit,
        next_cursor: page.nextCursor,
        has_more: page.hasMore,
      },
    };
  }
}
