import { describe, it, expect, vi } from 'vitest';
import { ForgotPasswordUseCase } from '../../application/use-cases/forgot-password.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
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
    emailVerified: true,
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

function makeDeps(user: User | null) {
  const userRepo = {
    findByEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UserRepository;
  const resetTokenRepo = {
    create: vi.fn().mockResolvedValue({}),
    invalidateUnusedForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as PasswordResetTokenRepository;
  const mailer = {
    sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
    sendVerificationOtpEmail: vi.fn(),
  } as unknown as MailerPort;
  return {
    resetTokenRepo,
    mailer,
    useCase: new ForgotPasswordUseCase(
      userRepo,
      resetTokenRepo,
      mailer,
      'https://app.test/reset-password',
    ),
  };
}

describe('ForgotPasswordUseCase', () => {
  it('email tidak terdaftar: diam, tidak kirim (anti-enumeration)', async () => {
    const { useCase, mailer, resetTokenRepo } = makeDeps(null);
    await useCase.execute({ email: 'hantu@test.com' });
    expect(resetTokenRepo.create).not.toHaveBeenCalled();
    expect(mailer.sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('user ada: hanguskan token lama, buat token baru, kirim email', async () => {
    const { useCase, resetTokenRepo, mailer } = makeDeps(makeUser());
    await useCase.execute({ email: 'budi@test.com' });
    expect(resetTokenRepo.invalidateUnusedForUser).toHaveBeenCalledWith(
      '01TESTULIDUSERID00000000',
    );
    expect(resetTokenRepo.create).toHaveBeenCalledTimes(2);
    expect(mailer.sendResetPasswordEmail).toHaveBeenCalledWith(
      'budi@test.com',
      expect.stringMatching(/^https:\/\/app\.test\/reset-password\?token=/),
      expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
    );
  });
});
