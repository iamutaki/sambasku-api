import { BadRequestError, ForbiddenError } from '@/shared/errors/app-error';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';

export class SetUserActiveUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: {
    targetUserId: string;
    isActive: boolean;
    actorId: string;
    requestId?: string | null;
  }): Promise<{ id: string; isActive: boolean }> {
    if (cmd.targetUserId === ANONIM_USER_ID) {
      throw new BadRequestError(
        'CANNOT_CHANGE_ANONIM',
        'User sistem anonim tidak bisa diubah. Itu akan menutup semua tamu.',
      );
    }

    const target = await this.userRepo.findById(cmd.targetUserId);
    if (!target || target.deletedAt) {
      throw new BadRequestError('USER_NOT_FOUND', 'Pengguna tidak ditemukan');
    }
    if (target.role === 'root') {
      throw new ForbiddenError(
        'CANNOT_CHANGE_ROOT',
        'Tidak diizinkan mengubah user dengan peran root',
      );
    }
    if (target.id === cmd.actorId) {
      throw new ForbiddenError(
        'CANNOT_DEACTIVATE_SELF',
        'Tidak diizinkan mengubah status akun sendiri',
      );
    }
    if (target.isActive === cmd.isActive) {
      return { id: target.id, isActive: target.isActive };
    }

    const ok = await this.userRepo.setIsActive(cmd.targetUserId, cmd.isActive);
    if (!ok) {
      throw new BadRequestError('USER_NOT_FOUND', 'Pengguna tidak ditemukan');
    }
    if (!cmd.isActive) {
      await this.refreshTokenRepo.revokeAllForUser(cmd.targetUserId);
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'user',
      entityId: cmd.targetUserId,
      oldData: { is_active: target.isActive },
      newData: { is_active: cmd.isActive },
      requestId: cmd.requestId ?? null,
    });

    return { id: cmd.targetUserId, isActive: cmd.isActive };
  }
}
