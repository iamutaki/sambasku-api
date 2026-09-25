import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { MailerPort } from '@/modules/auth/application/ports/mailer.port';
import type { RefreshTokenRepository } from '@/modules/auth/domain/repositories/refresh-token.repository';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
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
    private readonly userRepo: UserRepository,
    private readonly mailer: MailerPort,
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
      actorId: cmd.actorId,
      data: {
        type: 'verifier_application_approved',
        target_kind: 'verifier_application',
        target_id: updated.id,
        application_id: updated.id,
      },
    });

    await this.sendWelcomeEmail(updated.userId);

    return { id: updated.id, status: 'approved', role: 'reviewer' };
  }

  /** Peran sudah berubah. Gagal kirim email tidak membatalkan persetujuan. */
  private async sendWelcomeEmail(userId: string): Promise<void> {
    try {
      const user = await this.userRepo.findById(userId);
      if (!user?.email) return;
      const name = user.displayName.trim() || user.username;
      await this.mailer.sendVerifierApprovedEmail(user.email, name);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'email selamat verifikator gagal dikirim',
          user_id: userId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
