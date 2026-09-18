import type { DashboardStats } from '../entities/dashboard-stats.entity';

// Kontrak repository agregasi dashboard - implementasi Drizzle mengecek
// beberapa tabel (words, contributions, users, audit_logs) dalam satu panggilan.
export interface DashboardRepository {
  getStats(): Promise<DashboardStats>;
}