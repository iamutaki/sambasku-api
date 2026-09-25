import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { ToggleVoteUseCase } from '../../application/use-cases/toggle-vote.use-case';
import type { GetVoteCountsUseCase } from '../../application/use-cases/get-vote-counts.use-case';
import type { GetMyVotesUseCase } from '../../application/use-cases/get-my-votes.use-case';
import type { ListMyVoteHistoryUseCase } from '../../application/use-cases/list-my-vote-history.use-case';
import type { GetVoteDeckUseCase } from '../../application/use-cases/get-vote-deck.use-case';
import type { VoteTarget } from '../../domain/repositories/vote.repository';
import type { ToggleVoteBody, VoteDeckQuery, VoteHistoryQuery } from './validators/vote.validator';

// Semua role boleh vote (08-api-upvote-downvote.md) - tidak ada gate role
// di controller; 401 sudah ditangani middleware authenticate.
export class VoteController {
  constructor(
    private readonly deps: {
      toggle: ToggleVoteUseCase;
      counts: GetVoteCountsUseCase;
      myVotes: GetMyVotesUseCase;
      history: ListMyVoteHistoryUseCase;
      deck: GetVoteDeckUseCase;
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

  /** GET /api/v1/votes/history - riwayat vote milik user login */
  async history(c: Context, query: VoteHistoryQuery) {
    const user = this.requireUser(c);
    const page = await this.deps.history.execute(user.user_id, {
      limit: query.limit,
      cursor: query.cursor,
      targetType: query.target_type,
      value: query.value === '1' ? 1 : query.value === '-1' ? -1 : undefined,
    });
    return c.json({
      success: true as const,
      data: page.items.map((item) => ({
        id: item.id,
        target_type: item.entityType,
        target_id: item.entityId,
        value: item.value,
        voted_at: item.votedAt.toISOString(),
        word: item.word
          ? {
              id: item.word.id,
              lemma: item.word.lemma,
              word_type: item.word.wordType,
              is_verified: item.word.isVerified,
            }
          : null,
      })),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  /** GET /api/v1/votes/deck - antrean kata belum di-vote (34-api-vote-deck.md) */
  async deck(c: Context, query: VoteDeckQuery) {
    const user = this.requireUser(c);
    const page = await this.deps.deck.execute(user.user_id, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: page.items.map((w) => ({
        id: w.id,
        lemma: w.lemma,
        language_id: w.languageId,
        language_code: w.languageCode,
        word_type: w.wordType,
        status: w.status,
        is_verified: w.isVerified,
        approved_at: w.approvedAt.toISOString(),
        sense: w.sense,
        upvotes: w.upvotes,
        downvotes: w.downvotes,
      })),
      meta: page.meta,
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
