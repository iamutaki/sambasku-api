import { Email } from '../../domain/value-objects/email.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { EmailVerificationOtpRepository } from '../../domain/repositories/email-verification-otp.repository';
import type { MailerPort } from '../ports/mailer.port';
import { formatOtpDisplay, generateOtpDigits, hashOtp, OTP_TTL_MS } from '../utils/otp';

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

    const digits = generateOtpDigits();
    await this.otpRepo.replaceForUser({
      userId: user.id,
      codeHash: hashOtp(user.id, digits),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await this.mailer.sendVerificationOtpEmail(user.email, formatOtpDisplay(digits));
  }
}
