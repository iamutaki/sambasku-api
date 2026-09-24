import { NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { TranslationHelp } from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface PinTranslationHelpReplyCommand {
  helpId: string;
  replyId: string;
  actorId: string;
  requestId?: string | null;
}

export class PinTranslationHelpReplyUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: PinTranslationHelpReplyCommand): Promise<TranslationHelp> {
    const help = await this.repo.findById(cmd.helpId);
    if (!help) {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    const reply = await this.repo.findReplyById(cmd.replyId);
    if (!reply || reply.helpId !== cmd.helpId) {
      throw new NotFoundError(
        'TRANSLATION_HELP_REPLY_NOT_FOUND',
        'Balasan tidak ditemukan',
      );
    }
    if (reply.status !== 'published') {
      throw new ValidationError([
        { field: 'reply_id', message: 'Hanya balasan yang tayang yang bisa di-pin' },
      ]);
    }

    const updated = await this.repo.setPinnedReply({
      helpId: cmd.helpId,
      replyId: cmd.replyId,
      actorId: cmd.actorId,
    });
    if (!updated) {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'translation_help',
      entityId: updated.id,
      oldData: { pinned_reply_id: help.pinnedReplyId },
      newData: { pinned_reply_id: cmd.replyId },
      requestId: cmd.requestId ?? null,
    });

    return updated;
  }
}
