import { UnauthorizedError } from '@/shared/errors/app-error';
import { Password } from '../../domain/value-objects/password.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import type { ResetPasswordDto } from '../dto/reset-password.dto';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import { hashToken } from '../utils/token';

export class ResetPasswordUseCase {
  constructor(
    private readonly resetTokenRepo: PasswordResetTokenRepository,
    private readonly userRepo: UserRepository,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<void> {
    Password.create(dto.newPassword); // invariant kekuatan password tetap dijaga domain

    const tokenHash = hashToken(dto.token);
    const record = await this.resetTokenRepo.findByHash(tokenHash);
    if (!record || record.isUsed || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('RESET_TOKEN_INVALID', 'Token reset tidak valid atau kadaluarsa');
    }

    // Konsumsi token secara atomik DULU — dua request konkuren dengan
    // token sama: hanya satu yang lolos, satunya dapat false → ditolak.
    const consumed = await this.resetTokenRepo.consume(tokenHash);
    if (!consumed) {
      throw new UnauthorizedError('RESET_TOKEN_INVALID', 'Token reset tidak valid atau kadaluarsa');
    }

    // Kalau gagal di sini, token sudah terbakar dan user minta link baru —
    // failure mode aman (lebih baik token hangus daripada terpakai dua kali)
    await this.userRepo.updatePassword(record.userId, await this.hasher.hash(dto.newPassword));
  }
}
