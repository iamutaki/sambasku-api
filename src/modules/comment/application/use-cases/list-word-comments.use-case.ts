import type { VoteRepository } from '@/modules/vote/domain/repositories/vote.repository';
import type { Comment } from '../../domain/entities/comment.entity';
import type { CommentRepository } from '../../domain/repositories/comment.repository';

export interface CommentWithVotes extends Comment {
  upvotes: number;
  downvotes: number;
}

export interface ListWordCommentsResult {
  items: CommentWithVotes[];
  nextCursor: string | null;
  hasMore: boolean;
}

// List komentar PUBLISHED pada sebuah kata (09-api-comment.md) - publik,
// terbaru dulu. Vote counts ditempel via countMany batch (dua query,
// bukan N+1) - komentar sendiri adalah target vote yang sah.
export class ListWordCommentsUseCase {
  constructor(
    private readonly commentRepo: CommentRepository,
    private readonly voteRepo: VoteRepository,
  ) {}

  async execute(wordId: string, params: { limit: number; cursor?: string }): Promise<ListWordCommentsResult> {
    const page = await this.commentRepo.listByWord(wordId, params);

    const counts = await this.voteRepo.countMany(
      page.items.map((c) => ({ entityType: 'comment' as const, entityId: c.id })),
    );

    return {
      items: page.items.map((c) => {
        const v = counts.get(`comment:${c.id}`) ?? { upvotes: 0, downvotes: 0 };
        return { ...c, upvotes: v.upvotes, downvotes: v.downvotes };
      }),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}
