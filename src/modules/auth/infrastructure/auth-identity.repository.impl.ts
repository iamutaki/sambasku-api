import { and, eq, isNull } from 'drizzle-orm';
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
    displayName: row.displayName || row.username,
    bio: row.bio ?? null,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    role: row.role as User['role'],
    isActive: row.isActive,
    canContribute: row.canContribute,
    emailVerified: row.emailVerified,
    avatarUrl: row.avatarUrl ?? null,
    avatarProvider: row.avatarProvider ?? null,
    avatarProviderFileId: row.avatarProviderFileId ?? null,
    avatarSha: row.avatarSha ?? null,
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

  async findActiveByUserAndProvider(userId: string, provider: string): Promise<AuthIdentity | null> {
    const [row] = await this.db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.userId, userId),
          eq(authIdentities.provider, provider),
          isNull(authIdentities.deletedAt),
        ),
      )
      .limit(1);
    return row ? toIdentityEntity(row) : null;
  }

  async listActiveByUserId(userId: string): Promise<AuthIdentity[]> {
    const rows = await this.db
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, userId), isNull(authIdentities.deletedAt)));
    return rows.map(toIdentityEntity);
  }

  async create(input: NewAuthIdentity): Promise<AuthIdentity> {
    const [row] = await this.db.insert(authIdentities).values(input).returning();
    return toIdentityEntity(row);
  }

  async link(userId: string, identity: NewGoogleIdentity): Promise<AuthIdentity> {
    const existing = await this.findByProvider(identity.provider, identity.providerUserId);

    if (existing) {
      if (!existing.deletedAt) {
        if (existing.userId === userId) return existing;
        throw new ConflictError(
          'GOOGLE_ALREADY_LINKED',
          'Akun Google ini sudah terhubung ke pengguna lain.',
        );
      }
      // Soft-deleted: restore hanya jika milik user yang sama
      if (existing.userId !== userId) {
        throw new ConflictError(
          'GOOGLE_ALREADY_LINKED',
          'Akun Google ini sudah terhubung ke pengguna lain.',
        );
      }
      const [restored] = await this.db
        .update(authIdentities)
        .set({
          deletedAt: null,
          deletedBy: null,
          emailAtProvider: identity.emailAtProvider,
        })
        .where(eq(authIdentities.id, existing.id))
        .returning();
      return toIdentityEntity(restored);
    }

    try {
      const [row] = await this.db
        .insert(authIdentities)
        .values({
          userId,
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          emailAtProvider: identity.emailAtProvider,
        })
        .returning();
      return toIdentityEntity(row);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await this.findByProvider(identity.provider, identity.providerUserId);
      if (raced && !raced.deletedAt && raced.userId === userId) return raced;
      throw new ConflictError(
        'GOOGLE_ALREADY_LINKED',
        'Akun Google ini sudah terhubung ke pengguna lain.',
      );
    }
  }

  async unlink(userId: string, provider: string, deletedBy: string): Promise<AuthIdentity | null> {
    const active = await this.findActiveByUserAndProvider(userId, provider);
    if (!active) return null;

    const [row] = await this.db
      .update(authIdentities)
      .set({ deletedAt: new Date(), deletedBy })
      .where(eq(authIdentities.id, active.id))
      .returning();
    return row ? toIdentityEntity(row) : null;
  }

  async createUserWithGoogleIdentity(
    newUser: NewUser,
    identity: NewGoogleIdentity,
  ): Promise<CreateUserWithGoogleIdentityResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const [userRow] = await tx
          .insert(users)
          .values({
            ...newUser,
            displayName: newUser.displayName ?? newUser.username,
            bio: newUser.bio ?? null,
          })
          .returning();
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
