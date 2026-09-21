import { ForbiddenError, UnauthorizedError } from '@/shared/errors/app-error';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { LoginDto, LoginMeta } from '../dto/login.dto';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import type { TokenServicePort } from '../ports/token-service.port';
import { issueLoginSession, type LoginResult } from '../utils/issue-login-session';

export type { LoginResult };

export class LoginUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly tokenService: TokenServicePort,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly accessTokenTtlSeconds: number,
    private readonly refreshTokenTtlSeconds: number,
  ) {}

  async execute(dto: LoginDto, meta: LoginMeta = {}): Promise<LoginResult> {
    // Pesan error generik untuk semua kasus gagal - cegah user enumeration
    const invalid = new UnauthorizedError('INVALID_CREDENTIALS', 'Email atau password salah');

    const user = await this.userRepo.findByEmail(dto.email);
    // passwordHash NULL = user OAuth-only (Section 23) - tidak punya jalur
    // login password; pesan tetap generik anti-enumeration
    if (!user || !user.passwordHash || !(await this.hasher.compare(dto.password, user.passwordHash))) {
      throw invalid;
    }
    // Soft-deleted ATAU dinonaktifkan (is_active=false) → pesan generik yang sama
    if (user.deletedAt || !user.isActive) {
      throw invalid;
    }
    if (!user.emailVerified) {
      throw new ForbiddenError(
        'EMAIL_NOT_VERIFIED',
        'Email belum diverifikasi. Cek kotak masuk untuk kode OTP.',
        [{ field: 'email', message: user.email }],
      );
    }

    return issueLoginSession(
      { id: user.id, username: user.username, role: user.role },
      {
        tokenService: this.tokenService,
        refreshTokenRepo: this.refreshTokenRepo,
        accessTokenTtlSeconds: this.accessTokenTtlSeconds,
        refreshTokenTtlSeconds: this.refreshTokenTtlSeconds,
      },
      meta,
    );
  }
}
