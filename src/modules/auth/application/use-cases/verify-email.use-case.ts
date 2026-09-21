import { UnauthorizedError } from '@/shared/errors/app-error';
import { Email } from '../../domain/value-objects/email.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { EmailVerificationOtpRepository } from '../../domain/repositories/email-verification-otp.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { TokenServicePort } from '../ports/token-service.port';
import type { LoginMeta } from '../dto/login.dto';
import type { LoginResult } from './login-user.use-case';
import { generateToken } from '../utils/token';
import { hashOtp, normalizeOtpCode, OTP_MAX_ATTEMPTS } from '../utils/otp';

export class VerifyEmailUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly otpRepo: EmailVerificationOtpRepository,
    private readonly tokenService: TokenServicePort,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly accessTokenTtlSeconds: number,
    private readonly refreshTokenTtlSeconds: number,
  ) {}

  async execute(
    dto: { email: string; code: string },
    meta: LoginMeta = {},
  ): Promise<LoginResult> {
    const invalid = new UnauthorizedError(
      'INVALID_OTP',
      'Kode verifikasi salah atau tidak berlaku.',
    );
    const expired = new UnauthorizedError(
      'OTP_EXPIRED',
      'Kode verifikasi kadaluarsa. Minta kode baru.',
    );

    const digits = normalizeOtpCode(dto.code);
    if (!digits) throw invalid;

    const email = Email.create(dto.email);
    const user = await this.userRepo.findByEmail(email.value);
    if (!user || user.deletedAt || !user.isActive) throw invalid;
    if (user.emailVerified) throw invalid;

    const otp = await this.otpRepo.findByUserId(user.id);
    if (!otp) throw invalid;
    if (otp.expiresAt.getTime() <= Date.now() || otp.attemptCount >= OTP_MAX_ATTEMPTS) {
      await this.otpRepo.deleteByUserId(user.id);
      throw expired;
    }

    if (otp.codeHash !== hashOtp(user.id, digits)) {
      const attempts = await this.otpRepo.incrementAttempts(otp.id);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.otpRepo.deleteByUserId(user.id);
        throw expired;
      }
      throw invalid;
    }

    const consumed = await this.otpRepo.consumeIfMatch(user.id, otp.codeHash);
    if (!consumed) throw invalid;

    await this.userRepo.markEmailVerified(user.id);

    const accessToken = await this.tokenService.generateAccessToken({
      user_id: user.id,
      role: user.role,
      username: user.username,
    });
    const { token, tokenHash } = generateToken();
    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash,
      deviceInfo: meta.deviceInfo ?? null,
      ipAddress: meta.ipAddress ?? null,
      expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
    });

    return {
      accessToken,
      expiresIn: this.accessTokenTtlSeconds,
      refreshToken: token,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }
}
