import type { UserRepository } from '../../domain/repositories/user.repository';
import type { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import type { ForgotPasswordDto } from '../dto/reset-password.dto';
import type { MailerPort } from '../ports/mailer.port';
import { generateToken } from '../utils/token';
import { formatOtpDisplay, generateOtpCode, hashOtp, OTP_TTL_MS } from '../utils/otp';

const RESET_LINK_TTL_MS = 60 * 60 * 1000; // tautan cadangan 1 jam

export class ForgotPasswordUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly resetTokenRepo: PasswordResetTokenRepository,
    private readonly mailer: MailerPort,
    private readonly resetUrlBase: string,
  ) {}

  // Tidak pernah melempar error "email tidak terdaftar" - response selalu sama
  async execute(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user || user.deletedAt) return;

    await this.resetTokenRepo.invalidateUnusedForUser(user.id);

    const code = generateOtpCode();
    await this.resetTokenRepo.create({
      userId: user.id,
      tokenHash: hashOtp(user.id, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    const { token, tokenHash } = generateToken();
    await this.resetTokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_LINK_TTL_MS),
    });

    await this.mailer.sendResetPasswordEmail(
      user.email,
      `${this.resetUrlBase}?token=${token}`,
      formatOtpDisplay(code),
    );
  }
}
