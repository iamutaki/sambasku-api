import type {
  VoteHistoryListOptions,
  VoteHistoryListResult,
  VoteRepository,
} from '../../domain/repositories/vote.repository';

// Riwayat vote milik user login (26-api-my-votes.md). Bukan pengganti
// GetMyVotesUseCase yang wajib daftar target.
export class ListMyVoteHistoryUseCase {
  constructor(private readonly voteRepo: VoteRepository) {}

  async execute(userId: string, opts: VoteHistoryListOptions): Promise<VoteHistoryListResult> {
    return this.voteRepo.listByUser(userId, opts);
  }
}
