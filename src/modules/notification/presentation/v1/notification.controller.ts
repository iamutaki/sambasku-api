import type { Context } from 'hono';
import { UnauthorizedError } from '@/shared/errors/app-error';
import type { AppVariables, AuthUser } from '@/shared/types';
import type { GetUnreadNotificationCountUseCase } from '../../application/use-cases/get-unread-notification-count.use-case';
import type { ListMyNotificationsUseCase } from '../../application/use-cases/list-my-notifications.use-case';
import type { MarkAllNotificationsReadUseCase } from '../../application/use-cases/mark-all-notifications-read.use-case';
import type { MarkNotificationReadUseCase } from '../../application/use-cases/mark-notification-read.use-case';
import type { ListNotificationsQuery } from './validators/notification.validator';

export class NotificationController {
  constructor(
    private readonly deps: {
      list: ListMyNotificationsUseCase;
      unreadCount: GetUnreadNotificationCountUseCase;
      markRead: MarkNotificationReadUseCase;
      markAllRead: MarkAllNotificationsReadUseCase;
    },
  ) {}

  async list(c: Context, query: ListNotificationsQuery) {
    const user = this.requireUser(c);
    const result = await this.deps.list.execute(user.user_id, {
      limit: query.limit,
      cursor: query.cursor,
      unreadOnly: query.unread === true,
    });

    return c.json({
      success: true as const,
      data: result.items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        target_kind: n.targetKind,
        target_id: n.targetId,
        read_at: n.readAt?.toISOString() ?? null,
        created_at: n.createdAt.toISOString(),
      })),
      meta: {
        limit: query.limit,
        next_cursor: result.nextCursor,
        has_more: result.hasMore,
      },
    });
  }

  async unreadCount(c: Context) {
    const user = this.requireUser(c);
    const unreadCount = await this.deps.unreadCount.execute(user.user_id);
    return c.json({
      success: true as const,
      data: { unread_count: unreadCount },
    });
  }

  async markRead(c: Context, id: string) {
    const user = this.requireUser(c);
    const result = await this.deps.markRead.execute(user.user_id, id);
    return c.json({
      success: true as const,
      data: { id, already_read: result.alreadyRead },
    });
  }

  async markAllRead(c: Context) {
    const user = this.requireUser(c);
    const updated = await this.deps.markAllRead.execute(user.user_id);
    return c.json({
      success: true as const,
      data: { updated },
    });
  }

  private requireUser(c: Context): AuthUser {
    const user = (c as Context<{ Variables: AppVariables }>).get('user');
    if (!user) throw new UnauthorizedError('UNAUTHORIZED', 'Token tidak disertakan');
    return user;
  }
}
