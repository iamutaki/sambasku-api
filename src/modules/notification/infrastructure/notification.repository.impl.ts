import { and, count, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { notifications } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type {
  InboxNotification,
  InboxNotificationType,
  NotificationTargetKind,
} from '../domain/entities/notification.entity';
import type {
  CreateInboxNotificationInput,
  NotificationListOptions,
  NotificationListResult,
  NotificationRepository,
} from '../domain/repositories/notification.repository';

function toEntity(row: typeof notifications.$inferSelect): InboxNotification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as InboxNotificationType,
    title: row.title,
    body: row.body,
    targetKind: row.targetKind as NotificationTargetKind,
    targetId: row.targetId,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export class NotificationRepositoryImpl implements NotificationRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: CreateInboxNotificationInput): Promise<void> {
    await this.db
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        targetKind: input.targetKind,
        targetId: input.targetId,
      })
      .onConflictDoNothing({
        target: [notifications.userId, notifications.targetKind, notifications.targetId],
      });
  }

  async listByUser(userId: string, opts: NotificationListOptions): Promise<NotificationListResult> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          opts.unreadOnly ? isNull(notifications.readAt) : undefined,
          opts.cursor ? lt(notifications.id, opts.cursor) : undefined,
        ),
      )
      .orderBy(desc(notifications.id))
      .limit(opts.limit + 1);

    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      items: page.map(toEntity),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  async countUnread(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return Number(row?.value ?? 0);
  }

  async markRead(
    userId: string,
    id: string,
  ): Promise<'updated' | 'already_read' | 'not_found'> {
    const [existing] = await this.db
      .select({ id: notifications.id, readAt: notifications.readAt })
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .limit(1);
    if (!existing) return 'not_found';
    if (existing.readAt) return 'already_read';

    await this.db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
    return 'updated';
  }

  async markAllRead(userId: string): Promise<number> {
    const updated = await this.db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return updated.length;
  }
}
