import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { Password } from '../../domain/value-objects/password.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import type { ResetPasswordDto } from '../dto/reset-password.dto';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import { hashToken } from '../utils/token';
import { hashOtp, normalizeOtpCode } from '../utils/otp';

export class ResetPasswordUseCase {
  constructor(
    private readonly resetTokenRepo: PasswordResetTokenRepository,
    private readonly userRepo: UserRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly auditRepo: AuditLogRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
  ) {}

  async execute(dto: ResetPasswordDto, requestId?: string | null): Promise<void> {
    Password.create(dto.newPassword);

    const tokenHash = await this.resolveTokenHash(dto);
    const record = await this.resetTokenRepo.findByHash(tokenHash);
    if (!record || record.isUsed || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('RESET_TOKEN_INVALID', 'Token reset tidak valid atau kadaluarsa');
    }

    const consumed = await this.resetTokenRepo.consume(tokenHash);
    if (!consumed) {
      throw new UnauthorizedError('RESET_TOKEN_INVALID', 'Token reset tidak valid atau kadaluarsa');
    }

    await this.resetTokenRepo.invalidateUnusedForUser(record.userId);

    await this.userRepo.updatePassword(record.userId, await this.hasher.hash(dto.newPassword));
    await this.refreshTokenRepo.revokeAllForUser(record.userId);

    await this.auditRepo.record({
      userId: record.userId,
      action: 'password_change',
      entityType: 'user',
      entityId: record.userId,
      newData: { changed: true },
      requestId: requestId ?? null,
    });
  }

  private async resolveTokenHash(dto: ResetPasswordDto): Promise<string> {
    const digits = dto.code ? normalizeOtpCode(dto.code) : null;
    if (dto.email && digits) {
      const user = await this.userRepo.findByEmail(dto.email);
      if (!user || user.deletedAt) {
        throw new UnauthorizedError('RESET_TOKEN_INVALID', 'Token reset tidak valid atau kadaluarsa');
      }
      return hashOtp(user.id, digits);
    }
    if (dto.token && dto.token.trim()) {
      return hashToken(dto.token.trim());
    }
    throw new UnauthorizedError('RESET_TOKEN_INVALID', 'Token reset tidak valid atau kadaluarsa');
  }
}
