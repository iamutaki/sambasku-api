import type { Context } from 'hono';
import type { ListAuditLogsUseCase } from '../../application/use-cases/list-audit-logs.use-case';
import type { ListAuditLogsQuery } from './validators/audit-log.validator';

export class AuditController {
  constructor(private readonly deps: { listAuditLogs: ListAuditLogsUseCase }) {}

  async list(c: Context, query: ListAuditLogsQuery) {
    const { items, meta } = await this.deps.listAuditLogs.execute({
      userId: query.user_id,
      entityType: query.entity_type,
      entityId: query.entity_id,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      cursor: query.cursor,
    });

    return c.json({
      success: true as const,
      data: items.map((log) => ({
        id: log.id,
        user_id: log.userId,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        old_data: log.oldData,
        new_data: log.newData,
        request_id: log.requestId,
        created_at: log.createdAt.toISOString(),
      })),
      meta,
    });
  }
}
