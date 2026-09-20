import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { RefreshTokenRepository } from '@/modules/auth/domain/repositories/refresh-token.repository';
import type { NotifyUserUseCase } from '@/modules/device/application/use-cases/notify-user.use-case';
import type { VerifierApplicationRepository } from '../../domain/repositories/verifier-application.repository';

export interface ApproveVerifierApplicationCommand {
  applicationId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | null;
}

export interface ApproveVerifierApplicationResult {
  id: string;
  status: 'approved';
  role: 'reviewer';
}

export class ApproveVerifierApplicationUseCase {
  constructor(
    private readonly appRepo: VerifierApplicationRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly notifyUser: NotifyUserUseCase,
  ) {}

  async execute(cmd: ApproveVerifierApplicationCommand): Promise<ApproveVerifierApplicationResult> {
    const updated = await this.appRepo.approveAtomically(cmd.applicationId, cmd.actorId);

    await this.refreshTokenRepo.revokeAllForUser(updated.userId);

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'approve',
      entityType: 'verifier_application',
      entityId: updated.id,
      oldData: { status: 'pending' },
      newData: { status: 'approved', role: 'reviewer' },
      requestId: cmd.requestId ?? null,
    });

    await this.notifyUser.execute({
      userId: updated.userId,
      title: 'Pengajuan verifikator disetujui',
      body: 'Pengajuan Anda disetujui. Masuk ulang agar peran baru aktif.',
      data: { type: 'verifier_application_approved', application_id: updated.id },
    });

    return { id: updated.id, status: 'approved', role: 'reviewer' };
  }
}
