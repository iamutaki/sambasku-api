import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordReportReasonCode } from '@/modules/word/domain/entities/word.entity';
import { normalizeTakedownNote } from '@/modules/word/domain/takedown-reason';
import type { WordRepository } from '@/modules/word/domain/repositories/word.repository';
import type { WordReport } from '../../domain/entities/word-report.entity';
import type { WordReportRepository } from '../../domain/repositories/word-report.repository';

export interface CreateWordReportCommand {
  wordId: string;
  imageId?: string | null;
  userId: string;
  reasonCode: WordReportReasonCode;
  note?: string | null;
  requestId?: string | null;
}

export class CreateWordReportUseCase {
  constructor(
    private readonly reports: WordReportRepository,
    private readonly words: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: CreateWordReportCommand): Promise<WordReport> {
    const imageId = cmd.imageId?.trim() || null;
    if (cmd.reasonCode === 'violent_image' && !imageId) {
      throw new ValidationError([
        { field: 'image_id', message: 'ID foto wajib diisi untuk laporan kekerasan' },
      ]);
    }
    if (cmd.reasonCode !== 'violent_image' && imageId) {
      throw new ValidationError([
        { field: 'image_id', message: 'image_id hanya untuk alasan violent_image' },
      ]);
    }

    const note = normalizeTakedownNote(cmd.reasonCode, cmd.note);
    const word = await this.words.findById(cmd.wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }
    if (word.status !== 'published') {
      throw new ConflictError('WORD_NOT_REPORTABLE', 'Hanya entri yang tayang yang bisa dilaporkan');
    }

    if (imageId) {
      const image = await this.words.findWordImageById(imageId);
      if (!image || image.wordId !== cmd.wordId) {
        throw new NotFoundError('WORD_IMAGE_NOT_FOUND', 'Gambar kata tidak ditemukan');
      }
    }

    const open = await this.reports.findOpenByUserAndWord(cmd.userId, cmd.wordId, imageId);
    if (open) {
      throw new ConflictError(
        'WORD_REPORT_ALREADY_OPEN',
        imageId
          ? 'Kamu sudah melaporkan foto ini dan laporannya masih terbuka'
          : 'Kamu sudah melaporkan entri ini dan laporannya masih terbuka',
      );
    }

    const row = await this.reports.create({
      wordId: cmd.wordId,
      imageId,
      userId: cmd.userId,
      reasonCode: cmd.reasonCode,
      note,
    });

    await this.auditRepo.record({
      userId: cmd.userId,
      action: 'create',
      entityType: 'word_report',
      entityId: row.id,
      newData: {
        word_id: cmd.wordId,
        image_id: imageId,
        reason_code: cmd.reasonCode,
        status: 'open',
      },
      requestId: cmd.requestId ?? null,
    });

    return row;
  }
}
