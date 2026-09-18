import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { Comment } from '../../domain/entities/comment.entity';
import type { CommentRepository } from '../../domain/repositories/comment.repository';

export interface CreateCommentCommand {
  wordId: string;
  userId: string;
  role: string;
  requestId?: string | null;
  body: string;
}

// Tulis komentar (09-api-comment.md). PRE-MODERATION: langsung
// pending_review - tampil publik hanya setelah approve verifikator.
// Cek kata: ada & belum soft-deleted saja (TIDAK memfilter status -
// konsisten dengan vote 08).
export class CreateCommentUseCase {
  constructor(
    private readonly commentRepo: CommentRepository,
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: CreateCommentCommand): Promise<Comment> {
    const word = await this.wordRepo.findById(cmd.wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    const comment = await this.commentRepo.create({
      wordId: cmd.wordId,
      userId: cmd.userId,
      body: cmd.body,
    });

    await this.auditRepo.record({
      userId: cmd.userId,
      action: 'create',
      entityType: 'comment',
      entityId: comment.id,
      newData: { word_id: cmd.wordId, body: comment.body },
      requestId: cmd.requestId ?? null,
    });

    // Read-back untuk username ter-join (create tidak JOIN; path non-hot,
    // satu query PK tambahan tidak masalah)
    return (await this.commentRepo.findById(comment.id)) ?? comment;
  }
}
