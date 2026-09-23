import { describe, it, expect, vi } from 'vitest';
import { GetDashboardStatsUseCase } from '../../application/use-cases/get-dashboard-stats.use-case';
import type { DashboardRepository } from '../../domain/repositories/dashboard.repository';
import type { DashboardStats } from '../../domain/entities/dashboard-stats.entity';

const EMPTY_STATS: DashboardStats = {
  words: { total: 0, verified: 0, deleted: 0, byStatus: { draft: 0, pending_review: 0, published: 0, rejected: 0 } },
  contributions: { total: 0, byStatus: { pending: 0, approved: 0, rejected: 0, corrected: 0 } },
  users: { active: 0, byRole: { root: 0, admin: 0, editor: 0, reviewer: 0, contributor: 0 } },
  activity: { auditLogsLast7Days: 0 },
};

describe('GetDashboardStatsUseCase', () => {
  it('meneruskan hasil agregasi repository tanpa modifikasi', async () => {
    const sample: DashboardStats = {
      words: { total: 10, verified: 8, deleted: 2, byStatus: { draft: 1, pending_review: 2, published: 6, rejected: 1 } },
      contributions: { total: 5, byStatus: { pending: 3, approved: 1, rejected: 1, corrected: 0 } },
      users: { active: 5, byRole: { root: 1, admin: 1, editor: 1, reviewer: 1, contributor: 1 } },
      activity: { auditLogsLast7Days: 15 },
    };
    const repo = { getStats: vi.fn().mockResolvedValue(sample) } as unknown as DashboardRepository;
    const useCase = new GetDashboardStatsUseCase(repo);
    await expect(useCase.execute()).resolves.toEqual(sample);
    expect(repo.getStats).toHaveBeenCalledTimes(1);
  });

  it('dataset kosong → semua angka 0 (default record terisi)', async () => {
    const repo = { getStats: vi.fn().mockResolvedValue(EMPTY_STATS) } as unknown as DashboardRepository;
    const useCase = new GetDashboardStatsUseCase(repo);
    const stats = await useCase.execute();
    expect(stats.words.total).toBe(0);
    expect(stats.contributions.byStatus.pending).toBe(0);
    expect(stats.users.active).toBe(0);
    expect(stats.activity.auditLogsLast7Days).toBe(0);
  });
});