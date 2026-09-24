import { ForbiddenError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface DeleteTranslationHelpReplyCommand {
  replyId: string;
  actorId: string;
  requestId?: string | null;
}

export class DeleteTranslationHelpReplyUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: DeleteTranslationHelpReplyCommand): Promise<void> {
    const reply = await this.repo.findReplyById(cmd.replyId);
    if (!reply) {
      throw new NotFoundError(
        'TRANSLATION_HELP_REPLY_NOT_FOUND',
        'Balasan tidak ditemukan',
      );
    }

    if (reply.userId !== cmd.actorId) {
      throw new ForbiddenError(
        'FORBIDDEN',
        'Hanya penulis yang dapat menghapus balasan ini. Verifikator memakai takedown.',
      );
    }

    if (reply.status !== 'published') {
      throw new NotFoundError(
        'TRANSLATION_HELP_REPLY_NOT_FOUND',
        'Balasan tidak ditemukan',
      );
    }

    const ok = await this.repo.markReplyDeletedByAuthor(cmd.replyId, cmd.actorId);
    if (!ok) {
      throw new NotFoundError(
        'TRANSLATION_HELP_REPLY_NOT_FOUND',
        'Balasan tidak ditemukan',
      );
    }

    const help = await this.repo.findById(reply.helpId);
    if (help?.pinnedReplyId === reply.id) {
      await this.repo.setPinnedReply({
        helpId: reply.helpId,
        replyId: null,
        actorId: cmd.actorId,
      });
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'delete',
      entityType: 'translation_help_reply',
      entityId: reply.id,
      oldData: { help_id: reply.helpId, status: reply.status },
      newData: { status: 'deleted_by_author' },
      requestId: cmd.requestId ?? null,
    });
  }
}
