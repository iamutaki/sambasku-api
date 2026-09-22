import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { CommentBlocklistRepository } from '@/modules/comment-blocklist/domain/repositories/comment-blocklist.repository';
import { applyBlocklistFilter } from '@/modules/comment-blocklist/application/utils/apply-blocklist-filter';
import type { Comment } from '../../domain/entities/comment.entity';
import type { CommentRepository } from '../../domain/repositories/comment.repository';

export interface CreateCommentCommand {
  wordId: string;
  userId: string;
  role: string;
  requestId?: string | null;
  body: string;
}

// Tulis komentar (09-api-comment.md). Post-moderation: langsung published.
// Body difilter lewat blocklist; jika berubah, body_original disimpan.
export class CreateCommentUseCase {
  constructor(
    private readonly commentRepo: CommentRepository,
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly blocklistRepo: CommentBlocklistRepository,
  ) {}

  async execute(cmd: CreateCommentCommand): Promise<Comment> {
    const word = await this.wordRepo.findById(cmd.wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    const blocked = await this.blocklistRepo.listAllActiveWords();
    const filteredBody = applyBlocklistFilter(cmd.body, blocked);
    const wasFiltered = filteredBody !== cmd.body;

    const comment = await this.commentRepo.create({
      wordId: cmd.wordId,
      userId: cmd.userId,
      body: filteredBody,
      bodyOriginal: wasFiltered ? cmd.body : null,
    });

    await this.auditRepo.record({
      userId: cmd.userId,
      action: 'create',
      entityType: 'comment',
      entityId: comment.id,
      newData: {
        word_id: cmd.wordId,
        body: comment.body,
        body_original: comment.bodyOriginal,
        status: 'published',
        censored: wasFiltered,
      },
      requestId: cmd.requestId ?? null,
    });

    return (await this.commentRepo.findById(comment.id)) ?? comment;
  }
}
