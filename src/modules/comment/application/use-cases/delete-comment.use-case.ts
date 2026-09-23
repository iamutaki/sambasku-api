import { ForbiddenError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { CommentRepository } from '../../domain/repositories/comment.repository';

export interface DeleteCommentCommand {
  commentId: string;
  actorId: string;
  role: string;
  requestId?: string | null;
}

// Hapus oleh penulis → status deleted_by_author (tetap di list publik,
// body di-redact). Verifikator memakai takedown, bukan endpoint ini.
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

    if (comment.userId !== cmd.actorId) {
      throw new ForbiddenError(
        'FORBIDDEN',
        'Hanya penulis yang dapat menghapus komentar ini. Verifikator memakai takedown.',
      );
    }

    if (comment.status !== 'published') {
      throw new NotFoundError('COMMENT_NOT_FOUND', 'Komentar tidak ditemukan');
    }

    const ok = await this.commentRepo.markDeletedByAuthor(cmd.commentId, cmd.actorId);
    if (!ok) {
      throw new NotFoundError('COMMENT_NOT_FOUND', 'Komentar tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'delete',
      entityType: 'comment',
      entityId: comment.id,
      oldData: { word_id: comment.wordId, body: comment.body, status: comment.status },
      newData: { status: 'deleted_by_author' },
      requestId: cmd.requestId ?? null,
    });
  }
}
