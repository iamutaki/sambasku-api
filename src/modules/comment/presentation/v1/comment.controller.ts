import type { Context } from 'hono';
import { logger } from '@/shared/logging/logger';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables } from '@/shared/types';
import type { CreateCommentUseCase } from '../../application/use-cases/create-comment.use-case';
import type { ListWordCommentsUseCase } from '../../application/use-cases/list-word-comments.use-case';
import type { DeleteCommentUseCase } from '../../application/use-cases/delete-comment.use-case';
import type { ListAdminCommentsUseCase } from '../../application/use-cases/list-admin-comments.use-case';
import type { ReviewCommentUseCase } from '../../application/use-cases/review-comment.use-case';
import type { Comment } from '../../domain/entities/comment.entity';
import type { CreateCommentBody, ListAdminCommentsQueryBody, ListCommentsQueryBody } from './validators/comment.validator';

export class CommentController {
  constructor(
    private readonly deps: {
      create: CreateCommentUseCase;
      listByWord: ListWordCommentsUseCase;
      delete: DeleteCommentUseCase;
      listAdmin: ListAdminCommentsUseCase;
      review: ReviewCommentUseCase;
    },
  ) {}

  /** POST /api/v1/words/:wordId/comments - tulis komentar (pending_review) */
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
      { success: true as const, data: this.toPublicJson(comment) },
      201,
    );
  }

  /** GET /api/v1/words/:wordId/comments - list published (publik) */
  async listByWord(c: Context, wordId: string, query: ListCommentsQueryBody) {
    const page = await this.deps.listByWord.execute(wordId, query);
    return c.json({
      success: true as const,
      data: page.items.map((cm) => ({
        id: cm.id,
        word_id: cm.wordId,
        user_id: cm.userId,
        username: cm.username,
        body: cm.body,
        created_at: cm.createdAt.toISOString(),
        upvotes: cm.upvotes,
        downvotes: cm.downvotes,
      })),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  /** DELETE /api/v1/comments/:id - penulis sendiri atau verifikator */
  async delete(c: Context, id: string) {
    const actor = this.requireUser(c);
    await this.deps.delete.execute({
      commentId: id,
      actorId: actor.user_id,
      role: actor.role,
      requestId: this.requestId(c),
    });

    logger.info({ request_id: this.requestId(c), comment_id: id }, 'comment soft-deleted');
    return c.json({ success: true as const, data: null });
  }

  /** GET /api/v1/admin/comments - antrean moderasi (filter status/word_id) */
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
        user_id: cm.userId,
        username: cm.username,
        body: cm.body,
        status: cm.status,
        reviewed_by: cm.reviewedBy,
        reviewed_at: cm.reviewedAt ? cm.reviewedAt.toISOString() : null,
        created_at: cm.createdAt.toISOString(),
      })),
      meta: { limit: query.limit, next_cursor: page.nextCursor, has_more: page.hasMore },
    });
  }

  /** POST /api/v1/admin/comments/:id/approve|reject - keputusan moderasi */
  async review(c: Context, id: string, decision: 'approve' | 'reject') {
    const actor = this.requireUser(c);
    const reviewed = await this.deps.review.execute({
      commentId: id,
      decision,
      reviewerId: actor.user_id,
      requestId: this.requestId(c),
    });

    logger.info({ request_id: this.requestId(c), comment_id: id, decision }, 'comment reviewed');

    return c.json({
      success: true as const,
      data: {
        id: reviewed.id,
        status: reviewed.status,
        reviewed_by: reviewed.reviewedBy,
        reviewed_at: reviewed.reviewedAt ? reviewed.reviewedAt.toISOString() : null,
      },
    });
  }

  private toPublicJson(cm: Comment) {
    return {
      id: cm.id,
      word_id: cm.wordId,
      user_id: cm.userId,
      username: cm.username,
      body: cm.body,
      status: cm.status,
      created_at: cm.createdAt.toISOString(),
    };
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
