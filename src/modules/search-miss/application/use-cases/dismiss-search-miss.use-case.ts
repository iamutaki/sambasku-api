import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { SearchMissRepository } from '../../domain/repositories/search-miss.repository';

export interface DismissSearchMissCommand {
  missId: string;
  actorId: string;
  requestId?: string | null;
}

// Admin menyingkirkan miss dari panel/beranda (spam, istilah tidak layak).
// Soft delete - jejak tetap ada (Section 7).
export class DismissSearchMissUseCase {
  constructor(
    private readonly searchMissRepo: SearchMissRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: DismissSearchMissCommand): Promise<void> {
    const ok = await this.searchMissRepo.dismiss(cmd.missId, cmd.actorId);
    if (!ok) {
      throw new NotFoundError('SEARCH_MISS_NOT_FOUND', 'Pencarian kosong dengan id tersebut tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'delete',
      entityType: 'search_miss',
      entityId: cmd.missId,
      newData: { dismissed: true },
      requestId: cmd.requestId ?? null,
    });
  }
}
