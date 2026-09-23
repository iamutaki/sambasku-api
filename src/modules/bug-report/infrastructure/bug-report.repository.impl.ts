import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { bugReports, users } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { BugReportImageRow } from '@/shared/database/drizzle/schema/bug-reports.schema';
import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  BugReport,
  BugReportImage,
  BugReportListFilter,
  BugReportPlatform,
  BugReportStatus,
  NewBugReport,
} from '../domain/entities/bug-report.entity';
import type { BugReportRepository } from '../domain/repositories/bug-report.repository';

type Row = typeof bugReports.$inferSelect;

function asImages(value: unknown): BugReportImage[] {
  if (!Array.isArray(value)) return [];
  return (value as BugReportImageRow[]).map((item) => ({
    url: item.url,
    providerFileId: item.provider_file_id,
  }));
}

function asStatus(value: string): BugReportStatus {
  return value as BugReportStatus;
}

function asPlatform(value: string | null): BugReportPlatform | null {
  if (value === 'android' || value === 'ios') return value;
  return null;
}

function toEntity(row: Row, username: string | null): BugReport {
  return {
    id: row.id,
    userId: row.userId,
    username,
    deviceId: row.deviceId,
    description: row.description,
    images: asImages(row.images),
    appVersion: row.appVersion,
    platform: asPlatform(row.platform),
    status: asStatus(row.status),
    resolutionNote: row.resolutionNote,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toImageRows(images: BugReportImage[]): BugReportImageRow[] {
  return images.map((img) => ({ url: img.url, provider_file_id: img.providerFileId }));
}

export class BugReportRepositoryImpl implements BugReportRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: NewBugReport): Promise<BugReport> {
    const [row] = await this.db
      .insert(bugReports)
      .values({
        userId: input.userId,
        deviceId: input.deviceId,
        description: input.description,
        images: toImageRows(input.images),
        appVersion: input.appVersion,
        platform: input.platform,
        createdBy: input.userId,
      })
      .returning();
    return toEntity(row, null);
  }

  async findById(id: string): Promise<BugReport | null> {
    const [row] = await this.db
      .select({ report: bugReports, username: users.username })
      .from(bugReports)
      .leftJoin(users, eq(users.id, bugReports.userId))
      .where(and(eq(bugReports.id, id), isNull(bugReports.deletedAt)))
      .limit(1);
    return row ? toEntity(row.report, row.username) : null;
  }

  async list(filter: BugReportListFilter): Promise<CursorPage<BugReport>> {
    const rows = await this.db
      .select({ report: bugReports, username: users.username })
      .from(bugReports)
      .leftJoin(users, eq(users.id, bugReports.userId))
      .where(
        and(
          isNull(bugReports.deletedAt),
          filter.status ? eq(bugReports.status, filter.status) : undefined,
          filter.cursor ? lt(bugReports.id, filter.cursor) : undefined,
        ),
      )
      .orderBy(desc(bugReports.id))
      .limit(filter.limit + 1);

    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const items = page.map((r) => toEntity(r.report, r.username));
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  }

  async resolve(input: {
    id: string;
    status: Exclude<BugReportStatus, 'open'>;
    note: string | null;
    actorId: string;
  }): Promise<BugReport | null> {
    const [row] = await this.db
      .update(bugReports)
      .set({
        status: input.status,
        resolutionNote: input.note,
        resolvedBy: input.actorId,
        resolvedAt: new Date(),
        updatedBy: input.actorId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(bugReports.id, input.id), eq(bugReports.status, 'open'), isNull(bugReports.deletedAt)),
      )
      .returning();
    if (!row) return null;
    return this.findById(row.id);
  }
}
