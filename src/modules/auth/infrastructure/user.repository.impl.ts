import { and, desc, eq, isNull, like, or, lt, sql } from 'drizzle-orm';
import { users } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import { NotFoundError } from '@/shared/errors/app-error';
import { ANONIM_USER_ID } from '@/shared/constants/anonim';
import type { UserRepository } from '../domain/repositories/user.repository';
import type { NewUser, User, UserListFilter, UserRole } from '../domain/entities/user.entity';

type UserRow = typeof users.$inferSelect;

function toEntity(row: UserRow): User {
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

// Instance db di-inject lewat constructor - test bisa pakai testDb (Section 10)
export class UserRepositoryImpl implements UserRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? toEntity(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return row ? toEntity(row) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.phone, phone)).limit(1);
    return row ? toEntity(row) : null;
  }

  async save(user: NewUser): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        ...user,
        displayName: user.displayName ?? user.username,
        bio: user.bio ?? null,
      })
      .returning();
    return toEntity(row);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async list(filter: UserListFilter): Promise<{ items: User[]; nextCursor: string | null; hasMore: boolean }> {
    const q = filter.q?.trim();
    const rows = await this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        bio: users.bio,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        canContribute: users.canContribute,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        // Di-select juga untuk cursor comparison walau tidak di-return ke user (deletedAt
        // tidak pernah tampil, tapi where exclude deleted).
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          filter.role ? eq(users.role, filter.role) : undefined,
          filter.canContribute === undefined ? undefined : eq(users.canContribute, filter.canContribute),
          // User sistem anonim tidak masuk daftar akun yang dihentikan.
          filter.canContribute === false ? sql`${users.id} != ${ANONIM_USER_ID}` : undefined,
          q
            ? or(
                like(sql`lower(${users.username})`, `%${q.toLowerCase()}%`),
                like(sql`lower(${users.email})`, `%${q.toLowerCase()}%`),
              )
            : undefined,
          filter.cursor ? lt(sql`(${users.createdAt}, ${users.id})`, sql`(SELECT created_at, id FROM users WHERE id = ${filter.cursor})`) : undefined,
        ),
      )
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;

    return {
      items: page.map((r) => toEntity({ ...r, passwordHash: null } as UserRow)),
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  async setCanContribute(id: string, canContribute: boolean): Promise<boolean> {
    if (id === ANONIM_USER_ID) return false;
    const [updated] = await this.db
      .update(users)
      .set({ canContribute, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });
    return !!updated;
  }

  async setIsActive(id: string, isActive: boolean): Promise<boolean> {
    if (id === ANONIM_USER_ID) return false;
    const [updated] = await this.db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });
    return !!updated;
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    const [updated] = await this.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!updated) {
      throw new NotFoundError('USER_NOT_FOUND', `User ${id} tidak ditemukan`);
    }
  }

  async updatePhone(id: string, phone: string): Promise<void> {
    const [updated] = await this.db
      .update(users)
      .set({ phone, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!updated) {
      throw new NotFoundError('USER_NOT_FOUND', `User ${id} tidak ditemukan`);
    }
  }

  async updateAvatar(
    id: string,
    data: {
      avatarUrl: string;
      avatarProvider: string;
      avatarProviderFileId: string;
      avatarSha: string;
    },
  ): Promise<void> {
    const [updated] = await this.db
      .update(users)
      .set({
        avatarUrl: data.avatarUrl,
        avatarProvider: data.avatarProvider,
        avatarProviderFileId: data.avatarProviderFileId,
        avatarSha: data.avatarSha,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!updated) {
      throw new NotFoundError('USER_NOT_FOUND', `User ${id} tidak ditemukan`);
    }
  }

  async clearAvatar(id: string): Promise<void> {
    const [updated] = await this.db
      .update(users)
      .set({
        avatarUrl: null,
        avatarProvider: null,
        avatarProviderFileId: null,
        avatarSha: null,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!updated) {
      throw new NotFoundError('USER_NOT_FOUND', `User ${id} tidak ditemukan`);
    }
  }

  async updateProfile(
    id: string,
    data: { displayName?: string; bio?: string | null },
  ): Promise<User> {
    const [updated] = await this.db
      .update(users)
      .set({
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning();

    if (!updated) {
      throw new NotFoundError('USER_NOT_FOUND', `User ${id} tidak ditemukan`);
    }
    return toEntity(updated);
  }
}
