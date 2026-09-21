import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { BugReport, BugReportStatus } from '../../domain/entities/bug-report.entity';
import type { BugReportRepository } from '../../domain/repositories/bug-report.repository';

export interface ResolveBugReportCommand {
  id: string;
  actorId: string;
  status: Exclude<BugReportStatus, 'open'>;
  note?: string | null;
  requestId?: string | null;
}

export class ResolveBugReportUseCase {
  constructor(
    private readonly repo: BugReportRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: ResolveBugReportCommand): Promise<BugReport> {
    const existing = await this.repo.findById(cmd.id);
    if (!existing || existing.status !== 'open') {
      throw new NotFoundError('BUG_REPORT_NOT_FOUND', 'Laporan tidak ditemukan');
    }

    const note = cmd.note?.trim() ? cmd.note.trim() : null;
    const updated = await this.repo.resolve({
      id: existing.id,
      status: cmd.status,
      note,
      actorId: cmd.actorId,
    });
    if (!updated) {
      throw new NotFoundError('BUG_REPORT_NOT_FOUND', 'Laporan tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'bug_report',
      entityId: updated.id,
      oldData: { status: existing.status, resolution_note: existing.resolutionNote },
      newData: { status: updated.status, resolution_note: updated.resolutionNote },
      requestId: cmd.requestId ?? null,
    });

    return updated;
  }
}
