import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { Comment } from '../../domain/entities/comment.entity';
import type { CommentRepository } from '../../domain/repositories/comment.repository';

export interface ReviewCommentCommand {
  commentId: string;
  decision: 'approve' | 'reject';
  reviewerId: string;
  requestId?: string | null;
}

// Keputusan moderasi (09-api-comment.md): SATU use case dua decision -
// langkah identik, duplikasi use case hanya menambah file. approve →
// published (satu-satunya jalur tayang), reject → rejected (terminal).
// TANPA kolom alasan: keputusan moderasi komentar tidak butuh
// justifikasi tertulis untuk penulis (beda dari kontribusi kata).
export class ReviewCommentUseCase {
  constructor(
    private readonly commentRepo: CommentRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: ReviewCommentCommand): Promise<Comment> {
    const comment = await this.commentRepo.findById(cmd.commentId);
    if (!comment) {
      throw new NotFoundError('COMMENT_NOT_FOUND', 'Komentar tidak ditemukan');
    }

    const ok = await this.commentRepo.review(cmd.commentId, cmd.decision, cmd.reviewerId);
    if (!ok) {
      // Sudah punya keputusan / terhapus / kalah race dua moderator.
      throw new ConflictError('COMMENT_ALREADY_REVIEWED', 'Komentar sudah punya keputusan moderasi');
    }

    await this.auditRepo.record({
      userId: cmd.reviewerId,
      action: cmd.decision,
      entityType: 'comment',
      entityId: comment.id,
      oldData: { status: comment.status },
      newData: { status: cmd.decision === 'approve' ? 'published' : 'rejected' },
      requestId: cmd.requestId ?? null,
    });

    // Baca ulang hasil keputusan (status + reviewed_by/at yang sebenarnya)
    const reviewed = await this.commentRepo.findById(cmd.commentId);
    return reviewed ?? comment;
  }
}
