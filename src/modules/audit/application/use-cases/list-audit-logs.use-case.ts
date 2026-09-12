import type { AuditLog, AuditLogFilter } from '../../domain/entities/audit-log.entity';
import type { AuditLogRepository } from '../../domain/repositories/audit-log.repository';

export interface ListAuditLogsResult {
  items: AuditLog[];
  meta: { limit: number; next_cursor: string | null; has_more: boolean };
}

// Auditor: role admin & root — dicek di route, bukan di use case.
// Pagination cursor-based (base-stack.md Section 13).
export class ListAuditLogsUseCase {
  constructor(private readonly auditRepo: AuditLogRepository) {}

  async execute(filter: AuditLogFilter): Promise<ListAuditLogsResult> {
    const { items, nextCursor, hasMore } = await this.auditRepo.list(filter);
    return {
      items,
      meta: { limit: filter.limit, next_cursor: nextCursor, has_more: hasMore },
    };
  }
}
