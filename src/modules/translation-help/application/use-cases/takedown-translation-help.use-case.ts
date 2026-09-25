import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import type { TranslationHelp } from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface TakedownTranslationHelpCommand {
  id: string;
  actorId: string;
  requestId?: string | null;
}

export class TakedownTranslationHelpUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly inbox?: RecordInboxNotificationUseCase,
  ) {}

  async execute(cmd: TakedownTranslationHelpCommand): Promise<TranslationHelp> {
    const existing = await this.repo.findById(cmd.id);
    if (!existing || existing.status !== 'published') {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    const updated = await this.repo.updateStatus({
      id: existing.id,
      fromStatus: 'published',
      toStatus: 'taken_down',
      actorId: cmd.actorId,
    });
    if (!updated) {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'takedown',
      entityType: 'translation_help',
      entityId: updated.id,
      oldData: { status: existing.status },
      newData: { status: updated.status },
      requestId: cmd.requestId ?? null,
    });

    await this.inbox?.execute({
      userId: existing.userId,
      type: 'translation_help_taken_down',
      targetKind: 'translation_help',
      targetId: updated.id,
      actorId: cmd.actorId,
    });

    return updated;
  }
}
