import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { ListSearchMissesUseCase } from '../../application/use-cases/list-search-misses.use-case';
import type { DismissSearchMissUseCase } from '../../application/use-cases/dismiss-search-miss.use-case';
import type { BulkDismissSearchMissUseCase } from '../../application/use-cases/bulk-dismiss-search-miss.use-case';
import type { UpdateSearchMissUseCase } from '../../application/use-cases/update-search-miss.use-case';
import type { ResolveSearchMissUseCase } from '../../application/use-cases/resolve-search-miss.use-case';
import type {
  AdminSearchMissQueryBody,
  BulkDismissSearchMissBody,
  PublicSearchMissQueryBody,
  ResolveSearchMissBody,
  UpdateSearchMissBody,
} from './validators/search-miss.validator';

export class SearchMissController {
  constructor(
    private readonly deps: {
      list: ListSearchMissesUseCase;
      dismiss: DismissSearchMissUseCase;
      bulkDismiss: BulkDismissSearchMissUseCase;
      update: UpdateSearchMissUseCase;
      resolve: ResolveSearchMissUseCase;
    },
  ) {}

  /** Beranda publik - peluang kontribusi (paling dicari, belum terjawab, tayang) */
  async listPublic(c: Context, query: PublicSearchMissQueryBody) {
    const { items, nextCursor, hasMore } = await this.deps.list.execute({
      scope: 'public',
      direction: query.direction,
      limit: query.limit,
    });
    return c.json({
      success: true as const,
      data: items.map(toApi),
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    });
  }

  /** Panel admin - semua miss + filter status terjawab / tayang */
  async listAdmin(c: Context, query: AdminSearchMissQueryBody) {
    const { items, nextCursor, hasMore } = await this.deps.list.execute({
      scope: 'admin',
      direction: query.direction,
      fulfilled: query.fulfilled,
      visible: query.visible,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: items.map(toApi),
      meta: { limit: query.limit, next_cursor: nextCursor, has_more: hasMore },
    });
  }

  async dismiss(c: Context, id: string) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    await this.deps.dismiss.execute({ missId: id, actorId: actor.user_id, requestId });
    return c.json({ success: true as const, data: null });
  }

  /** Mass dismiss - POST /api/v1/admin/search-misses/bulk-dismiss */
  async bulkDismiss(c: Context, body: BulkDismissSearchMissBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    const data = await this.deps.bulkDismiss.execute({
      ids: body.ids,
      actorId: actor.user_id,
      requestId,
    });
    return c.json({ success: true as const, data });
  }

  async update(c: Context, id: string, body: UpdateSearchMissBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    const item = await this.deps.update.execute({
      missId: id,
      actorId: actor.user_id,
      term: body.term,
      isVisible: body.is_visible,
      requestId,
    });
    return c.json({ success: true as const, data: toApi(item) });
  }

  async resolve(c: Context, id: string, body: ResolveSearchMissBody) {
    const actor = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!actor) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    const requestId = (c as Context<{ Variables: AppVariables }>).get('requestId');
    const result = await this.deps.resolve.execute({
      missId: id,
      actorId: actor.user_id,
      action: body.action,
      wordId: body.word_id,
      meaningId: body.meaning_id,
      requestId,
    });
    return c.json({
      success: true as const,
      data: {
        ...toApi(result.miss),
        resolved_as: result.action,
        target_word_id: result.targetWordId,
        created_word_id: result.createdWordId,
        variant_id: result.variantId,
      },
    });
  }
}

function toApi(item: {
  id: string;
  term: string;
  direction: string;
  hitCount: number;
  lastSearchedAt: Date;
  isFulfilled: boolean;
  isVisible: boolean;
  createdAt: Date;
}) {
  return {
    id: item.id,
    term: item.term,
    direction: item.direction,
    hit_count: item.hitCount,
    last_searched_at: item.lastSearchedAt.toISOString(),
    is_fulfilled: item.isFulfilled,
    is_visible: item.isVisible,
    created_at: item.createdAt.toISOString(),
  };
}
