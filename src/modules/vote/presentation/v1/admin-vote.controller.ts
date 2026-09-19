import type { Context } from 'hono';
import type { AppVariables } from '@/shared/types';
import type { VoteTargetType } from '../../domain/repositories/vote.repository';
import type { DeleteAdminVoteUseCase } from '../../application/use-cases/delete-admin-vote.use-case';
import type { GetTopTargetVotesUseCase } from '../../application/use-cases/get-top-target-votes.use-case';
import type { ListAdminVotesUseCase } from '../../application/use-cases/list-admin-votes.use-case';
import type { ResetTargetVotesUseCase } from '../../application/use-cases/reset-target-votes.use-case';
import type {
  DeleteAdminVoteParams,
  ListAdminVotesQuery,
  ResetTargetVotesBody,
  TopVoteTargetsQuery,
} from './validators/admin-votes.validator';

type AdminCtx = Context<{ Variables: AppVariables }>;

export class AdminVotesController {
  constructor(
    private readonly deps: {
      list: ListAdminVotesUseCase;
      deleteById: DeleteAdminVoteUseCase;
      resetTarget: ResetTargetVotesUseCase;
      topTargets: GetTopTargetVotesUseCase;
    },
  ) {}

  async list(c: AdminCtx, query: ListAdminVotesQuery) {
    const { items, meta } = await this.deps.list.execute({
      filter: {
        q: query.q,
        entityType: query.target_type as VoteTargetType | undefined,
        value: (query.value as 1 | -1) ?? undefined,
        targetId: query.target_id,
      },
      limit: query.limit,
      cursor: query.cursor ?? null,
    });

    return c.json({
      success: true as const,
      data: items.map((v) => ({
        id: v.id,
        voter_id: v.userId,
        voter_username: v.voterUsername,
        voter_email: v.voterEmail,
        target_type: v.entityType,
        target_id: v.entityId,
        value: v.value,
        created_at: v.createdAt.toISOString(),
        updated_at: v.updatedAt ? v.updatedAt.toISOString() : null,
      })),
      meta: {
        limit: meta.limit,
        next_cursor: meta.nextCursor,
        has_more: meta.hasMore,
      },
    });
  }

  async deleteById(c: AdminCtx, params: DeleteAdminVoteParams) {
    const user = c.get('user')!;
    const requestId = c.get('requestId') ?? null;

    const result = await this.deps.deleteById.execute({
      voteId: params.id,
      actorId: user.user_id,
      requestId,
    });
    return c.json({ success: true as const, data: result });
  }

  async resetTarget(c: AdminCtx, body: ResetTargetVotesBody) {
    const user = c.get('user')!;
    const requestId = c.get('requestId') ?? null;

    const result = await this.deps.resetTarget.execute({
      target: {
        entityType: body.target_type,
        entityId: body.target_id,
      },
      actorId: user.user_id,
      requestId,
    });
    return c.json({
      success: true as const,
      data: {
        target_type: result.entityType,
        target_id: result.entityId,
        deleted_count: result.deletedCount,
      },
    });
  }

  async topTargets(c: AdminCtx, query: TopVoteTargetsQuery) {
    const rows = await this.deps.topTargets.execute({
      entityType: query.target_type,
      limit: query.limit,
    });
    return c.json({
      success: true as const,
      data: rows.map((r) => ({
        target_type: r.entityType,
        target_id: r.entityId,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        net: r.net,
      })),
    });
  }
}
