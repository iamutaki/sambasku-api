import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { TranslationHelpReply } from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface TakedownTranslationHelpReplyCommand {
  replyId: string;
  reviewerId: string;
  requestId?: string | null;
}

export class TakedownTranslationHelpReplyUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: TakedownTranslationHelpReplyCommand): Promise<TranslationHelpReply> {
    const reply = await this.repo.findReplyById(cmd.replyId);
    if (!reply) {
      throw new NotFoundError(
        'TRANSLATION_HELP_REPLY_NOT_FOUND',
        'Balasan tidak ditemukan',
      );
    }

    const ok = await this.repo.takedownReply(cmd.replyId, cmd.reviewerId);
    if (!ok) {
      throw new ConflictError(
        'TRANSLATION_HELP_REPLY_NOT_FOUND',
        'Balasan sudah di-takedown atau tidak lagi diterbitkan',
      );
    }

    const help = await this.repo.findById(reply.helpId);
    if (help?.pinnedReplyId === reply.id) {
      await this.repo.setPinnedReply({
        helpId: reply.helpId,
        replyId: null,
        actorId: cmd.reviewerId,
      });
    }

    await this.auditRepo.record({
      userId: cmd.reviewerId,
      action: 'takedown',
      entityType: 'translation_help_reply',
      entityId: reply.id,
      oldData: { status: reply.status, help_id: reply.helpId },
      newData: { status: 'taken_down' },
      requestId: cmd.requestId ?? null,
    });

    return (await this.repo.findReplyById(cmd.replyId)) ?? reply;
  }
}
