import type { NewUser, User } from '../entities/user.entity';
import type { AuthIdentity, NewAuthIdentity } from '../entities/auth-identity.entity';

export interface NewGoogleIdentity {
  provider: string;
  providerUserId: string;
  emailAtProvider: string | null;
}

export interface CreateUserWithGoogleIdentityResult {
  user: User;
  identity: AuthIdentity;
  /** false = race unique identity: baris sudah ada, treat as login */
  created: boolean;
}

export interface AuthIdentityRepository {
  /**
   * WAJIB mengembalikan baris soft-deleted juga (tanpa filter deleted_at).
   * Unique (provider, provider_user_id) tidak partial.
   */
  findByProvider(provider: string, providerUserId: string): Promise<AuthIdentity | null>;
  findActiveByUserAndProvider(userId: string, provider: string): Promise<AuthIdentity | null>;
  listActiveByUserId(userId: string): Promise<AuthIdentity[]>;
  create(input: NewAuthIdentity): Promise<AuthIdentity>;
  /**
   * Link identity ke user. Jika baris soft-deleted untuk (provider, sub)
   * milik user yang sama: restore. Race unique ditangani di impl.
   */
  link(userId: string, identity: NewGoogleIdentity): Promise<AuthIdentity>;
  /** Soft-delete identity aktif milik user untuk provider. Null jika tidak ada. */
  unlink(userId: string, provider: string, deletedBy: string): Promise<AuthIdentity | null>;
  createUserWithGoogleIdentity(
    newUser: NewUser,
    identity: NewGoogleIdentity,
  ): Promise<CreateUserWithGoogleIdentityResult>;
}
