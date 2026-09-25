import { BadRequestError } from '@/shared/errors/app-error';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';

export class SetCanContributeUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly inbox?: RecordInboxNotificationUseCase,
  ) {}

  async execute(cmd: {
    targetUserId: string;
    canContribute: boolean;
    actorId: string;
    requestId?: string | null;
  }): Promise<{ id: string; canContribute: boolean }> {
    if (cmd.targetUserId === ANONIM_USER_ID) {
      throw new BadRequestError(
        'CANNOT_CHANGE_ANONIM',
        'User sistem anonim tidak bisa dihentikan. Itu akan menutup semua tamu.',
      );
    }
    const target = await this.userRepo.findById(cmd.targetUserId);
    if (!target || target.deletedAt) {
      throw new BadRequestError('USER_NOT_FOUND', 'Pengguna tidak ditemukan');
    }
    const ok = await this.userRepo.setCanContribute(cmd.targetUserId, cmd.canContribute);
    if (!ok) {
      throw new BadRequestError('USER_NOT_FOUND', 'Pengguna tidak ditemukan');
    }
    await this.auditRepo.record({
      userId: cmd.actorId,
      action: cmd.canContribute ? 'allow_contribute' : 'pause_contribute',
      entityType: 'user',
      entityId: cmd.targetUserId,
      newData: { can_contribute: cmd.canContribute },
      requestId: cmd.requestId ?? null,
    });
    await this.inbox?.execute({
      userId: cmd.targetUserId,
      type: cmd.canContribute ? 'contribution_resumed' : 'contribution_paused',
      targetKind: 'word',
      targetId: cmd.targetUserId,
      actorId: cmd.actorId,
    });
    return { id: cmd.targetUserId, canContribute: cmd.canContribute };
  }
}
