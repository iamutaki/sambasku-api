import type {
  VoteCounts,
  VoteRepository,
  VoteTarget,
} from '../../domain/repositories/vote.repository';

export interface VoteCountItem extends VoteCounts {
  targetType: VoteTarget['entityType'];
  targetId: string;
}

// Batch counts (08-api-upvote-downvote.md): client sudah memegang semua id
// dari word detail - endpoint ini TIDAK mengubah response endpoint existing.
// Target tanpa vote dilengkapi 0/0 di sini, BUKAN di SQL; duplikat di-dedupe.
export class GetVoteCountsUseCase {
  constructor(private readonly voteRepo: VoteRepository) {}

  async execute(targets: VoteTarget[]): Promise<VoteCountItem[]> {
    const deduped = new Map(targets.map((t) => [`${t.entityType}:${t.entityId}`, t]));
    const counts = await this.voteRepo.countMany([...deduped.values()]);

    return [...deduped.values()].map((t) => {
      const c = counts.get(`${t.entityType}:${t.entityId}`) ?? { upvotes: 0, downvotes: 0 };
      return { targetType: t.entityType, targetId: t.entityId, upvotes: c.upvotes, downvotes: c.downvotes };
    });
  }
}
