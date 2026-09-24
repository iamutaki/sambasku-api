import type { VoteRepository } from '@/modules/vote/domain/repositories/vote.repository';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { TranslationHelp } from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface TranslationHelpWithUpvotes extends TranslationHelp {
  upvotes: number;
}

export class ListPublishedTranslationHelpsUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly voteRepo: VoteRepository,
  ) {}

  async execute(input: {
    limit: number;
    cursor?: string;
    sort?: 'latest' | 'popular';
  }): Promise<CursorPage<TranslationHelpWithUpvotes>> {
    const sort = input.sort ?? 'latest';
    const page = await this.repo.list({
      status: 'published',
      limit: input.limit,
      cursor: input.cursor,
      sort,
    });

    const counts = await this.voteRepo.countMany(
      page.items.map((h) => ({
        entityType: 'translation_help' as const,
        entityId: h.id,
      })),
    );

    return {
      items: page.items.map((h) => {
        const v = counts.get(`translation_help:${h.id}`) ?? { upvotes: 0, downvotes: 0 };
        return { ...h, upvotes: v.upvotes };
      }),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}
