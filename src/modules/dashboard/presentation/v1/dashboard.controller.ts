import type { Context } from 'hono';
import type { GetDashboardStatsUseCase } from '../../application/use-cases/get-dashboard-stats.use-case';
import type { DashboardStats } from '../../domain/entities/dashboard-stats.entity';

export class DashboardController {
  constructor(private readonly deps: { getStats: GetDashboardStatsUseCase }) {}

  async stats(c: Context) {
    const stats = await this.deps.getStats.execute();
    // Controller = boundary HTTP: map entitas (camelCase) → kontrak wire
    // (snake_case, mengikuti konvensi semua endpoint admin).
    return c.json({ success: true as const, data: toWireStats(stats) });
  }
}

export type DashboardStatsWire = ReturnType<typeof toWireStats>;

function toWireStats(stats: DashboardStats) {
  return {
    words: {
      total: stats.words.total,
      verified: stats.words.verified,
      deleted: stats.words.deleted,
      by_status: stats.words.byStatus,
    },
    contributions: {
      total: stats.contributions.total,
      by_status: stats.contributions.byStatus,
    },
    users: {
      active: stats.users.active,
      by_role: stats.users.byRole,
    },
    activity: {
      audit_logs_last_7_days: stats.activity.auditLogsLast7Days,
    },
  };
}