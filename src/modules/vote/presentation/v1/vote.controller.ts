import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { ToggleVoteUseCase } from '../../application/use-cases/toggle-vote.use-case';
import type { GetVoteCountsUseCase } from '../../application/use-cases/get-vote-counts.use-case';
import type { GetMyVotesUseCase } from '../../application/use-cases/get-my-votes.use-case';
import type { VoteTarget } from '../../domain/repositories/vote.repository';
import type { ToggleVoteBody } from './validators/vote.validator';

// Semua role boleh vote (08-api-upvote-downvote.md) - tidak ada gate role
// di controller; 401 sudah ditangani middleware authenticate.
export class VoteController {
  constructor(
    private readonly deps: {
      toggle: ToggleVoteUseCase;
      counts: GetVoteCountsUseCase;
      myVotes: GetMyVotesUseCase;
    },
  ) {}

  /** POST /api/v1/votes - toggle upvote/downvote */
  async toggle(c: Context, body: ToggleVoteBody) {
    const user = this.requireUser(c);
    const result = await this.deps.toggle.execute({
      userId: user.user_id,
      targetType: body.target_type,
      targetId: body.target_id,
      value: body.value,
    });

    logger.info(
      { request_id: this.requestId(c), target_type: body.target_type, target_id: body.target_id, my_vote: result.myVote },
      'vote toggled',
    );

    return c.json({
      success: true as const,
      data: {
        target_type: body.target_type,
        target_id: body.target_id,
        my_vote: result.myVote,
        upvotes: result.upvotes,
        downvotes: result.downvotes,
      },
    });
  }

  /** GET /api/v1/votes/counts?targets=... - batch counts (publik) */
  async counts(c: Context, query: { targets: VoteTarget[] }) {
    const items = await this.deps.counts.execute(query.targets);
    return c.json({
      success: true as const,
      data: items.map((i) => ({
        target_type: i.targetType,
        target_id: i.targetId,
        upvotes: i.upvotes,
        downvotes: i.downvotes,
      })),
    });
  }

  /** GET /api/v1/votes/my?targets=... - vote milik user login */
  async my(c: Context, query: { targets: VoteTarget[] }) {
    const user = this.requireUser(c);
    const items = await this.deps.myVotes.execute(user.user_id, query.targets);
    return c.json({
      success: true as const,
      data: items.map((i) => ({
        target_type: i.targetType,
        target_id: i.targetId,
        value: i.value,
      })),
    });
  }

  private requireUser(c: Context): AuthUser {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }

  private requestId(c: Context): string | undefined {
    return (c as Context<{ Variables: AppVariables }>).get('requestId');
  }
}
