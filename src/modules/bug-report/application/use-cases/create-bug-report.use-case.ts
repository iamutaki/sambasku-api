import { ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type {
  BugReport,
  BugReportImage,
  BugReportPlatform,
  NewBugReport,
} from '../../domain/entities/bug-report.entity';
import type { BugReportRepository } from '../../domain/repositories/bug-report.repository';

export interface CreateBugReportCommand {
  userId: string | null;
  deviceId: string | null;
  description: string;
  images: BugReportImage[];
  appVersion: string | null;
  platform: BugReportPlatform | null;
  requestId?: string | null;
}

export class CreateBugReportUseCase {
  constructor(
    private readonly repo: BugReportRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: CreateBugReportCommand): Promise<BugReport> {
    const description = cmd.description.trim();
    if (description.length < 10) {
      throw new ValidationError([
        { field: 'description', message: 'Keterangan wajib diisi minimal 10 karakter' },
      ]);
    }
    if (description.length > 2000) {
      throw new ValidationError([
        { field: 'description', message: 'Keterangan maksimal 2000 karakter' },
      ]);
    }
    if (cmd.images.length > 4) {
      throw new ValidationError([
        { field: 'images', message: 'Lampiran tidak boleh lebih dari 4 gambar' },
      ]);
    }
    for (const img of cmd.images) {
      if (!/^https?:\/\//i.test(img.url)) {
        throw new ValidationError([{ field: 'images', message: 'Alamat gambar tidak valid' }]);
      }
      if (!img.providerFileId.trim()) {
        throw new ValidationError([{ field: 'images', message: 'Alamat gambar tidak valid' }]);
      }
    }

    const input: NewBugReport = {
      userId: cmd.userId,
      deviceId: cmd.deviceId,
      description,
      images: cmd.images,
      appVersion: cmd.appVersion,
      platform: cmd.platform,
    };
    const row = await this.repo.create(input);

    await this.auditRepo.record({
      userId: cmd.userId,
      action: 'create',
      entityType: 'bug_report',
      entityId: row.id,
      newData: {
        status: row.status,
        is_anonymous: cmd.userId === null,
        image_count: cmd.images.length,
      },
      requestId: cmd.requestId ?? null,
    });

    return row;
  }
}
