import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '@/shared/errors/app-error';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { AuthIdentityRepository } from '../../domain/repositories/auth-identity.repository';
import type { GoogleTokenVerifierPort } from '../ports/google-token-verifier.port';
import type { AuthIdentity } from '../../domain/entities/auth-identity.entity';

const GOOGLE_PROVIDER = 'google';

export interface LinkedProviderItem {
  provider: string;
  linkedAt: Date;
}

export class ListAuthProvidersUseCase {
  constructor(private readonly identityRepo: AuthIdentityRepository) {}

  async execute(userId: string): Promise<LinkedProviderItem[]> {
    const identities = await this.identityRepo.listActiveByUserId(userId);
    return identities.map((i) => ({
      provider: i.provider,
      linkedAt: i.createdAt,
    }));
  }
}

export class LinkGoogleAccountUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly identityRepo: AuthIdentityRepository,
    private readonly verifier: GoogleTokenVerifierPort,
  ) {}

  async execute(userId: string, idToken: string): Promise<AuthIdentity> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Sesi tidak valid');
    }

    const claims = await this.verifier.verify(idToken);
    return this.identityRepo.link(userId, {
      provider: GOOGLE_PROVIDER,
      providerUserId: claims.sub,
      emailAtProvider: claims.email,
    });
  }
}

export class UnlinkGoogleAccountUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly identityRepo: AuthIdentityRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Sesi tidak valid');
    }

    const active = await this.identityRepo.findActiveByUserAndProvider(userId, GOOGLE_PROVIDER);
    if (!active) {
      throw new NotFoundError('GOOGLE_NOT_LINKED', 'Akun Google belum terhubung.');
    }

    const allActive = await this.identityRepo.listActiveByUserId(userId);
    const hasPassword = user.passwordHash !== null;
    const otherIdentities = allActive.filter((i) => i.provider !== GOOGLE_PROVIDER);
    if (!hasPassword && otherIdentities.length === 0) {
      throw new ConflictError(
        'LAST_AUTH_METHOD',
        'Setel password dulu sebelum melepas Google. Gunakan lupa password jika belum punya.',
      );
    }

    await this.identityRepo.unlink(userId, GOOGLE_PROVIDER, userId);
  }
}
