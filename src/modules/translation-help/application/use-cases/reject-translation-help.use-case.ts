import { NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { ImageStoragePort } from '@/modules/image/application/ports/image-storage.port';
import type { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import type { TranslationHelp } from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface RejectTranslationHelpCommand {
  id: string;
  actorId: string;
  note: string;
  requestId?: string | null;
}

export class RejectTranslationHelpUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly imageStorage: ImageStoragePort,
    private readonly auditRepo: AuditLogRepository,
    private readonly inbox?: RecordInboxNotificationUseCase,
  ) {}

  async execute(cmd: RejectTranslationHelpCommand): Promise<TranslationHelp> {
    const note = cmd.note.trim();
    if (note.length < 1) {
      throw new ValidationError([{ field: 'note', message: 'Alasan penolakan wajib diisi' }]);
    }
    if (note.length > 2000) {
      throw new ValidationError([{ field: 'note', message: 'Alasan penolakan maksimal 2000 karakter' }]);
    }

    const existing = await this.repo.findById(cmd.id);
    if (!existing || existing.status !== 'pending_review') {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    for (const img of existing.images) {
      // deleteFile ImageKit sudah best-effort (log internal, tidak lempar)
      await this.imageStorage.deleteFile(img.providerFileId);
    }

    const updated = await this.repo.updateStatus({
      id: existing.id,
      fromStatus: 'pending_review',
      toStatus: 'rejected',
      actorId: cmd.actorId,
      rejectionNote: note,
      images: existing.images.map((img) => ({
        ...img,
        // Staging sudah dihapus; kosongkan URL privat agar tidak bocor di admin lama
        url: '',
      })),
    });
    if (!updated) {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'translation_help',
      entityId: updated.id,
      oldData: { status: existing.status },
      newData: { status: updated.status, rejection_note: note },
      requestId: cmd.requestId ?? null,
    });

    await this.inbox?.execute({
      userId: existing.userId,
      type: 'translation_help_rejected',
      targetKind: 'translation_help',
      targetId: updated.id,
      body: note,
      actorId: cmd.actorId,
    });

    return updated;
  }
}
