import { describe, it, expect, vi } from 'vitest';
import { ResendOtpUseCase } from '../../application/use-cases/resend-otp.use-case';
import { RateLimitedError } from '@/shared/errors/app-error';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { EmailVerificationOtpRepository } from '../../domain/repositories/email-verification-otp.repository';
import type { MailerPort } from '../../application/ports/mailer.port';
import type { User } from '../../domain/entities/user.entity';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '01TESTULIDUSERID00000000',
    username: 'budi',
    email: 'budi@test.com',
    phone: null,
    passwordHash: 'argon2id$hash',
    role: 'contributor',
    isActive: true,
    emailVerified: false,
    avatarUrl: null,
    avatarProvider: null,
    avatarProviderFileId: null,
    avatarSha: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makeOtp(createdAt: Date) {
  return {
    id: '01TESTOTPID00000000000000',
    userId: '01TESTULIDUSERID00000000',
    codeHash: 'hash',
    expiresAt: new Date(createdAt.getTime() + 10 * 60 * 1000),
    attemptCount: 0,
    createdAt,
  };
}

function makeDeps(user: User | null, otp: ReturnType<typeof makeOtp> | null = null) {
  const userRepo = {
    findByEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UserRepository;
  const otpRepo = {
    replaceForUser: vi.fn().mockResolvedValue({}),
    findByUserId: vi.fn().mockResolvedValue(otp),
  } as unknown as EmailVerificationOtpRepository;
  const mailer = {
    sendResetPasswordEmail: vi.fn(),
    sendVerificationOtpEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as MailerPort;
  return {
    otpRepo,
    mailer,
    useCase: new ResendOtpUseCase(userRepo, otpRepo, mailer),
  };
}

describe('ResendOtpUseCase', () => {
  it('email tidak terdaftar: tidak error, tidak kirim (anti-enumeration)', async () => {
    const { useCase, mailer, otpRepo } = makeDeps(null);
    await expect(useCase.execute('hantu@test.com')).resolves.toBeUndefined();
    expect(otpRepo.replaceForUser).not.toHaveBeenCalled();
    expect(mailer.sendVerificationOtpEmail).not.toHaveBeenCalled();
  });

  it('sudah verified: diam, tidak kirim', async () => {
    const { useCase, mailer } = makeDeps(makeUser({ emailVerified: true }));
    await useCase.execute('budi@test.com');
    expect(mailer.sendVerificationOtpEmail).not.toHaveBeenCalled();
  });

  it('belum verified: ganti OTP dan kirim tampilan XXXX-XXXX', async () => {
    const { useCase, otpRepo, mailer } = makeDeps(makeUser());
    await useCase.execute('budi@test.com');
    expect(otpRepo.replaceForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '01TESTULIDUSERID00000000' }),
    );
    expect(mailer.sendVerificationOtpEmail).toHaveBeenCalledWith(
      'budi@test.com',
      expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
    );
  });

  it('OTP baru dikirim < 2 menit: RATE_LIMITED, tidak ganti kode', async () => {
    const { useCase, otpRepo, mailer } = makeDeps(
      makeUser(),
      makeOtp(new Date()),
    );
    await expect(useCase.execute('budi@test.com')).rejects.toBeInstanceOf(RateLimitedError);
    expect(otpRepo.replaceForUser).not.toHaveBeenCalled();
    expect(mailer.sendVerificationOtpEmail).not.toHaveBeenCalled();
  });

  it('cooldown lewat: ganti OTP dan kirim lagi', async () => {
    const { useCase, mailer } = makeDeps(
      makeUser(),
      makeOtp(new Date(Date.now() - 2 * 60 * 1000 - 1)),
    );
    await useCase.execute('budi@test.com');
    expect(mailer.sendVerificationOtpEmail).toHaveBeenCalled();
  });
});
