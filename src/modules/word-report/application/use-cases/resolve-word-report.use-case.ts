import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { SetWordImageContentWarningsUseCase } from '@/modules/word/application/use-cases/set-word-image-content-warnings.use-case';
import type { TakedownWordUseCase } from '@/modules/word/application/use-cases/takedown-word.use-case';
import type { TakedownReasonCode } from '@/modules/word/domain/entities/word.entity';
import { normalizeTakedownNote } from '@/modules/word/domain/takedown-reason';
import type { WordReport, WordReportResolution } from '../../domain/entities/word-report.entity';
import type { WordReportRepository } from '../../domain/repositories/word-report.repository';

export interface ResolveWordReportCommand {
  id: string;
  actorId: string;
  resolution: Exclude<WordReportResolution, 'taken_down' | 'flagged_image'>;
  note?: string | null;
  requestId?: string | null;
}

export interface TakedownWordReportCommand {
  id: string;
  actorId: string;
  reasonCode: TakedownReasonCode;
  note?: string | null;
  requestId?: string | null;
}

export interface FlagViolentImageReportCommand {
  id: string;
  actorId: string;
  note?: string | null;
  requestId?: string | null;
}

export class ResolveWordReportUseCase {
  constructor(
    private readonly reports: WordReportRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: ResolveWordReportCommand): Promise<WordReport> {
    const note = cmd.note?.trim() ? cmd.note.trim() : null;
    if (note && note.length > 1000) {
      throw new ValidationError([{ field: 'note', message: 'Catatan maksimal 1000 karakter' }]);
    }

    const existing = await this.reports.findById(cmd.id);
    if (!existing) {
      throw new NotFoundError('WORD_REPORT_NOT_FOUND', 'Laporan entri tidak ditemukan');
    }
    if (existing.status !== 'open') {
      throw new ConflictError('WORD_REPORT_ALREADY_RESOLVED', 'Laporan ini sudah ditutup');
    }

    const ok = await this.reports.resolveOne({
      id: cmd.id,
      resolution: cmd.resolution,
      note,
      actorId: cmd.actorId,
    });
    if (!ok) {
      throw new ConflictError('WORD_REPORT_ALREADY_RESOLVED', 'Laporan ini sudah ditutup');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: cmd.resolution === 'dismissed' ? 'dismiss' : 'mark_corrected',
      entityType: 'word_report',
      entityId: cmd.id,
      oldData: { status: 'open', word_id: existing.wordId, image_id: existing.imageId },
      newData: { status: 'resolved', resolution: cmd.resolution },
      requestId: cmd.requestId ?? null,
    });

    const updated = await this.reports.findById(cmd.id);
    return updated ?? { ...existing, status: 'resolved', resolution: cmd.resolution, resolutionNote: note };
  }
}

/** Tarik kata dari satu laporan, dan tutup semua laporan terbuka pada kata itu. */
export class TakedownWordReportUseCase {
  constructor(
    private readonly reports: WordReportRepository,
    private readonly takedownWord: TakedownWordUseCase,
  ) {}

  async execute(cmd: TakedownWordReportCommand): Promise<void> {
    normalizeTakedownNote(cmd.reasonCode, cmd.note);
    const existing = await this.reports.findById(cmd.id);
    if (!existing) {
      throw new NotFoundError('WORD_REPORT_NOT_FOUND', 'Laporan entri tidak ditemukan');
    }
    if (existing.status !== 'open') {
      throw new ConflictError('WORD_REPORT_ALREADY_RESOLVED', 'Laporan ini sudah ditutup');
    }

    await this.takedownWord.execute({
      wordId: existing.wordId,
      actorId: cmd.actorId,
      reasonCode: cmd.reasonCode,
      note: cmd.note,
      requestId: cmd.requestId,
    });
  }
}

/**
 * Resolve laporan foto kekerasan: set content_warnings pada foto,
 * tutup laporan sebagai flagged_image (bukan takedown kata).
 */
export class FlagViolentImageReportUseCase {
  constructor(
    private readonly reports: WordReportRepository,
    private readonly setWarnings: SetWordImageContentWarningsUseCase,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: FlagViolentImageReportCommand): Promise<WordReport> {
    const note = cmd.note?.trim() ? cmd.note.trim() : null;
    if (note && note.length > 1000) {
      throw new ValidationError([{ field: 'note', message: 'Catatan maksimal 1000 karakter' }]);
    }

    const existing = await this.reports.findById(cmd.id);
    if (!existing) {
      throw new NotFoundError('WORD_REPORT_NOT_FOUND', 'Laporan entri tidak ditemukan');
    }
    if (existing.status !== 'open') {
      throw new ConflictError('WORD_REPORT_ALREADY_RESOLVED', 'Laporan ini sudah ditutup');
    }
    if (!existing.imageId || existing.reasonCode !== 'violent_image') {
      throw new ValidationError([
        {
          field: 'id',
          message: 'Hanya laporan foto kekerasan yang bisa ditandai lewat aksi ini',
        },
      ]);
    }

    await this.setWarnings.execute(existing.imageId, {
      contentWarnings: ['kekerasan'],
      actorId: cmd.actorId,
      requestId: cmd.requestId,
    });

    const ok = await this.reports.resolveOne({
      id: cmd.id,
      resolution: 'flagged_image',
      note,
      actorId: cmd.actorId,
    });
    if (!ok) {
      throw new ConflictError('WORD_REPORT_ALREADY_RESOLVED', 'Laporan ini sudah ditutup');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'flag_violent_image',
      entityType: 'word_report',
      entityId: cmd.id,
      oldData: { status: 'open', word_id: existing.wordId, image_id: existing.imageId },
      newData: { status: 'resolved', resolution: 'flagged_image' },
      requestId: cmd.requestId ?? null,
    });

    const updated = await this.reports.findById(cmd.id);
    return (
      updated ?? {
        ...existing,
        status: 'resolved',
        resolution: 'flagged_image',
        resolutionNote: note,
      }
    );
  }
}
