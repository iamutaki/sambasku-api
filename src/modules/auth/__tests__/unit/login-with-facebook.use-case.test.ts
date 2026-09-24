import { describe, it, expect, vi } from 'vitest';
import { ConflictError, ServiceUnavailableError, UnauthorizedError } from '@/shared/errors/app-error';
import { LoginWithFacebookUseCase } from '../../application/use-cases/login-with-facebook.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { AuthIdentityRepository } from '../../domain/repositories/auth-identity.repository';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { TokenServicePort } from '../../application/ports/token-service.port';
import type { FacebookTokenVerifierPort } from '../../application/ports/facebook-token-verifier.port';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { User } from '../../domain/entities/user.entity';
import type { AuthIdentity } from '../../domain/entities/auth-identity.entity';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '01TESTFACEBOOKUSER0000001',
    username: 'budi',
    displayName: 'budi',
    bio: null,
    email: 'budi@example.com',
    phone: null,
    passwordHash: null,
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
    canContribute: overrides.canContribute ?? true,
  };
}

function makeIdentity(overrides: Partial<AuthIdentity> = {}): AuthIdentity {
  return {
    id: '01TESTFACEBOOKIDENT000001',
    userId: '01TESTFACEBOOKUSER0000001',
    provider: 'facebook',
    providerUserId: '10201122334455',
    emailAtProvider: 'budi@example.com',
    createdAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

const CLAIMS = {
  facebookUserId: '10201122334455',
  email: 'budi@example.com',
  name: 'Budi Santoso',
};

function makeDeps(opts: {
  claims?: typeof CLAIMS | Error;
  identity?: AuthIdentity | null;
  userById?: User | null;
  userByEmail?: User | null;
  usernamesTaken?: string[];
  created?: boolean;
} = {}) {
  const claimsOrErr = opts.claims ?? CLAIMS;
  const verifier: FacebookTokenVerifierPort = {
    verify: vi.fn().mockImplementation(async () => {
      if (claimsOrErr instanceof Error) throw claimsOrErr;
      return claimsOrErr;
    }),
  };

  const taken = new Set(opts.usernamesTaken ?? []);
  const createdUser = makeUser({ username: 'Budi Santoso' });
  const createdIdentity = makeIdentity();

  const userRepo = {
    findById: vi.fn().mockResolvedValue(opts.userById === undefined ? makeUser() : opts.userById),
    findByEmail: vi.fn().mockResolvedValue(opts.userByEmail ?? null),
    findByUsername: vi.fn().mockImplementation(async (name: string) =>
      taken.has(name) ? makeUser({ username: name }) : null,
    ),
    save: vi.fn(),
  } as unknown as UserRepository;

  const identityRepo = {
    findByProvider: vi.fn().mockResolvedValue(opts.identity === undefined ? null : opts.identity),
    create: vi.fn(),
    createUserWithGoogleIdentity: vi.fn().mockResolvedValue({
      user: createdUser,
      identity: createdIdentity,
      created: opts.created ?? true,
    }),
  } as unknown as AuthIdentityRepository;

  const tokenService = {
    generateAccessToken: vi.fn().mockResolvedValue('jwt-facebook'),
    verifyAccessToken: vi.fn(),
  } as unknown as TokenServicePort;

  const refreshTokenRepo = {
    create: vi.fn().mockResolvedValue({}),
    findByHash: vi.fn(),
    revokeByHash: vi.fn(),
    revokeAllForUser: vi.fn(),
  } as unknown as RefreshTokenRepository;

  const auditRepo = {
    record: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
  } as unknown as AuditLogRepository;

  const useCase = new LoginWithFacebookUseCase(
    userRepo,
    identityRepo,
    verifier,
    tokenService,
    refreshTokenRepo,
    auditRepo,
    900,
    2592000,
  );

  return { useCase, userRepo, identityRepo, verifier, refreshTokenRepo, auditRepo };
}

describe('LoginWithFacebookUseCase', () => {
  it('identity ada + user aktif → sesi, tidak save user, tidak audit', async () => {
    const { useCase, identityRepo, userRepo, auditRepo, refreshTokenRepo } = makeDeps({
      identity: makeIdentity(),
      userById: makeUser(),
    });

    const result = await useCase.execute({ accessToken: 'fb-token' });

    expect(result.accessToken).toBe('jwt-facebook');
    expect(result.user).toEqual({
      id: '01TESTFACEBOOKUSER0000001',
      username: 'budi',
      role: 'contributor',
      avatarUrl: null,
    });
    expect(identityRepo.createUserWithGoogleIdentity).not.toHaveBeenCalled();
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
    expect(auditRepo.record).not.toHaveBeenCalled();
    expect(refreshTokenRepo.create).toHaveBeenCalledOnce();
  });

  it('identity tidak ada + email sudah di users → EMAIL_ALREADY_EXISTS, tidak create identity', async () => {
    const { useCase, identityRepo } = makeDeps({
      identity: null,
      userByEmail: makeUser({ passwordHash: 'hash' }),
    });

    await expect(useCase.execute({ accessToken: 'fb-token' })).rejects.toMatchObject({
      errorCode: 'EMAIL_ALREADY_EXISTS',
      statusCode: 409,
      message: 'Email sudah terdaftar. Masuk dengan password atau gunakan lupa password.',
    });
    expect(identityRepo.createUserWithGoogleIdentity).not.toHaveBeenCalled();
  });

  it('identity tidak ada + email baru → save user passwordHash null + identity + audit via facebook', async () => {
    const { useCase, identityRepo, auditRepo } = makeDeps({ identity: null, userByEmail: null });

    const result = await useCase.execute({ accessToken: 'fb-token' }, {}, 'req-1');

    expect(result.accessToken).toBe('jwt-facebook');
    expect(identityRepo.createUserWithGoogleIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'budi@example.com',
        passwordHash: null,
        phone: null,
        emailVerified: true,
        username: 'Budi Santoso',
      }),
      expect.objectContaining({
        provider: 'facebook',
        providerUserId: '10201122334455',
        emailAtProvider: 'budi@example.com',
      }),
    );
    expect(auditRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entityType: 'user',
        newData: expect.objectContaining({ via: 'facebook', email: 'budi@example.com' }),
        requestId: 'req-1',
      }),
    );
  });

  it('verify throw → INVALID_FACEBOOK_TOKEN', async () => {
    const { useCase, identityRepo } = makeDeps({
      claims: new UnauthorizedError('INVALID_FACEBOOK_TOKEN', 'Tidak bisa masuk dengan Facebook.'),
    });

    await expect(useCase.execute({ accessToken: 'bad' })).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
      statusCode: 401,
    });
    expect(identityRepo.findByProvider).not.toHaveBeenCalled();
  });

  it('identity deletedAt terisi → INVALID_FACEBOOK_TOKEN', async () => {
    const { useCase, auditRepo } = makeDeps({
      identity: makeIdentity({ deletedAt: new Date() }),
    });

    await expect(useCase.execute({ accessToken: 'fb-token' })).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
    });
    expect(auditRepo.record).not.toHaveBeenCalled();
  });

  it('user isActive false / deletedAt → INVALID_FACEBOOK_TOKEN', async () => {
    const { useCase } = makeDeps({
      identity: makeIdentity(),
      userById: makeUser({ isActive: false }),
    });

    await expect(useCase.execute({ accessToken: 'fb-token' })).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
    });

    const deleted = makeDeps({
      identity: makeIdentity(),
      userById: makeUser({ deletedAt: new Date() }),
    });
    await expect(deleted.useCase.execute({ accessToken: 'fb-token' })).rejects.toMatchObject({
      errorCode: 'INVALID_FACEBOOK_TOKEN',
    });
  });

  it('username bentrok → sufiks terpakai', async () => {
    const { useCase, identityRepo } = makeDeps({
      identity: null,
      usernamesTaken: ['Budi Santoso'],
    });

    await useCase.execute({ accessToken: 'fb-token' });

    expect(identityRepo.createUserWithGoogleIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Budi Santoso2' }),
      expect.any(Object),
    );
  });

  it('verifier 503 FACEBOOK_AUTH_UNAVAILABLE menjalar', async () => {
    const { useCase } = makeDeps({
      claims: new ServiceUnavailableError(
        'FACEBOOK_AUTH_UNAVAILABLE',
        'Masuk dengan Facebook sedang tidak tersedia.',
      ),
    });

    await expect(useCase.execute({ accessToken: 'fb-token' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    await expect(useCase.execute({ accessToken: 'fb-token' })).rejects.toMatchObject({
      errorCode: 'FACEBOOK_AUTH_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('ConflictError EMAIL_ALREADY_EXISTS adalah 409', () => {
    const err = new ConflictError(
      'EMAIL_ALREADY_EXISTS',
      'Email sudah terdaftar. Masuk dengan password atau gunakan lupa password.',
    );
    expect(err.statusCode).toBe(409);
  });
});
