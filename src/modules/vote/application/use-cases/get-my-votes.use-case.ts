import type { VoteRepository, VoteTarget } from '../../domain/repositories/vote.repository';

export interface MyVoteItem {
  targetType: VoteTarget['entityType'];
  targetId: string;
  value: 1 | -1;
}

// Vote milik user untuk batch target (08-api-upvote-downvote.md) - untuk
// merender state tombol upvote/downvote di UI. Hanya target yang dipilih
// user yang dikembalikan.
export class GetMyVotesUseCase {
  constructor(private readonly voteRepo: VoteRepository) {}

  async execute(userId: string, targets: VoteTarget[]): Promise<MyVoteItem[]> {
    const deduped = [...new Map(targets.map((t) => [`${t.entityType}:${t.entityId}`, t])).values()];
    const mine = await this.voteRepo.findUserVotes(userId, deduped);

    return deduped
      .filter((t) => mine.has(`${t.entityType}:${t.entityId}`))
      .map((t) => ({
        targetType: t.entityType,
        targetId: t.entityId,
        value: mine.get(`${t.entityType}:${t.entityId}`)!,
      }));
  }
}
