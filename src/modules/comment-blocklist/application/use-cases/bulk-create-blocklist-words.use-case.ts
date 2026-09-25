import { BadRequestError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { CommentBlocklistRepository } from '../../domain/repositories/comment-blocklist.repository';
import {
  BLOCKLIST_BULK_MAX,
  normalizeBlocklistWords,
} from '../utils/normalize-blocklist-words';

export interface BulkCreateBlocklistResult {
  createdCount: number;
  skippedCount: number;
  invalidCount: number;
}

/**
 * Tambah banyak kata sekaligus. Kata yang sudah aktif, atau berulang
 * di batch yang sama, diabaikan - bukan 409. Dipakai input koma dan CSV.
 */
export class BulkCreateBlocklistWordsUseCase {
  constructor(
    private readonly repo: CommentBlocklistRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: {
    words: string[];
    actorId: string;
    requestId?: string | null;
  }): Promise<BulkCreateBlocklistResult> {
    if (cmd.words.length > BLOCKLIST_BULK_MAX) {
      throw new BadRequestError(
        'BLOCKLIST_BULK_TOO_LARGE',
        'Maksimal 2000 kata per permintaan',
        [{ field: 'words', message: 'Maksimal 2000 kata per permintaan' }],
      );
    }

    const normalized = normalizeBlocklistWords(cmd.words);
    if (
      normalized.words.length === 0 &&
      normalized.duplicateInBatch === 0 &&
      normalized.invalidCount === 0
    ) {
      throw new BadRequestError('BLOCKLIST_BULK_EMPTY', 'Tidak ada kata yang bisa ditambahkan', [
        { field: 'words', message: 'Isi minimal satu kata' },
      ]);
    }

    const existing =
      normalized.words.length > 0
        ? await this.repo.findActiveWordSet(normalized.words)
        : new Set<string>();
    const toInsert = normalized.words.filter((word) => !existing.has(word));
    const skippedCount =
      normalized.duplicateInBatch + (normalized.words.length - toInsert.length);

    const created =
      toInsert.length > 0
        ? await this.repo.createMany(toInsert.map((word) => ({ word, createdBy: cmd.actorId })))
        : { count: 0, firstId: null };

    if (created.count > 0 && created.firstId) {
      await this.auditRepo.record({
        userId: cmd.actorId,
        action: 'bulk_create',
        entityType: 'comment_blocklist_word',
        entityId: created.firstId,
        newData: {
          created_count: created.count,
          skipped_count: skippedCount,
          invalid_count: normalized.invalidCount,
        },
        requestId: cmd.requestId ?? null,
      });
    }

    return {
      createdCount: created.count,
      skippedCount,
      invalidCount: normalized.invalidCount,
    };
  }
}
