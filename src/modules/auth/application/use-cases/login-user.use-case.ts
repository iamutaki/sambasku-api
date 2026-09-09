import { UnauthorizedError } from '@/shared/errors/app-error';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { LoginDto, LoginMeta } from '../dto/login.dto';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import type { TokenServicePort } from '../ports/token-service.port';
import { generateToken } from '../utils/token';

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string; // plain — di-hash hanya saat disimpan
  user: { id: string; username: string; role: string };
}

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
    // Pesan error generik untuk semua kasus gagal — cegah user enumeration
    const invalid = new UnauthorizedError('INVALID_CREDENTIALS', 'Email atau password salah');

    const user = await this.userRepo.findByEmail(dto.email);
    if (!user || !(await this.hasher.compare(dto.password, user.passwordHash))) {
      throw invalid;
    }
    // Soft-deleted user tidak boleh login lagi
    if (user.deletedAt) {
      throw invalid;
    }

    const accessToken = await this.tokenService.generateAccessToken({
      user_id: user.id,
      role: user.role,
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
