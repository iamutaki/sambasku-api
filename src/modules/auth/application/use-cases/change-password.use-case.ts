import { BadRequestError, UnauthorizedError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { Password } from '../../domain/value-objects/password.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { ChangePasswordDto } from '../dto/change-password.dto';
import type { PasswordHasherPort } from '../ports/password-hasher.port';

/**
 * Ubah password sendiri (user ter-autentikasi, tahu password lama).
 * Semantik session sama dengan reset-password: SEMUA refresh token
 * di-revoke (logout paksa semua perangkat) karena password berganti.
 */
export class ChangePasswordUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly auditRepo: AuditLogRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
  ) {}

  async execute(dto: ChangePasswordDto, userId: string, requestId?: string | null): Promise<void> {
    Password.create(dto.newPassword); // invariant kekuatan password tetap dijaga domain

    if (dto.oldPassword === dto.newPassword) {
      throw new ValidationError([
        { field: 'new_password', message: 'Password baru tidak boleh sama dengan password lama' },
      ]);
    }

    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Sesi tidak valid');
    }

    // Akun OAuth-only tidak punya password untuk diverifikasi - arahkan
    // ke alur lupa password (cek SEBELUM compare; compare ke null menyesatkan)
    if (user.passwordHash === null) {
      throw new BadRequestError(
        'OAUTH_NO_PASSWORD',
        'Akun ini tidak memiliki password (login via OAuth). Gunakan lupa password untuk membuat password.',
      );
    }

    const oldMatch = await this.hasher.compare(dto.oldPassword, user.passwordHash);
    if (!oldMatch) {
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Password lama salah');
    }

    await this.userRepo.updatePassword(userId, await this.hasher.hash(dto.newPassword));

    // Logout paksa semua perangkat (akun mungkin tercompromi) - preseden
    // reset-password. Access token stateless tetap hidup sampai exp;
    // client wajib clear sesi lokal setelah response sukses.
    await this.refreshTokenRepo.revokeAllForUser(userId);

    // Audit trail (Section 21) - newData TIDAK memuat hash password
    await this.auditRepo.record({
      userId,
      action: 'password_change',
      entityType: 'user',
      entityId: userId,
      newData: { changed: true, via: 'change_password' },
      requestId: requestId ?? null,
    });
  }
}
