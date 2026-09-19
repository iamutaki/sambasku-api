import { and, desc, eq, isNull, like, or, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import { NotFoundError } from '@/shared/errors/app-error';
import type { UserRepository } from '../domain/repositories/user.repository';
import type { NewUser, User, UserListFilter, UserRole } from '../domain/entities/user.entity';

type UserRow = typeof users.$inferSelect;

function toEntity(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role as User['role'],
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

// Instance db di-inject lewat constructor - test bisa pakai testDb (Section 10)
export class UserRepositoryImpl implements UserRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

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

  async save(user: NewUser): Promise<User> {
    const [row] = await this.db.insert(users).values(user).returning();
    return toEntity(row);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async list(filter: UserListFilter): Promise<{ items: User[]; nextCursor: string | null; hasMore: boolean }> {
    const q = filter.q?.trim();
    const rows = await this.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
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
}
