import { ConflictError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { NotifyUserUseCase } from '@/modules/device/application/use-cases/notify-user.use-case';
import type { VerifierApplicationRepository } from '../../domain/repositories/verifier-application.repository';

export interface RejectVerifierApplicationCommand {
  applicationId: string;
  actorId: string;
  comment: string;
  requestId?: string | null;
}

export interface RejectVerifierApplicationResult {
  id: string;
  status: 'rejected';
}

export class RejectVerifierApplicationUseCase {
  constructor(
    private readonly appRepo: VerifierApplicationRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly notifyUser: NotifyUserUseCase,
  ) {}

  async execute(cmd: RejectVerifierApplicationCommand): Promise<RejectVerifierApplicationResult> {
    const row = await this.appRepo.findById(cmd.applicationId);
    if (!row) {
      throw new NotFoundError(
        'VERIFIER_APPLICATION_NOT_FOUND',
        'Pengajuan verifikator tidak ditemukan',
      );
    }
    if (row.status !== 'pending') {
      throw new ConflictError(
        'APPLICATION_ALREADY_REVIEWED',
        'Pengajuan sudah memiliki keputusan',
      );
    }

    const updated = await this.appRepo.markRejected(row.id, cmd.actorId, cmd.comment);
    if (!updated) {
      throw new ConflictError(
        'APPLICATION_ALREADY_REVIEWED',
        'Pengajuan sudah memiliki keputusan',
      );
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'reject',
      entityType: 'verifier_application',
      entityId: row.id,
      oldData: { status: row.status },
      newData: { status: 'rejected', comment: cmd.comment },
      requestId: cmd.requestId ?? null,
    });

    await this.notifyUser.execute({
      userId: row.userId,
      title: 'Pengajuan verifikator ditolak',
      body: 'Pengajuan ditolak. Buka profil untuk memperbaiki.',
      actorId: cmd.actorId,
      data: {
        type: 'verifier_application_rejected',
        target_kind: 'verifier_application',
        target_id: row.id,
        application_id: row.id,
      },
    });

    return { id: row.id, status: 'rejected' };
  }
}
