export type WordStatusKey = 'draft' | 'pending_review' | 'published' | 'rejected';
export type ContributionStatusKey = 'pending' | 'approved' | 'rejected' | 'corrected';
export type AppRoleKey = 'root' | 'admin' | 'editor' | 'reviewer' | 'contributor';

// Statistik agregat halaman dashboard admin (GET /api/v1/admin/dashboard/stats).
// Semua angka kata/contributions sudah meng-exclude yang soft-deleted.
export interface DashboardStats {
  words: {
    /** jumlah entri belum soft-deleted (semua status) */
    total: number;
    /** belum soft-deleted + is_verified */
    verified: number;
    /** soft-deleted */
    deleted: number;
    byStatus: Record<WordStatusKey, number>;
  };
  contributions: {
    /** belum soft-deleted (semua status) */
    total: number;
    byStatus: Record<ContributionStatusKey, number>;
  };
  users: {
    /** belum soft-deleted + is_active */
    active: number;
    byRole: Record<AppRoleKey, number>;
  };
  activity: {
    /** jumlah baris audit log 7 hari terakhir (indikator aktivitas mutasi) */
    auditLogsLast7Days: number;
  };
}