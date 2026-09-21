import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';
import { ilikeCompat } from '@/shared/database/drizzle/ilike-compat';
import { auditLogs, users } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import { logger } from '@/shared/logging/logger';
import type { AuditLog, AuditLogFilter, AuditLogPage, NewAuditLog } from '../domain/entities/audit-log.entity';
import type { AuditLogRepository } from '../domain/repositories/audit-log.repository';

function toEntity(row: typeof auditLogs.$inferSelect, userName: string | null): AuditLog {
  return {
    id: row.id,
    userId: row.userId,
    userName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    oldData: (row.oldData as Record<string, unknown> | null) ?? null,
    newData: (row.newData as Record<string, unknown> | null) ?? null,
    requestId: row.requestId,
    createdAt: row.createdAt,
  };
}

export class AuditLogRepositoryImpl implements AuditLogRepository {
  constructor(private readonly db: AppDatabase) {}

  // Best-effort - kontrak Section 21: gagal insert tidak boleh
  // meruntuhkan request utama, cukup tercatat di log aplikasi.
  async record(entry: NewAuditLog): Promise<void> {
    try {
      await this.db.insert(auditLogs).values(entry);
    } catch (err) {
      logger.error({ err, entity_type: entry.entityType, entity_id: entry.entityId }, 'Audit log gagal ditulis');
    }
  }

  // Cursor-based (Section 13): id ULID ≈ created_at (time-sortable),
  // jadi ORDER BY id DESC = terbaru dulu; fetch limit+1 untuk has_more
  async list(filter: AuditLogFilter): Promise<AuditLogPage> {
    // Escape wildcard LIKE supaya input user tidak jadi pola pencarian
    const term = filter.userName?.replace(/[\\%_]/g, '\\$&');
    const where = and(
      filter.userId ? eq(auditLogs.userId, filter.userId) : undefined,
      term ? ilikeCompat(users.username, `%${term}%`) : undefined,
      filter.action ? eq(auditLogs.action, filter.action) : undefined,
      filter.entityType ? eq(auditLogs.entityType, filter.entityType) : undefined,
      filter.entityId ? eq(auditLogs.entityId, filter.entityId) : undefined,
      filter.from ? gte(auditLogs.createdAt, filter.from) : undefined,
      filter.to ? lte(auditLogs.createdAt, filter.to) : undefined,
      filter.cursor ? lt(auditLogs.id, filter.cursor) : undefined,
    );

    const rows = await this.db
      .select({ log: auditLogs, userName: users.username })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const page = (hasMore ? rows.slice(0, filter.limit) : rows).map((row) => toEntity(row.log, row.userName));

    return {
      items: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
      hasMore,
    };
  }
}
