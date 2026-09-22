import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { CreateBlocklistWordUseCase } from '../../application/use-cases/create-blocklist-word.use-case';
import type { ListBlocklistWordsUseCase } from '../../application/use-cases/list-blocklist-words.use-case';
import type { DeleteBlocklistWordUseCase } from '../../application/use-cases/delete-blocklist-word.use-case';
import type {
  CreateBlocklistWordBody,
  ListBlocklistQueryBody,
} from './validators/comment-blocklist.validator';

export class CommentBlocklistController {
  constructor(
    private readonly deps: {
      create: CreateBlocklistWordUseCase;
      list: ListBlocklistWordsUseCase;
      delete: DeleteBlocklistWordUseCase;
    },
  ) {}

  async list(c: Context, query: ListBlocklistQueryBody) {
    const page = await this.deps.list.execute(query);
    return c.json({
      success: true as const,
      data: page.items.map((w) => ({
        id: w.id,
        word: w.word,
        created_by: w.createdBy,
        created_at: w.createdAt.toISOString(),
      })),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  async create(c: Context, body: CreateBlocklistWordBody) {
    const actor = this.requireUser(c);
    const created = await this.deps.create.execute({
      word: body.word,
      actorId: actor.user_id,
      requestId: this.requestId(c),
    });
    logger.info({ request_id: this.requestId(c), word: created.word }, 'blocklist word created');
    return c.json(
      {
        success: true as const,
        data: {
          id: created.id,
          word: created.word,
          created_by: created.createdBy,
          created_at: created.createdAt.toISOString(),
        },
      },
      201,
    );
  }

  async delete(c: Context, id: string) {
    const actor = this.requireUser(c);
    await this.deps.delete.execute({
      id,
      actorId: actor.user_id,
      requestId: this.requestId(c),
    });
    logger.info({ request_id: this.requestId(c), id }, 'blocklist word deleted');
    return c.json({ success: true as const, data: null });
  }

  private requireUser(c: Context): { user_id: string; role: string } {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }

  private requestId(c: Context): string | undefined {
    return (c as Context<{ Variables: AppVariables }>).get('requestId');
  }
}
