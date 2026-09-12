export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: Date;
}

// Payload yang ditulis use case modul lain (Section 21).
// oldData/newData TIDAK BOLEH berisi password/token/kredensial.
export interface NewAuditLog {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  requestId?: string | null;
}

export interface AuditLogFilter {
  userId?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  /** cursor-based (Section 13): ULID id item terakhir halaman sebelumnya */
  cursor?: string;
  limit: number;
}

export interface AuditLogPage {
  items: AuditLog[];
  nextCursor: string | null;
  hasMore: boolean;
}
