import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { CreateCommentUseCase } from '../../application/use-cases/create-comment.use-case';
import type { ListWordCommentsUseCase } from '../../application/use-cases/list-word-comments.use-case';
import type { DeleteCommentUseCase } from '../../application/use-cases/delete-comment.use-case';
import type { ListAdminCommentsUseCase } from '../../application/use-cases/list-admin-comments.use-case';
import type { TakedownCommentUseCase } from '../../application/use-cases/takedown-comment.use-case';
import type { UncensorCommentUseCase } from '../../application/use-cases/uncensor-comment.use-case';
import type { ListMyCommentsUseCase } from '../../application/use-cases/list-my-comments.use-case';
import type { Comment } from '../../domain/entities/comment.entity';
import type {
  CreateCommentBody,
  ListAdminCommentsQueryBody,
  ListCommentsQueryBody,
  ListMyCommentsQueryBody,
} from './validators/comment.validator';

function redactPublicBody(cm: Comment): string | null {
  return cm.status === 'published' ? cm.body : null;
}

export class CommentController {
  constructor(
    private readonly deps: {
      create: CreateCommentUseCase;
      listByWord: ListWordCommentsUseCase;
      delete: DeleteCommentUseCase;
      listAdmin: ListAdminCommentsUseCase;
      listMine: ListMyCommentsUseCase;
      takedown: TakedownCommentUseCase;
      uncensor: UncensorCommentUseCase;
    },
  ) {}

  async create(c: Context, wordId: string, body: CreateCommentBody) {
    const actor = this.requireUser(c);
    const comment = await this.deps.create.execute({
      wordId,
      userId: actor.user_id,
      role: actor.role,
      requestId: this.requestId(c),
      body: body.body,
    });

    logger.info({ request_id: this.requestId(c), comment_id: comment.id, word_id: wordId }, 'comment created');

    return c.json(
      {
        success: true as const,
        data: {
          id: comment.id,
          word_id: comment.wordId,
          word_lemma: comment.wordLemma,
          user_id: comment.userId,
          username: comment.username,
          body: comment.body,
          status: comment.status,
          created_at: comment.createdAt.toISOString(),
        },
      },
      201,
    );
  }

  async listByWord(c: Context, wordId: string, query: ListCommentsQueryBody) {
    const page = await this.deps.listByWord.execute(wordId, query);
    return c.json({
      success: true as const,
      data: page.items.map((cm) => ({
        id: cm.id,
        word_id: cm.wordId,
        word_lemma: cm.wordLemma,
        user_id: cm.userId,
        username: cm.username,
        body: redactPublicBody(cm),
        status: cm.status,
        created_at: cm.createdAt.toISOString(),
        upvotes: cm.upvotes,
        downvotes: cm.downvotes,
      })),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  async delete(c: Context, id: string) {
    const actor = this.requireUser(c);
    await this.deps.delete.execute({
      commentId: id,
      actorId: actor.user_id,
      role: actor.role,
      requestId: this.requestId(c),
    });

    logger.info({ request_id: this.requestId(c), comment_id: id }, 'comment deleted by author');
    return c.json({ success: true as const, data: null });
  }

  async my(c: Context, query: ListMyCommentsQueryBody) {
    const actor = this.requireUser(c);
    const page = await this.deps.listMine.execute({
      userId: actor.user_id,
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: page.items.map((cm) => ({
        id: cm.id,
        word_id: cm.wordId,
        word_lemma: cm.wordLemma,
        body: cm.body,
        status: cm.status,
        created_at: cm.createdAt.toISOString(),
        reviewed_at: cm.reviewedAt ? cm.reviewedAt.toISOString() : null,
      })),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  async listAdmin(c: Context, query: ListAdminCommentsQueryBody) {
    const page = await this.deps.listAdmin.execute({
      status: query.status,
      wordId: query.word_id,
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      success: true as const,
      data: page.items.map((cm) => ({
        id: cm.id,
        word_id: cm.wordId,
        word_lemma: cm.wordLemma,
        user_id: cm.userId,
        username: cm.username,
        body: cm.body,
        body_original: cm.bodyOriginal,
        is_censored: cm.bodyOriginal != null,
        status: cm.status,
        reviewed_by: cm.reviewedBy,
        reviewed_at: cm.reviewedAt ? cm.reviewedAt.toISOString() : null,
        created_at: cm.createdAt.toISOString(),
      })),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  async takedown(c: Context, id: string) {
    const actor = this.requireUser(c);
    const reviewed = await this.deps.takedown.execute({
      commentId: id,
      reviewerId: actor.user_id,
      requestId: this.requestId(c),
    });

    logger.info({ request_id: this.requestId(c), comment_id: id }, 'comment taken down');

    return c.json({
      success: true as const,
      data: {
        id: reviewed.id,
        status: 'taken_down' as const,
        reviewed_by: reviewed.reviewedBy!,
        reviewed_at: reviewed.reviewedAt!.toISOString(),
      },
    });
  }

  async uncensor(c: Context, id: string) {
    const actor = this.requireUser(c);
    const updated = await this.deps.uncensor.execute({
      commentId: id,
      actorId: actor.user_id,
      requestId: this.requestId(c),
    });

    logger.info({ request_id: this.requestId(c), comment_id: id }, 'comment uncensored');

    return c.json({
      success: true as const,
      data: {
        id: updated.id,
        body: updated.body,
        body_original: updated.bodyOriginal,
        is_censored: false as const,
      },
    });
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
