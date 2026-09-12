import type { AuditLogFilter, AuditLogPage, NewAuditLog } from '../entities/audit-log.entity';

// Interface lintas modul (base-stack.md Section 21): di-inject ke use case
// modul lain (auth, word, dst) untuk mencatat setiap mutasi data.
export interface AuditLogRepository {
  /**
   * Best-effort: implementasi TIDAK boleh melempar error ke caller —
   * kegagalan insert hanya di-log. Request user tidak ikut gagal.
   */
  record(entry: NewAuditLog): Promise<void>;
  list(filter: AuditLogFilter): Promise<AuditLogPage>;
}
