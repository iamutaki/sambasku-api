import { randomInt } from 'node:crypto';
import { ConflictError, UnauthorizedError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { Email } from '../../domain/value-objects/email.vo';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { AuthIdentityRepository } from '../../domain/repositories/auth-identity.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { User } from '../../domain/entities/user.entity';
import type { AuthIdentity } from '../../domain/entities/auth-identity.entity';
import type { LoginMeta } from '../dto/login.dto';
import type { FacebookLoginDto } from '../dto/facebook-login.dto';
import type { FacebookTokenVerifierPort } from '../ports/facebook-token-verifier.port';
import type { TokenServicePort } from '../ports/token-service.port';
import { issueLoginSession, type LoginResult } from '../utils/issue-login-session';

const FACEBOOK_PROVIDER = 'facebook';
const INVALID_MESSAGE = 'Tidak bisa masuk dengan Facebook.';

function invalidFacebookToken(): UnauthorizedError {
  return new UnauthorizedError('INVALID_FACEBOOK_TOKEN', INVALID_MESSAGE);
}

export class LoginWithFacebookUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly identityRepo: AuthIdentityRepository,
    private readonly verifier: FacebookTokenVerifierPort,
    private readonly tokenService: TokenServicePort,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly accessTokenTtlSeconds: number,
    private readonly refreshTokenTtlSeconds: number,
  ) {}

  async execute(dto: FacebookLoginDto, meta: LoginMeta = {}, requestId?: string | null): Promise<LoginResult> {
    const claims = await this.verifier.verify(dto.accessToken);
    const email = Email.create(claims.email).value;

    const identity = await this.identityRepo.findByProvider(FACEBOOK_PROVIDER, claims.facebookUserId);
    if (identity) {
      return this.sessionForExistingIdentity(identity, meta);
    }

    const userByEmail = await this.userRepo.findByEmail(email);
    if (userByEmail) {
      throw new ConflictError(
        'EMAIL_ALREADY_EXISTS',
        'Email sudah terdaftar. Masuk dengan password atau gunakan lupa password.',
      );
    }

    const username = await this.deriveUsername(claims.name, email);
    const created = await this.identityRepo.createUserWithGoogleIdentity(
      {
        username,
        email,
        phone: null,
        passwordHash: null,
        emailVerified: true,
      },
      {
        provider: FACEBOOK_PROVIDER,
        providerUserId: claims.facebookUserId,
        emailAtProvider: email,
      },
    );

    if (!created.created) {
      return this.sessionForExistingIdentity(created.identity, meta, created.user);
    }

    await this.auditRepo.record({
      userId: created.user.id,
      action: 'create',
      entityType: 'user',
      entityId: created.user.id,
      newData: {
        username: created.user.username,
        email: created.user.email,
        phone: null,
        role: created.user.role,
        via: 'facebook',
      },
      requestId: requestId ?? null,
    });

    return this.issue(created.user, meta);
  }

  private async sessionForExistingIdentity(
    identity: AuthIdentity,
    meta: LoginMeta,
    knownUser?: User,
  ): Promise<LoginResult> {
    if (identity.deletedAt) throw invalidFacebookToken();
    const user = knownUser ?? (await this.userRepo.findById(identity.userId));
    if (!user || user.deletedAt || !user.isActive) throw invalidFacebookToken();
    return this.issue(user, meta);
  }

  private issue(user: User, meta: LoginMeta): Promise<LoginResult> {
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

  private async deriveUsername(name: string | null, email: string): Promise<string> {
    const local = email.split('@')[0] ?? '';
    const base = (name?.trim() || local.trim() || 'user').slice(0, 80);
    if (!(await this.userRepo.findByUsername(base))) return base;
    for (let n = 2; n <= 99; n++) {
      const candidate = `${base}${n}`;
      if (!(await this.userRepo.findByUsername(candidate))) return candidate;
    }
    return `${base}${randomInt(0, 10_000).toString().padStart(4, '0')}`;
  }
}
