import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { MySubmission, MySubmissionKind } from '../../domain/entities/contribution.entity';
import type { ListMyContributionsUseCase } from '../../application/use-cases/list-my-contributions.use-case';
import type { GetMyContributionDetailUseCase } from '../../application/use-cases/get-my-contribution-detail.use-case';
import type { ListMyContributionsQueryBody } from './validators/contribution.validator';

function serializeMine(item: MySubmission) {
  return {
    id: item.id,
    kind: item.kind,
    entity_type: item.entityType,
    lemma: item.lemma,
    status: item.status,
    created_at: item.createdAt.toISOString(),
    review_comment: item.reviewComment,
    word_id: item.wordId,
    action: item.action,
    reason: item.reason,
    reason_code: item.reasonCode,
    reviewed_at: item.reviewedAt ? item.reviewedAt.toISOString() : null,
  };
}

/** Endpoint milik user: GET /api/v1/contributions/my (+ detail). */
export class MyContributionController {
  constructor(
    private readonly deps: {
      listMine: ListMyContributionsUseCase;
      getMine: GetMyContributionDetailUseCase;
    },
  ) {}

  async list(c: Context, query: ListMyContributionsQueryBody) {
    const user = this.requireUser(c);
    const { items, nextCursor, hasMore } = await this.deps.listMine.execute({
      userId: user.user_id,
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: items.map(serializeMine),
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    });
  }

  async detail(c: Context, kind: MySubmissionKind, id: string) {
    const user = this.requireUser(c);
    const item = await this.deps.getMine.execute(user.user_id, kind, id);
    return c.json({
      success: true as const,
      data: serializeMine(item),
    });
  }

  private requireUser(c: Context): AuthUser {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }
}
