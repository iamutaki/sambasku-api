import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { WordSuggestionRepository } from '@/modules/word-suggestions/domain/repositories/word-suggestion.repository';
import type { ContributionStatus, MySubmission } from '../../domain/entities/contribution.entity';
import type { ContributionRepository } from '../../domain/repositories/contribution.repository';

export interface ListMyContributionsQuery {
  userId: string;
  status?: ContributionStatus;
  limit: number;
  cursor?: string;
}

/**
 * Gabung kontribusi kata baru + usulan perubahan milik user.
 * Merge by ULID DESC (time-sortable lintas tabel), cursor = id item terakhir.
 */
export class ListMyContributionsUseCase {
  constructor(
    private readonly contributionRepo: ContributionRepository,
    private readonly suggestionRepo: WordSuggestionRepository,
  ) {}

  async execute(query: ListMyContributionsQuery): Promise<CursorPage<MySubmission>> {
    const pageSize = query.limit;
    const [contrib, sugg] = await Promise.all([
      this.contributionRepo.listMine({
        userId: query.userId,
        status: query.status,
        limit: pageSize,
        cursor: query.cursor,
      }),
      this.suggestionRepo.listMine({
        userId: query.userId,
        status: query.status,
        limit: pageSize,
        cursor: query.cursor,
      }),
    ]);

    const mappedSugg: MySubmission[] = sugg.items.map((item) => ({
      id: item.id,
      kind: 'suggestion',
      entityType: 'word_suggestion',
      lemma: item.wordLemma,
      status: item.status,
      createdAt: item.createdAt,
      reviewComment: item.reviewComment,
      wordId: item.wordId,
      action: null,
      reason: item.reason,
      reasonCode: item.reasonCode,
      reviewedAt: item.reviewedAt,
    }));

    const merged = [...contrib.items, ...mappedSugg].sort((a, b) => b.id.localeCompare(a.id));
    const hasMore = merged.length > pageSize || contrib.hasMore || sugg.hasMore;
    const items = merged.slice(0, pageSize);
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.id : null,
      hasMore,
    };
  }
}
