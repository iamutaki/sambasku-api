import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users, verifierApplications } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors/app-error';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  NewVerifierApplication,
  SocialLink,
  VerifierApplication,
  VerifierApplicationListItem,
  VerifierApplicationStatus,
} from '../domain/entities/verifier-application.entity';
import type {
  VerifierApplicationListFilter,
  VerifierApplicationRepository,
  VerifierApplicationWriteInput,
} from '../domain/repositories/verifier-application.repository';

type Row = typeof verifierApplications.$inferSelect;

const UNIQUE_VIOLATION = '23505';

function asStatus(value: string): VerifierApplicationStatus {
  return value as VerifierApplicationStatus;
}

function asLinks(value: unknown): SocialLink[] {
  return Array.isArray(value) ? (value as SocialLink[]) : [];
}

function toEntity(
  row: Row,
  username: string | null,
  reviewedByUsername: string | null = null,
): VerifierApplication {
  return {
    id: row.id,
    userId: row.userId,
    username,
    phone: row.phone,
    address: row.address,
    socialLinks: asLinks(row.socialLinks),
    status: asStatus(row.status),
    adminComment: row.adminComment,
    reviewedBy: row.reviewedBy,
    reviewedByUsername,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const reviewers = alias(users, 'reviewers');

function pgMeta(err: unknown): { code?: string; constraint: string; detail: string } {
  const e = err as {
    code?: string;
    constraint?: string;
    detail?: string;
    cause?: { code?: string; constraint?: string; detail?: string };
  };
  return {
    code: e.cause?.code ?? e.code,
    constraint: e.cause?.constraint ?? e.constraint ?? '',
    detail: e.cause?.detail ?? e.detail ?? '',
  };
}

function throwMappedUnique(err: unknown): never | void {
  const { code, constraint, detail } = pgMeta(err);
  if (code !== UNIQUE_VIOLATION) return;
  const haystack = `${constraint} ${detail}`;
  if (haystack.includes('verifier_applications_user_id') || haystack.includes('(user_id)')) {
    throw new ConflictError(
      'APPLICATION_ALREADY_EXISTS',
      'Pengajuan verifikator sudah ada. Perbaiki lewat formulir jika ditolak.',
    );
  }
  if (haystack.includes('users_phone') || haystack.includes('(phone)')) {
    throw new ConflictError('PHONE_ALREADY_EXISTS', 'Nomor HP sudah terdaftar');
  }
  throw new ConflictError('PHONE_ALREADY_EXISTS', 'Nomor HP sudah terdaftar');
}

export class VerifierApplicationRepositoryImpl implements VerifierApplicationRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(input: NewVerifierApplication): Promise<VerifierApplication> {
    const [row] = await this.db.insert(verifierApplications).values(input).returning();
    return toEntity(row, null);
  }

  async createWithPhone(input: NewVerifierApplication): Promise<VerifierApplication> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(verifierApplications).values(input).returning();
        await tx
          .update(users)
          .set({ phone: input.phone, updatedAt: new Date() })
          .where(eq(users.id, input.userId));
        return toEntity(row, null);
      });
    } catch (err) {
      throwMappedUnique(err);
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<VerifierApplication | null> {
    const [row] = await this.db
      .select({
        app: verifierApplications,
        username: users.username,
        reviewedByUsername: reviewers.username,
      })
      .from(verifierApplications)
      .leftJoin(users, eq(users.id, verifierApplications.userId))
      .leftJoin(reviewers, eq(reviewers.id, verifierApplications.reviewedBy))
      .where(eq(verifierApplications.userId, userId))
      .limit(1);
    return row ? toEntity(row.app, row.username, row.reviewedByUsername) : null;
  }

  async findById(id: string): Promise<VerifierApplication | null> {
    const [row] = await this.db
      .select({
        app: verifierApplications,
        username: users.username,
        reviewedByUsername: reviewers.username,
      })
      .from(verifierApplications)
      .leftJoin(users, eq(users.id, verifierApplications.userId))
      .leftJoin(reviewers, eq(reviewers.id, verifierApplications.reviewedBy))
      .where(eq(verifierApplications.id, id))
      .limit(1);
    return row ? toEntity(row.app, row.username, row.reviewedByUsername) : null;
  }

  async list(
    filter: VerifierApplicationListFilter,
  ): Promise<CursorPage<VerifierApplicationListItem>> {
    const rows = await this.db
      .select({
        id: verifierApplications.id,
        userId: verifierApplications.userId,
        username: users.username,
        phone: verifierApplications.phone,
        status: verifierApplications.status,
        createdAt: verifierApplications.createdAt,
      })
      .from(verifierApplications)
      .leftJoin(users, eq(users.id, verifierApplications.userId))
      .where(
        and(
          filter.status ? eq(verifierApplications.status, filter.status) : undefined,
          filter.cursor ? lt(verifierApplications.id, filter.cursor) : undefined,
        ),
      )
      .orderBy(desc(verifierApplications.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const items: VerifierApplicationListItem[] = page.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.username,
      phone: r.phone,
      status: asStatus(r.status),
      createdAt: r.createdAt,
    }));
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  }

  async resubmit(
    userId: string,
    input: VerifierApplicationWriteInput,
  ): Promise<VerifierApplication | null> {
    const [row] = await this.db
      .update(verifierApplications)
      .set({
        phone: input.phone,
        address: input.address,
        socialLinks: input.socialLinks,
        status: 'pending',
        adminComment: null,
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(verifierApplications.userId, userId), eq(verifierApplications.status, 'rejected')))
      .returning();
    return row ? toEntity(row, null) : null;
  }

  async resubmitWithPhone(
    userId: string,
    input: VerifierApplicationWriteInput,
  ): Promise<VerifierApplication | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(verifierApplications)
          .set({
            phone: input.phone,
            address: input.address,
            socialLinks: input.socialLinks,
            status: 'pending',
            adminComment: null,
            reviewedBy: null,
            reviewedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(eq(verifierApplications.userId, userId), eq(verifierApplications.status, 'rejected')),
          )
          .returning();
        if (!row) return null;
        await tx
          .update(users)
          .set({ phone: input.phone, updatedAt: new Date() })
          .where(eq(users.id, userId));
        return toEntity(row, null);
      });
    } catch (err) {
      throwMappedUnique(err);
      throw err;
    }
  }

  async approveAtomically(id: string, reviewerId: string): Promise<VerifierApplication> {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(verifierApplications)
        .where(eq(verifierApplications.id, id))
        .limit(1)
        .for('update');
      if (!app) {
        throw new NotFoundError(
          'VERIFIER_APPLICATION_NOT_FOUND',
          'Pengajuan verifikator tidak ditemukan',
        );
      }
      if (app.status !== 'pending') {
        throw new ConflictError(
          'APPLICATION_ALREADY_REVIEWED',
          'Pengajuan sudah memiliki keputusan',
        );
      }

      const [user] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, app.userId), isNull(users.deletedAt)))
        .limit(1)
        .for('update');
      if (!user || user.role !== 'contributor') {
        throw new ForbiddenError('ALREADY_VERIFIER', 'Pemohon bukan lagi kontributor');
      }

      const now = new Date();
      const [row] = await tx
        .update(verifierApplications)
        .set({
          status: 'approved',
          reviewedBy: reviewerId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(verifierApplications.id, id))
        .returning();
      await tx.update(users).set({ role: 'reviewer', updatedAt: now }).where(eq(users.id, user.id));
      return toEntity(row, user.username);
    });
  }

  async markApproved(id: string, reviewerId: string): Promise<VerifierApplication | null> {
    const now = new Date();
    const [row] = await this.db
      .update(verifierApplications)
      .set({
        status: 'approved',
        reviewedBy: reviewerId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(and(eq(verifierApplications.id, id), eq(verifierApplications.status, 'pending')))
      .returning();
    return row ? toEntity(row, null) : null;
  }

  async markRejected(
    id: string,
    reviewerId: string,
    comment: string,
  ): Promise<VerifierApplication | null> {
    const now = new Date();
    const [row] = await this.db
      .update(verifierApplications)
      .set({
        status: 'rejected',
        adminComment: comment,
        reviewedBy: reviewerId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(and(eq(verifierApplications.id, id), eq(verifierApplications.status, 'pending')))
      .returning();
    return row ? toEntity(row, null) : null;
  }
}
