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
  create(input: NewAuthIdentity): Promise<AuthIdentity>;
  createUserWithGoogleIdentity(
    newUser: NewUser,
    identity: NewGoogleIdentity,
  ): Promise<CreateUserWithGoogleIdentityResult>;
}
