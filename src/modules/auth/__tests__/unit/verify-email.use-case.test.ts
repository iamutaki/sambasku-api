import { describe, it, expect, vi } from 'vitest';
import { VerifyEmailUseCase } from '../../application/use-cases/verify-email.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { EmailVerificationOtpRepository } from '../../domain/repositories/email-verification-otp.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { TokenServicePort } from '../../application/ports/token-service.port';
import type { User } from '../../domain/entities/user.entity';
import type { EmailVerificationOtp } from '../../domain/entities/email-verification-otp.entity';
import { hashOtp } from '../../application/utils/otp';

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

function makeOtp(overrides: Partial<EmailVerificationOtp> = {}): EmailVerificationOtp {
  return {
    id: '01TESTOTPID00000000000000',
    userId: '01TESTULIDUSERID00000000',
    codeHash: hashOtp('01TESTULIDUSERID00000000', 'A4K9M2XP'),
    expiresAt: new Date(Date.now() + 600_000),
    attemptCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDeps(user: User | null, otp: EmailVerificationOtp | null) {
  const userRepo = {
    findByEmail: vi.fn().mockResolvedValue(user),
    markEmailVerified: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserRepository;
  const otpRepo = {
    findByUserId: vi.fn().mockResolvedValue(otp),
    incrementAttempts: vi.fn().mockImplementation(async () => (otp?.attemptCount ?? 0) + 1),
    deleteByUserId: vi.fn().mockResolvedValue(undefined),
    consumeIfMatch: vi.fn().mockResolvedValue(true),
  } as unknown as EmailVerificationOtpRepository;
  const tokenService = {
    generateAccessToken: vi.fn().mockResolvedValue('jwt-token'),
    verifyAccessToken: vi.fn(),
  } as unknown as TokenServicePort;
  const refreshTokenRepo = {
    create: vi.fn().mockResolvedValue({}),
  } as unknown as RefreshTokenRepository;

  return {
    userRepo,
    otpRepo,
    refreshTokenRepo,
    useCase: new VerifyEmailUseCase(
      userRepo,
      otpRepo,
      tokenService,
      refreshTokenRepo,
      900,
      2592000,
    ),
  };
}

describe('VerifyEmailUseCase', () => {
  it('sukses: terima A4K9-M2XP, set verified, hapus OTP, terbitkan JWT', async () => {
    const { useCase, userRepo, otpRepo, refreshTokenRepo } = makeDeps(makeUser(), makeOtp());

    const result = await useCase.execute({ email: 'budi@test.com', code: 'A4K9-M2XP' });

    expect(result.accessToken).toBe('jwt-token');
    expect(userRepo.markEmailVerified).toHaveBeenCalledWith('01TESTULIDUSERID00000000');
    expect(otpRepo.consumeIfMatch).toHaveBeenCalledWith(
      '01TESTULIDUSERID00000000',
      hashOtp('01TESTULIDUSERID00000000', 'A4K9M2XP'),
    );
    expect(refreshTokenRepo.create).toHaveBeenCalled();
  });

  it('kode salah → INVALID_OTP, attempt naik', async () => {
    const { useCase, otpRepo, userRepo } = makeDeps(makeUser(), makeOtp());

    await expect(
      useCase.execute({ email: 'budi@test.com', code: '00000000' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_OTP', statusCode: 401 });
    expect(otpRepo.incrementAttempts).toHaveBeenCalled();
    expect(userRepo.markEmailVerified).not.toHaveBeenCalled();
  });

  it('OTP kadaluarsa → OTP_EXPIRED, OTP dihapus', async () => {
    const { useCase, otpRepo } = makeDeps(
      makeUser(),
      makeOtp({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      useCase.execute({ email: 'budi@test.com', code: 'A4K9M2XP' }),
    ).rejects.toMatchObject({ errorCode: 'OTP_EXPIRED', statusCode: 401 });
    expect(otpRepo.deleteByUserId).toHaveBeenCalled();
  });

  it('user sudah verified → INVALID_OTP (anti-enumeration)', async () => {
    const { useCase, otpRepo } = makeDeps(makeUser({ emailVerified: true }), makeOtp());

    await expect(
      useCase.execute({ email: 'budi@test.com', code: 'A4K9M2XP' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_OTP' });
    expect(otpRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('OTP sudah terpakai (consume false) → INVALID_OTP, tidak set verified', async () => {
    const { useCase, userRepo, otpRepo } = makeDeps(makeUser(), makeOtp());
    vi.mocked(otpRepo.consumeIfMatch).mockResolvedValue(false);

    await expect(
      useCase.execute({ email: 'budi@test.com', code: 'A4K9M2XP' }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_OTP' });
    expect(userRepo.markEmailVerified).not.toHaveBeenCalled();
  });
});
