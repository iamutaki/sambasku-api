import { describe, it, expect, vi } from 'vitest';
import { ConflictError, NotFoundError, UnauthorizedError } from '@/shared/errors/app-error';
import {
  LinkGoogleAccountUseCase,
  ListAuthProvidersUseCase,
  UnlinkGoogleAccountUseCase,
} from '../../application/use-cases/link-google-account.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { AuthIdentityRepository } from '../../domain/repositories/auth-identity.repository';
import type { GoogleTokenVerifierPort } from '../../application/ports/google-token-verifier.port';
import type { User } from '../../domain/entities/user.entity';
import type { AuthIdentity } from '../../domain/entities/auth-identity.entity';

const USER_ID = '01TESTLINKUSER00000000001';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    username: 'budi',
    displayName: 'budi',
    bio: null,
    email: 'budi@test.com',
    phone: null,
    passwordHash: 'hash',
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
    canContribute: true,
    ...overrides,
  };
}

function makeIdentity(overrides: Partial<AuthIdentity> = {}): AuthIdentity {
  return {
    id: '01TESTLINKIDENT0000000001',
    userId: USER_ID,
    provider: 'google',
    providerUserId: 'google-sub-1',
    emailAtProvider: 'budi@gmail.com',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

describe('LinkGoogleAccountUseCase', () => {
  it('memverifikasi token lalu link', async () => {
    const identity = makeIdentity();
    const userRepo = { findById: vi.fn().mockResolvedValue(makeUser()) } as unknown as UserRepository;
    const identityRepo = { link: vi.fn().mockResolvedValue(identity) } as unknown as AuthIdentityRepository;
    const verifier = {
      verify: vi.fn().mockResolvedValue({
        sub: 'google-sub-1',
        email: 'budi@gmail.com',
        emailVerified: true,
        name: 'Budi',
      }),
    } as unknown as GoogleTokenVerifierPort;

    const result = await new LinkGoogleAccountUseCase(userRepo, identityRepo, verifier).execute(
      USER_ID,
      'id-token',
    );

    expect(verifier.verify).toHaveBeenCalledWith('id-token');
    expect(identityRepo.link).toHaveBeenCalledWith(USER_ID, {
      provider: 'google',
      providerUserId: 'google-sub-1',
      emailAtProvider: 'budi@gmail.com',
    });
    expect(result).toBe(identity);
  });

  it('sesi invalid → UNAUTHORIZED', async () => {
    const userRepo = { findById: vi.fn().mockResolvedValue(null) } as unknown as UserRepository;
    const identityRepo = { link: vi.fn() } as unknown as AuthIdentityRepository;
    const verifier = { verify: vi.fn() } as unknown as GoogleTokenVerifierPort;

    await expect(
      new LinkGoogleAccountUseCase(userRepo, identityRepo, verifier).execute(USER_ID, 't'),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(verifier.verify).not.toHaveBeenCalled();
  });
});

describe('UnlinkGoogleAccountUseCase', () => {
  it('lepas Google jika ada password', async () => {
    const identity = makeIdentity();
    const userRepo = { findById: vi.fn().mockResolvedValue(makeUser()) } as unknown as UserRepository;
    const identityRepo = {
      findActiveByUserAndProvider: vi.fn().mockResolvedValue(identity),
      listActiveByUserId: vi.fn().mockResolvedValue([identity]),
      unlink: vi.fn().mockResolvedValue(identity),
    } as unknown as AuthIdentityRepository;

    await new UnlinkGoogleAccountUseCase(userRepo, identityRepo).execute(USER_ID);

    expect(identityRepo.unlink).toHaveBeenCalledWith(USER_ID, 'google', USER_ID);
  });

  it('OAuth-only tanpa metode lain → LAST_AUTH_METHOD', async () => {
    const identity = makeIdentity();
    const userRepo = {
      findById: vi.fn().mockResolvedValue(makeUser({ passwordHash: null })),
    } as unknown as UserRepository;
    const identityRepo = {
      findActiveByUserAndProvider: vi.fn().mockResolvedValue(identity),
      listActiveByUserId: vi.fn().mockResolvedValue([identity]),
      unlink: vi.fn(),
    } as unknown as AuthIdentityRepository;

    await expect(new UnlinkGoogleAccountUseCase(userRepo, identityRepo).execute(USER_ID)).rejects.toMatchObject({
      errorCode: 'LAST_AUTH_METHOD',
    });
    expect(identityRepo.unlink).not.toHaveBeenCalled();
  });

  it('belum terhubung → GOOGLE_NOT_LINKED', async () => {
    const userRepo = { findById: vi.fn().mockResolvedValue(makeUser()) } as unknown as UserRepository;
    const identityRepo = {
      findActiveByUserAndProvider: vi.fn().mockResolvedValue(null),
      listActiveByUserId: vi.fn(),
      unlink: vi.fn(),
    } as unknown as AuthIdentityRepository;

    await expect(new UnlinkGoogleAccountUseCase(userRepo, identityRepo).execute(USER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('ListAuthProvidersUseCase', () => {
  it('mengembalikan provider aktif', async () => {
    const identity = makeIdentity();
    const identityRepo = {
      listActiveByUserId: vi.fn().mockResolvedValue([identity]),
    } as unknown as AuthIdentityRepository;

    const items = await new ListAuthProvidersUseCase(identityRepo).execute(USER_ID);
    expect(items).toEqual([{ provider: 'google', linkedAt: identity.createdAt }]);
  });
});

describe('ConflictError GOOGLE_ALREADY_LINKED', () => {
  it('repo link melempar conflict diteruskan', async () => {
    const userRepo = { findById: vi.fn().mockResolvedValue(makeUser()) } as unknown as UserRepository;
    const identityRepo = {
      link: vi.fn().mockRejectedValue(
        new ConflictError('GOOGLE_ALREADY_LINKED', 'Akun Google ini sudah terhubung ke pengguna lain.'),
      ),
    } as unknown as AuthIdentityRepository;
    const verifier = {
      verify: vi.fn().mockResolvedValue({ sub: 'x', email: 'a@b.c', name: null }),
    } as unknown as GoogleTokenVerifierPort;

    await expect(
      new LinkGoogleAccountUseCase(userRepo, identityRepo, verifier).execute(USER_ID, 't'),
    ).rejects.toMatchObject({ errorCode: 'GOOGLE_ALREADY_LINKED' });
  });
});
