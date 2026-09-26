import { BadRequestError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { SearchMissRepository } from '../../domain/repositories/search-miss.repository';

/** Batas aman batch dari checkbox tabel (selaras WORDS_BULK_MAX). */
export const SEARCH_MISS_BULK_DISMISS_MAX = 50;

export type BulkDismissSearchMissItemSuccess = {
  id: string;
  ok: true;
};

export type BulkDismissSearchMissItemFailure = {
  id: string;
  ok: false;
  error_code: string;
  message: string;
};

export type BulkDismissSearchMissItemResult =
  | BulkDismissSearchMissItemSuccess
  | BulkDismissSearchMissItemFailure;

export type BulkDismissSearchMissResult = {
  succeeded: number;
  failed: number;
  results: BulkDismissSearchMissItemResult[];
};

export interface BulkDismissSearchMissCommand {
  ids: string[];
  actorId: string;
  requestId?: string | null;
}

/**
 * Soft-delete massal search-miss dari panel admin (checkbox baris termuat).
 * Satu query IN + audit per id yang berhasil. Partial success per-id.
 */
export class BulkDismissSearchMissUseCase {
  constructor(
    private readonly searchMissRepo: SearchMissRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: BulkDismissSearchMissCommand): Promise<BulkDismissSearchMissResult> {
    if (cmd.ids.length === 0) {
      throw new BadRequestError('SEARCH_MISS_BULK_EMPTY', 'Pilih minimal satu pencarian', [
        { field: 'ids', message: 'Pilih minimal satu pencarian' },
      ]);
    }
    if (cmd.ids.length > SEARCH_MISS_BULK_DISMISS_MAX) {
      throw new BadRequestError(
        'SEARCH_MISS_BULK_TOO_LARGE',
        `Maksimal ${SEARCH_MISS_BULK_DISMISS_MAX} pencarian per permintaan`,
        [
          {
            field: 'ids',
            message: `Maksimal ${SEARCH_MISS_BULK_DISMISS_MAX} pencarian per permintaan`,
          },
        ],
      );
    }

    const seen = new Set<string>();
    const uniqueIds: string[] = [];
    for (const id of cmd.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      uniqueIds.push(id);
    }

    const dismissed = new Set(await this.searchMissRepo.dismissMany(uniqueIds, cmd.actorId));

    const results: BulkDismissSearchMissItemResult[] = [];
    for (const id of uniqueIds) {
      if (dismissed.has(id)) {
        await this.auditRepo.record({
          userId: cmd.actorId,
          action: 'delete',
          entityType: 'search_miss',
          entityId: id,
          newData: { dismissed: true },
          requestId: cmd.requestId ?? null,
        });
        results.push({ id, ok: true });
      } else {
        results.push({
          id,
          ok: false,
          error_code: 'SEARCH_MISS_NOT_FOUND',
          message: 'Pencarian kosong dengan id tersebut tidak ditemukan',
        });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    return {
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  }
}
