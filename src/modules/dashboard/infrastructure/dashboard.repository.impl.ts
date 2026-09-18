import { and, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { auditLogs, contributions, users, words } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import type {
  AppRoleKey,
  ContributionStatusKey,
  DashboardStats,
  WordStatusKey,
} from '../domain/entities/dashboard-stats.entity';
import type { DashboardRepository } from '../domain/repositories/dashboard.repository';

type StatusRow = { status: string; count: number };

function toRecord<T extends string>(keys: readonly T[], rows: StatusRow[]): Record<T, number> {
  const record = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const row of rows) {
    if (row.status in record) record[row.status as T] = row.count;
  }
  return record;
}

const WORD_STATUSES = ['draft', 'pending_review', 'published', 'rejected'] as const;
const CONTRIBUTION_STATUSES = ['pending', 'approved', 'rejected', 'corrected'] as const;
const APP_ROLES = ['root', 'admin', 'editor', 'reviewer', 'contributor'] as const;

// Agregasi ringan lintas tabel untuk halaman dashboard. Semua query jalan
// paralel (satu Promise.all) - dashboard tampil cepat tanpa beban kunci.
export class DashboardRepositoryImpl implements DashboardRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async getStats(): Promise<DashboardStats> {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [wordByStatus, wordVerified, wordDeleted, contributionByStatus, userByRole, auditLast7Days] =
      await Promise.all([
        // Kata per status (exclude soft-deleted)
        this.db
          .select({ status: words.status, count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(words)
          .where(isNull(words.deletedAt))
          .groupBy(words.status),

        // Kata terverifikasi (belum soft-deleted)
        this.db
          .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(words)
          .where(and(isNull(words.deletedAt), eq(words.isVerified, true))),

        // Kata soft-deleted
        this.db
          .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(words)
          .where(isNotNull(words.deletedAt)),

        // Kontribusi per status (exclude soft-deleted)
        this.db
          .select({ status: contributions.status, count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(contributions)
          .where(isNull(contributions.deletedAt))
          .groupBy(contributions.status),

        // User aktif per role (exclude soft-deleted) - dipetakan ke `status`
        // supaya satu helper toRecord() untuk semua grup status/role
        this.db
          .select({ status: users.role, count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(users)
          .where(and(isNull(users.deletedAt), eq(users.isActive, true)))
          .groupBy(users.role),

        // Aktivitas mutasi 7 hari terakhir
        this.db
          .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(auditLogs)
          .where(gte(auditLogs.createdAt, sevenDaysAgo)),
      ]);

    const wordCounts = toRecord(WORD_STATUSES, wordByStatus);
    const contributionCounts = toRecord(CONTRIBUTION_STATUSES, contributionByStatus);
    const roleCounts = toRecord(APP_ROLES, userByRole);

    return {
      words: {
        total: totalOf(wordCounts),
        verified: countOf(wordVerified),
        deleted: countOf(wordDeleted),
        byStatus: wordCounts as Record<WordStatusKey, number>,
      },
      contributions: {
        total: totalOf(contributionCounts),
        byStatus: contributionCounts as Record<ContributionStatusKey, number>,
      },
      users: {
        active: totalOf(roleCounts),
        byRole: roleCounts as Record<AppRoleKey, number>,
      },
      activity: {
        auditLogsLast7Days: countOf(auditLast7Days),
      },
    };
  }
}

function totalOf(record: Record<string, number>): number {
  return Object.values(record).reduce((acc, value) => acc + value, 0);
}

// count(*) selalu mengembalikan tepat satu baris agregat - ambil nilainya
function countOf(rows: { count: number }[]): number {
  const [row] = rows;
  return row?.count ?? 0;
}