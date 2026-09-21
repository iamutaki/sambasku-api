import { describe, it, expect, vi } from 'vitest';
import { ResendOtpUseCase } from '../../application/use-cases/resend-otp.use-case';
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
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makeDeps(user: User | null) {
  const userRepo = {
    findByEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UserRepository;
  const otpRepo = {
    replaceForUser: vi.fn().mockResolvedValue({}),
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

  it('belum verified: ganti OTP dan kirim tampilan XXX-XYZ', async () => {
    const { useCase, otpRepo, mailer } = makeDeps(makeUser());
    await useCase.execute('budi@test.com');
    expect(otpRepo.replaceForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '01TESTULIDUSERID00000000' }),
    );
    expect(mailer.sendVerificationOtpEmail).toHaveBeenCalledWith(
      'budi@test.com',
      expect.stringMatching(/^\d{3}-\d{3}$/),
    );
  });
});
