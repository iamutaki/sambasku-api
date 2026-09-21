import { and, eq } from 'drizzle-orm';
import { authIdentities, users } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import { isUniqueViolation } from '@/shared/database/drizzle/sqlite-errors';
import { ConflictError } from '@/shared/errors/app-error';
import type { NewUser, User } from '../domain/entities/user.entity';
import type { AuthIdentity, NewAuthIdentity } from '../domain/entities/auth-identity.entity';
import type {
  AuthIdentityRepository,
  CreateUserWithGoogleIdentityResult,
  NewGoogleIdentity,
} from '../domain/repositories/auth-identity.repository';

type IdentityRow = typeof authIdentities.$inferSelect;
type UserRow = typeof users.$inferSelect;

function errHaystack(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string } };
  return `${e.message ?? ''} ${e.cause?.message ?? ''}`;
}

function toUserEntity(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    role: row.role as User['role'],
    isActive: row.isActive,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toIdentityEntity(row: IdentityRow): AuthIdentity {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    providerUserId: row.providerUserId,
    emailAtProvider: row.emailAtProvider,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  };
}

export class AuthIdentityRepositoryImpl implements AuthIdentityRepository {
  constructor(private readonly db: AppDatabase) {}

  async findByProvider(provider: string, providerUserId: string): Promise<AuthIdentity | null> {
    const [row] = await this.db
      .select()
      .from(authIdentities)
      .where(
        and(eq(authIdentities.provider, provider), eq(authIdentities.providerUserId, providerUserId)),
      )
      .limit(1);
    return row ? toIdentityEntity(row) : null;
  }

  async create(input: NewAuthIdentity): Promise<AuthIdentity> {
    const [row] = await this.db.insert(authIdentities).values(input).returning();
    return toIdentityEntity(row);
  }

  async createUserWithGoogleIdentity(
    newUser: NewUser,
    identity: NewGoogleIdentity,
  ): Promise<CreateUserWithGoogleIdentityResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const [userRow] = await tx.insert(users).values(newUser).returning();
        const [idRow] = await tx
          .insert(authIdentities)
          .values({
            userId: userRow.id,
            provider: identity.provider,
            providerUserId: identity.providerUserId,
            emailAtProvider: identity.emailAtProvider,
          })
          .returning();
        return {
          user: toUserEntity(userRow),
          identity: toIdentityEntity(idRow),
          created: true,
        };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;

      const haystack = errHaystack(err);
      if (haystack.includes('auth_identities_provider_uid_unique') || haystack.includes('provider_user_id')) {
        const existing = await this.findByProvider(identity.provider, identity.providerUserId);
        if (!existing) throw err;
        const [userRow] = await this.db
          .select()
          .from(users)
          .where(eq(users.id, existing.userId))
          .limit(1);
        if (!userRow) throw err;
        return { user: toUserEntity(userRow), identity: existing, created: false };
      }
      if (haystack.includes('users_email_unique') || haystack.includes('email')) {
        throw new ConflictError(
          'EMAIL_ALREADY_EXISTS',
          'Email sudah terdaftar. Masuk dengan password atau gunakan lupa password.',
        );
      }
      throw err;
    }
  }
}
