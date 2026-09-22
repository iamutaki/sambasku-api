import { BadRequestError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Comment } from '../../domain/entities/comment.entity';
import type { CommentRepository } from '../../domain/repositories/comment.repository';

export interface UncensorCommentCommand {
  commentId: string;
  actorId: string;
  requestId?: string | null;
}

/** Pulihkan body dari body_original (sensor blocklist salah). */
export class UncensorCommentUseCase {
  constructor(
    private readonly commentRepo: CommentRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: UncensorCommentCommand): Promise<Comment> {
    const comment = await this.commentRepo.findById(cmd.commentId);
    if (!comment) {
      throw new NotFoundError('COMMENT_NOT_FOUND', 'Komentar tidak ditemukan');
    }
    if (!comment.bodyOriginal) {
      throw new BadRequestError('COMMENT_NOT_CENSORED', 'Komentar ini tidak memiliki teks yang disensor');
    }

    const ok = await this.commentRepo.uncensor(cmd.commentId);
    if (!ok) {
      throw new NotFoundError('COMMENT_NOT_FOUND', 'Komentar tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'uncensor',
      entityType: 'comment',
      entityId: comment.id,
      oldData: { body: comment.body, body_original: comment.bodyOriginal },
      newData: { body: comment.bodyOriginal, body_original: null },
      requestId: cmd.requestId ?? null,
    });

    const updated = await this.commentRepo.findById(cmd.commentId);
    return updated ?? { ...comment, body: comment.bodyOriginal, bodyOriginal: null };
  }
}
