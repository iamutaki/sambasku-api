import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import { normalizeSearchMissTerm } from '../../domain/normalize-term';
import type { SearchMiss } from '../../domain/entities/search-miss.entity';
import type { SearchMissRepository } from '../../domain/repositories/search-miss.repository';

export interface UpdateSearchMissCommand {
  missId: string;
  actorId: string;
  term?: string;
  isVisible?: boolean;
  requestId?: string | null;
}

// Koreksi typing user + gate tayang beranda (14-api-search-miss-moderation.md).
export class UpdateSearchMissUseCase {
  constructor(
    private readonly searchMissRepo: SearchMissRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: UpdateSearchMissCommand): Promise<SearchMiss> {
    const hasTerm = cmd.term !== undefined;
    const hasVisible = cmd.isVisible !== undefined;
    if (!hasTerm && !hasVisible) {
      throw new ValidationError([
        { field: '', message: 'Minimal satu field: term atau is_visible' },
      ]);
    }

    let normalizedTerm: string | undefined;
    if (hasTerm) {
      normalizedTerm = normalizeSearchMissTerm(cmd.term!);
      if (!normalizedTerm) {
        throw new ValidationError([{ field: 'term', message: 'Term tidak boleh kosong' }]);
      }
    }

    const existing = await this.searchMissRepo.findById(cmd.missId);
    if (!existing) {
      throw new NotFoundError('SEARCH_MISS_NOT_FOUND', 'Pencarian kosong dengan id tersebut tidak ditemukan');
    }

    // No-op singkat: term sama + visible sama → return existing
    const termUnchanged = !hasTerm || normalizedTerm === existing.term;
    const visibleUnchanged = !hasVisible || cmd.isVisible === existing.isVisible;
    if (termUnchanged && visibleUnchanged) {
      return existing;
    }

    let updated: SearchMiss | null;
    try {
      updated = await this.searchMissRepo.update(cmd.missId, {
        term: hasTerm && !termUnchanged ? normalizedTerm : undefined,
        isVisible: hasVisible && !visibleUnchanged ? cmd.isVisible : undefined,
      });
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      throw err;
    }

    if (!updated) {
      throw new NotFoundError('SEARCH_MISS_NOT_FOUND', 'Pencarian kosong dengan id tersebut tidak ditemukan');
    }

    const oldData: Record<string, unknown> = {};
    const newData: Record<string, unknown> = {};
    if (hasTerm && !termUnchanged) {
      oldData.term = existing.term;
      newData.term = updated.term;
    }
    if (hasVisible && !visibleUnchanged) {
      oldData.is_visible = existing.isVisible;
      newData.is_visible = updated.isVisible;
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'search_miss',
      entityId: cmd.missId,
      oldData,
      newData,
      requestId: cmd.requestId ?? null,
    });

    return updated;
  }
}
