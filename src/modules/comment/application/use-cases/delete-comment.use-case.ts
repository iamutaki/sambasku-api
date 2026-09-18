import { ForbiddenError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { CommentRepository } from '../../domain/repositories/comment.repository';

export interface DeleteCommentCommand {
  commentId: string;
  actorId: string;
  role: string;
  requestId?: string | null;
}

// Hapus komentar (09-api-comment.md): PENULIS sendiri ATAU verifikator
// (admin/root/reviewer). Otorisasi ada di use case (butuh data komentar),
// bukan middleware - beda dari endpoint admin murni. Soft-delete;
// admin tetap bisa lihat jejaknya di audit trail.
export class DeleteCommentUseCase {
  constructor(
    private readonly commentRepo: CommentRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: DeleteCommentCommand): Promise<void> {
    const comment = await this.commentRepo.findById(cmd.commentId);
    if (!comment) {
      throw new NotFoundError('COMMENT_NOT_FOUND', 'Komentar tidak ditemukan');
    }

    const isAuthor = comment.userId === cmd.actorId;
    const isVerifier = ['admin', 'root', 'reviewer'].includes(cmd.role);
    if (!isAuthor && !isVerifier) {
      throw new ForbiddenError();
    }

    const ok = await this.commentRepo.softDelete(cmd.commentId, cmd.actorId);
    if (!ok) {
      throw new NotFoundError('COMMENT_NOT_FOUND', 'Komentar tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'delete',
      entityType: 'comment',
      entityId: comment.id,
      oldData: { word_id: comment.wordId, body: comment.body, status: comment.status },
      requestId: cmd.requestId ?? null,
    });
  }
}
