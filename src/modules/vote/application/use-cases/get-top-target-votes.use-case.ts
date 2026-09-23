import type {
  AdminTopVoteTarget,
  VoteRepository,
  VoteTargetType,
} from '../../domain/repositories/vote.repository';

export interface GetTopTargetVotesCommand {
  entityType: VoteTargetType;
  limit: number;
}

/**
 * Top targets terurut skor bersih (net = sum(value)) desc. Pure use case -
 * hanya delegasi repository, tambahkan rank via map index di controller
 * atau consumer presentation (tidak perlu domain).
 */
export class GetTopTargetVotesUseCase {
  constructor(private readonly voteRepo: VoteRepository) {}

  async execute(cmd: GetTopTargetVotesCommand): Promise<AdminTopVoteTarget[]> {
    const limit = Math.max(1, Math.min(cmd.limit, 200));
    return this.voteRepo.getTopTargets(cmd.entityType, limit);
  }
}
