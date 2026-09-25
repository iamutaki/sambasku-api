import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import type { TakedownReasonCode } from '../../domain/entities/word.entity';
import { normalizeTakedownNote } from '../../domain/takedown-reason';
import type { WordRepository } from '../../domain/repositories/word.repository';

export interface CloseOpenWordReports {
  closeOpenForWord(wordId: string, actorId: string, note: string | null): Promise<void>;
}

export interface TakedownWordCommand {
  wordId: string;
  actorId: string;
  reasonCode: TakedownReasonCode;
  note?: string | null;
  requestId?: string | null;
}

/**
 * Tarik entri yang tayang. Status `taken_down` menyembunyikannya dari
 * publik tanpa soft-delete. Laporan terbuka pada kata yang sama ikut ditutup.
 */
export class TakedownWordUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly reports: CloseOpenWordReports,
    private readonly inbox?: RecordInboxNotificationUseCase,
  ) {}

  async execute(cmd: TakedownWordCommand): Promise<void> {
    const note = normalizeTakedownNote(cmd.reasonCode, cmd.note);
    const existing = await this.wordRepo.findById(cmd.wordId);
    if (!existing) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }
    if (existing.status !== 'published') {
      throw new ConflictError(
        'WORD_ALREADY_MODERATED',
        'Hanya entri yang tayang yang bisa ditarik',
      );
    }

    const ok = await this.wordRepo.takedown(cmd.wordId, {
      actorId: cmd.actorId,
      reasonCode: cmd.reasonCode,
      note,
    });
    if (!ok) {
      throw new ConflictError(
        'WORD_ALREADY_MODERATED',
        'Hanya entri yang tayang yang bisa ditarik',
      );
    }

    await this.reports.closeOpenForWord(cmd.wordId, cmd.actorId, note);

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'takedown',
      entityType: 'word',
      entityId: cmd.wordId,
      oldData: { status: 'published', lemma: existing.lemma },
      newData: {
        status: 'taken_down',
        reason_code: cmd.reasonCode,
        note,
      },
      requestId: cmd.requestId ?? null,
    });

    if (existing.createdBy && this.inbox) {
      await this.inbox.execute({
        userId: existing.createdBy,
        type: 'word_taken_down',
        targetKind: 'word',
        targetId: cmd.wordId,
        body: `Entri "${existing.lemma}" ditarik dari kamus.`,
        refreshOnConflict: true,
        actorId: cmd.actorId,
      });
    }
  }
}
