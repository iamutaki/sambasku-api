import { describe, it, expect, vi } from 'vitest';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { EmailVerificationOtpRepository } from '../../domain/repositories/email-verification-otp.repository';
import type { PasswordHasherPort } from '../../application/ports/password-hasher.port';
import type { MailerPort } from '../../application/ports/mailer.port';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';

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
  return {
    userRepo,
    hasher,
    auditRepo,
    otpRepo,
    mailer,
    useCase: new RegisterUserUseCase(
      userRepo,
      hasher,
      auditRepo as unknown as AuditLogRepository,
      otpRepo,
      mailer,
    ),
  };
}

describe('RegisterUserUseCase', () => {
  it('menyimpan user belum verified, kirim OTP tampilan XXXX-XXXX, tanpa JWT', async () => {
    const { useCase, userRepo, hasher, otpRepo, mailer } = makeDeps();

    const user = await useCase.execute({
      name: 'Budi Santoso',
      email: 'Budi@Test.com',
      phone: '6281234567890',
      password: 'Password123',
    });

    expect(hasher.hash).toHaveBeenCalledWith('Password123');
    expect(userRepo.save).toHaveBeenCalledWith({
      username: 'Budi Santoso',
      email: 'budi@test.com',
      phone: '6281234567890',
      passwordHash: 'argon2id$hash',
      emailVerified: false,
    });
    expect(user.emailVerified).toBe(false);
    expect(otpRepo.replaceForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        codeHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    );
    expect(mailer.sendVerificationOtpEmail).toHaveBeenCalledWith(
      'budi@test.com',
      expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
    );
  });

  it('menerima phone null (opsional)', async () => {
    const { useCase, userRepo } = makeDeps();

    await useCase.execute({
      name: 'Budi',
      email: 'budi@test.com',
      phone: null,
      password: 'Password123',
    });

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null }),
    );
  });

  it('menolak email yang sudah terdaftar (EMAIL_ALREADY_EXISTS)', async () => {
    const { useCase } = makeDeps({ findByEmail: { id: 1 } });

    await expect(
      useCase.execute({
        name: 'budi',
        email: 'budi@test.com',
        phone: null,
        password: 'Password123',
      }),
    ).rejects.toMatchObject({ errorCode: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
  });

  it('menolak nama yang sudah dipakai (USERNAME_ALREADY_EXISTS)', async () => {
    const { useCase } = makeDeps({ findByUsername: { id: 1 } });

    await expect(
      useCase.execute({
        name: 'budi',
        email: 'budi@test.com',
        phone: null,
        password: 'Password123',
      }),
    ).rejects.toMatchObject({ errorCode: 'USERNAME_ALREADY_EXISTS', statusCode: 409 });
  });

  it('menolak phone yang sudah dipakai (PHONE_ALREADY_EXISTS)', async () => {
    const { useCase } = makeDeps({ findByPhone: { id: 1 } });

    await expect(
      useCase.execute({
        name: 'budi',
        email: 'budi@test.com',
        phone: '6281234567890',
        password: 'Password123',
      }),
    ).rejects.toMatchObject({ errorCode: 'PHONE_ALREADY_EXISTS', statusCode: 409 });
  });

  it('menolak password lewat Validator Zod (VO domain tetap menjaga invariant)', async () => {
    const { useCase } = makeDeps();

    await expect(
      useCase.execute({
        name: 'budi',
        email: 'budi@test.com',
        phone: null,
        password: 'pendek1',
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('mencatat audit trail user.create - TANPA password/hash di new_data', async () => {
    const { useCase, auditRepo } = makeDeps();

    await useCase.execute(
      {
        name: 'budi',
        email: 'budi@test.com',
        phone: null,
        password: 'Password123',
      },
      'req-123',
    );

    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entityType: 'user',
        requestId: 'req-123',
        newData: expect.not.objectContaining({ password: expect.anything() }),
      }),
    );
    const entry = vi.mocked(auditRepo.record).mock.calls[0][0];
    expect(JSON.stringify(entry.newData)).not.toContain('argon2id');
  });
});
