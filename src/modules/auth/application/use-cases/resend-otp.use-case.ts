import { RateLimitedError } from '@/shared/errors/app-error';
import { Email } from '../../domain/value-objects/email.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { EmailVerificationOtpRepository } from '../../domain/repositories/email-verification-otp.repository';
import type { MailerPort } from '../ports/mailer.port';
import {
  formatOtpDisplay,
  generateOtpCode,
  hashOtp,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
} from '../utils/otp';

export class ResendOtpUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly otpRepo: EmailVerificationOtpRepository,
    private readonly mailer: MailerPort,
  ) {}

  async execute(emailRaw: string): Promise<void> {
    let email: Email;
    try {
      email = Email.create(emailRaw);
    } catch {
      return;
    }

    const user = await this.userRepo.findByEmail(email.value);
    if (!user || user.deletedAt || !user.isActive || user.emailVerified) return;

    const existing = await this.otpRepo.findByUserId(user.id);
    if (existing) {
      const elapsed = Date.now() - existing.createdAt.getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000),
        );
        throw new RateLimitedError(
          `Tunggu ${retryAfterSeconds} detik sebelum kirim ulang kode`,
          retryAfterSeconds,
        );
      }
    }

    const code = generateOtpCode();
    await this.otpRepo.replaceForUser({
      userId: user.id,
      codeHash: hashOtp(user.id, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await this.mailer.sendVerificationOtpEmail(user.email, formatOtpDisplay(code));
  }
}
