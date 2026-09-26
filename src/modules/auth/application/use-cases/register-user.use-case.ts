import { ConflictError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { AppSettingsRepository } from '@/modules/legal/domain/repositories/app-settings.repository';
import type { UserConsentRepository } from '@/modules/legal/domain/repositories/user-consent.repository';
import { assertConsentsMatchActiveVersions } from '@/modules/legal/application/utils/validate-consents';
import { Email } from '../../domain/value-objects/email.vo';
import { Password } from '../../domain/value-objects/password.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { EmailVerificationOtpRepository } from '../../domain/repositories/email-verification-otp.repository';
import type { User } from '../../domain/entities/user.entity';
import type { RegisterDto } from '../dto/register.dto';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import type { MailerPort } from '../ports/mailer.port';
import { formatOtpDisplay, generateOtpCode, hashOtp, OTP_TTL_MS } from '../utils/otp';

export class RegisterUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly auditRepo: AuditLogRepository,
    private readonly otpRepo: EmailVerificationOtpRepository,
    private readonly mailer: MailerPort,
    private readonly settingsRepo: AppSettingsRepository,
    private readonly consentRepo: UserConsentRepository,
  ) {}

  async execute(dto: RegisterDto, requestId?: string | null): Promise<User> {
    const email = Email.create(dto.email);
    Password.create(dto.password);

    const active = await this.settingsRepo.getLegalActiveVersions();
    assertConsentsMatchActiveVersions(dto.consents, active);

    if (await this.userRepo.findByUsername(dto.name)) {
      throw new ConflictError('USERNAME_ALREADY_EXISTS', 'Nama sudah dipakai');
    }
    if (await this.userRepo.findByEmail(email.value)) {
      throw new ConflictError('EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar');
    }
    if (dto.phone && (await this.userRepo.findByPhone(dto.phone))) {
      throw new ConflictError('PHONE_ALREADY_EXISTS', 'Nomor HP sudah terdaftar');
    }

    const passwordHash = await this.hasher.hash(dto.password);
    const user = await this.userRepo.save({
      username: dto.name,
      email: email.value,
      phone: dto.phone,
      passwordHash,
      emailVerified: false,
    });

    const byType = new Map(dto.consents.map((c) => [c.documentType, c.documentVersion]));
    await this.consentRepo.insertMany([
      {
        userId: user.id,
        documentType: 'terms',
        documentVersion: byType.get('terms')!,
        source: 'register',
        clientId: dto.clientId ?? null,
        requestId: requestId ?? null,
      },
      {
        userId: user.id,
        documentType: 'privacy',
        documentVersion: byType.get('privacy')!,
        source: 'register',
        clientId: dto.clientId ?? null,
        requestId: requestId ?? null,
      },
    ]);

    const code = generateOtpCode();
    await this.otpRepo.replaceForUser({
      userId: user.id,
      codeHash: hashOtp(user.id, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await this.mailer.sendVerificationOtpEmail(user.email, formatOtpDisplay(code));

    await this.auditRepo.record({
      userId: user.id,
      action: 'create',
      entityType: 'user',
      entityId: user.id,
      newData: {
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        consents: {
          terms: byType.get('terms'),
          privacy: byType.get('privacy'),
        },
      },
      requestId: requestId ?? null,
    });

    return user;
  }
}
