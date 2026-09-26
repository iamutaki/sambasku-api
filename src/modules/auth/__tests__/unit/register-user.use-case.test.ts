import { describe, it, expect, vi } from 'vitest';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { EmailVerificationOtpRepository } from '../../domain/repositories/email-verification-otp.repository';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port';
import type { MailerPort } from '../../application/ports/mailer.port';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { AppSettingsRepository } from '@/modules/legal/domain/repositories/app-settings.repository';
import type { UserConsentRepository } from '@/modules/legal/domain/repositories/user-consent.repository';

const activeConsents = [
  { documentType: 'terms' as const, documentVersion: '2026-09-26' },
  { documentType: 'privacy' as const, documentVersion: '2026-09-26' },
];

function makeDeps(overrides: {
  findByUsername?: unknown;
  findByEmail?: unknown;
  findByPhone?: unknown;
} = {}) {
  const userRepo = {
    findById: vi.fn(),
    findByEmail: vi.fn().mockResolvedValue(overrides.findByEmail ?? null),
    findByUsername: vi.fn().mockResolvedValue(overrides.findByUsername ?? null),
    findByPhone: vi.fn().mockResolvedValue(overrides.findByPhone ?? null),
    save: vi.fn().mockImplementation(
      (user: {
        username: string;
        email: string;
        phone: string | null;
        passwordHash: string;
        emailVerified?: boolean;
      }) =>
        Promise.resolve({
          id: '01TESTULIDUSERID00000000',
          ...user,
          role: 'contributor',
          isActive: true,
          emailVerified: user.emailVerified ?? false,
          createdAt: new Date(),
          updatedAt: null,
          deletedAt: null,
        }),
    ),
    updatePassword: vi.fn(),
    markEmailVerified: vi.fn(),
  } as unknown as UserRepository;
  const hasher = {
    hash: vi.fn().mockResolvedValue('argon2id$hash'),
    compare: vi.fn(),
  } as unknown as PasswordHasherPort;
  const auditRepo = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
  const otpRepo = {
    replaceForUser: vi.fn().mockResolvedValue({}),
    findByUserId: vi.fn(),
    incrementAttempts: vi.fn(),
    deleteByUserId: vi.fn(),
    consumeIfMatch: vi.fn(),
  } as unknown as EmailVerificationOtpRepository;
  const mailer = {
    sendResetPasswordEmail: vi.fn(),
    sendVerificationOtpEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as MailerPort;
  const settingsRepo = {
    getLegalActiveVersions: vi.fn().mockResolvedValue({
      termsVersion: '2026-09-26',
      privacyVersion: '2026-09-26',
    }),
  } as unknown as AppSettingsRepository;
  const consentRepo = {
    insertMany: vi.fn().mockResolvedValue([]),
    findLatestByUser: vi.fn(),
    deleteByUserId: vi.fn(),
  } as unknown as UserConsentRepository;
  return {
    userRepo,
    hasher,
    auditRepo,
    otpRepo,
    mailer,
    settingsRepo,
    consentRepo,
    useCase: new RegisterUserUseCase(
      userRepo,
      hasher,
      auditRepo as unknown as AuditLogRepository,
      otpRepo,
      mailer,
      settingsRepo,
      consentRepo,
    ),
  };
}

describe('RegisterUserUseCase', () => {
  it('menyimpan user belum verified, catat consents, kirim OTP', async () => {
    const { useCase, userRepo, hasher, otpRepo, mailer, consentRepo } = makeDeps();

    const user = await useCase.execute({
      name: 'Budi Santoso',
      email: 'Budi@Test.com',
      phone: '6281234567890',
      password: 'Password123',
      clientId: 'sambasku-mobile',
      consents: activeConsents,
    });

    expect(hasher.hash).toHaveBeenCalledWith('Password123');
    expect(userRepo.save).toHaveBeenCalled();
    expect(consentRepo.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          documentType: 'terms',
          documentVersion: '2026-09-26',
          source: 'register',
          clientId: 'sambasku-mobile',
        }),
      ]),
    );
    expect(user.emailVerified).toBe(false);
    expect(otpRepo.replaceForUser).toHaveBeenCalled();
    expect(mailer.sendVerificationOtpEmail).toHaveBeenCalled();
  });

  it('versi consent kedaluwarsa → LEGAL_CONSENT_OUTDATED', async () => {
    const { useCase, userRepo, consentRepo } = makeDeps();
    await expect(
      useCase.execute({
        name: 'Budi',
        email: 'budi@test.com',
        phone: null,
        password: 'Password123',
        consents: [
          { documentType: 'terms', documentVersion: '2019-01-01' },
          { documentType: 'privacy', documentVersion: '2026-09-26' },
        ],
      }),
    ).rejects.toMatchObject({ errorCode: 'LEGAL_CONSENT_OUTDATED' });
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(consentRepo.insertMany).not.toHaveBeenCalled();
  });

  it('consent kurang → CONSENT_REQUIRED', async () => {
    const { useCase, userRepo } = makeDeps();
    await expect(
      useCase.execute({
        name: 'Budi',
        email: 'budi@test.com',
        phone: null,
        password: 'Password123',
        consents: [{ documentType: 'terms', documentVersion: '2026-09-26' }],
      }),
    ).rejects.toMatchObject({ errorCode: 'CONSENT_REQUIRED' });
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});
