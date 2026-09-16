import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { ListSearchMissesUseCase } from '../../application/use-cases/list-search-misses.use-case';
import type { DismissSearchMissUseCase } from '../../application/use-cases/dismiss-search-miss.use-case';
import type {
  AdminSearchMissQueryBody,
  PublicSearchMissQueryBody,
} from './validators/search-miss.validator';

export class SearchMissController {
  constructor(
    private readonly deps: {
      list: ListSearchMissesUseCase;
      dismiss: DismissSearchMissUseCase;
    },
  ) {}

  /** Beranda publik — peluang kontribusi (paling dicari, belum terjawab) */
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

  /** Panel admin — semua miss + filter status terjawab */
  async listAdmin(c: Context, query: AdminSearchMissQueryBody) {
    const { items, nextCursor, hasMore } = await this.deps.list.execute({
      scope: 'admin',
      direction: query.direction,
      fulfilled: query.fulfilled,
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
}

function toApi(item: {
  id: string;
  term: string;
  direction: string;
  hitCount: number;
  lastSearchedAt: Date;
  isFulfilled: boolean;
  createdAt: Date;
}) {
  return {
    id: item.id,
    term: item.term,
    direction: item.direction,
    hit_count: item.hitCount,
    last_searched_at: item.lastSearchedAt.toISOString(),
    is_fulfilled: item.isFulfilled,
    created_at: item.createdAt.toISOString(),
  };
}
