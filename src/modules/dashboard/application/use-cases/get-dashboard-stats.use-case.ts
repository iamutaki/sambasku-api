import type { DashboardStats } from '../../domain/entities/dashboard-stats.entity';
import type { DashboardRepository } from '../../domain/repositories/dashboard.repository';

// Dashboard admin (Section X): agregasi ringan per-request, tanpa cache -
// volume kecil & data harus segar. Kalau nanti dashboard berat, pindah ke
// materialized/night job, BUKAN cache di aplikasi.
export class GetDashboardStatsUseCase {
  constructor(private readonly dashboardRepo: DashboardRepository) {}

  async execute(): Promise<DashboardStats> {
    return this.dashboardRepo.getStats();
  }
}