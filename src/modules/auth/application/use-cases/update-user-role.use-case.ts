import { BadRequestError, ForbiddenError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { User, UserRole } from '../../domain/entities/user.entity';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';

export interface UpdateUserRoleCommand {
  targetUserId: string;
  newRole: UserRole;
  actorId: string;
  actorRole: User['role'];
  requestId?: string | null;
}

export interface UpdateUserRoleResult {
  id: string;
  role: User['role'];
}

// Urutan guard: SELALU check security boundary terdalam duluan.
export class UpdateUserRoleUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: UpdateUserRoleCommand): Promise<UpdateUserRoleResult> {
    const target = await this.userRepo.findById(cmd.targetUserId);
    if (!target) {
      throw new BadRequestError('USER_NOT_FOUND', 'User target tidak ditemukan');
    }

    // Guard 1: tidak boleh ubah ROLE user yang ROLEnya root (security boundary)
    if (target.role === 'root') {
      throw new ForbiddenError(
        'CANNOT_CHANGE_ROOT',
        'Tidak diizinkan mengubah user dengan peran root',
      );
    }

    // Guard 2: tidak boleh ubah role sendiri (hindari kunci diri sendiri di luar)
    if (target.id === cmd.actorId) {
      throw new ForbiddenError(
        'CANNOT_CHANGE_SELF_ROLE',
        'Tidak diizinkan mengubah peran sendiri',
      );
    }

    // Guard 3: root role hanya boleh di-set via SQL seed, tidak via endpoint
    if (cmd.newRole === 'root') {
      throw new BadRequestError(
        'INVALID_ROLE',
        'Peran root tidak dapat diatur via panel admin',
      );
    }

    const allowedRolesForAdmin: User['role'][] = ['contributor', 'editor', 'reviewer', 'admin'];
    if (!allowedRolesForAdmin.includes(cmd.newRole)) {
      throw new BadRequestError('INVALID_ROLE', 'Peran baru tidak valid');
    }

    if (cmd.newRole === target.role) {
      return { id: target.id, role: target.role };
    }
    const prevRole = target.role;

    await this.userRepo.updateRole(target.id, cmd.newRole);
    await this.refreshTokenRepo.revokeAllForUser(target.id);

    // Best-effort (tidak throw): audit log tidak boleh bikin request gagal.
    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'user',
      entityId: target.id,
      oldData: { role: prevRole },
      newData: { role: cmd.newRole },
      requestId: cmd.requestId ?? null,
    });

    return { id: target.id, role: cmd.newRole };
  }
}
