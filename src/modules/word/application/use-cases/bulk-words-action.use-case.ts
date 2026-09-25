import { AppError, BadRequestError, ForbiddenError } from '@/shared/errors/app-error';
import type { PublishWordUseCase } from './publish-word.use-case';
import type { SoftDeleteWordUseCase } from './soft-delete-word.use-case';

/** Batas aman untuk batch dari checkbox tabel (cursor load). Publish bisa merge. */
export const WORDS_BULK_MAX = 50;

export type BulkWordsAction = 'delete' | 'publish' | 'unpublish';

export type BulkWordsItemSuccess = {
  id: string;
  ok: true;
  /** Hanya relevan untuk action publish (merge lemma twin). */
  merged_into_word_id: string | null;
};

export type BulkWordsItemFailure = {
  id: string;
  ok: false;
  error_code: string;
  message: string;
};

export type BulkWordsItemResult = BulkWordsItemSuccess | BulkWordsItemFailure;

export type BulkWordsActionResult = {
  action: BulkWordsAction;
  succeeded: number;
  failed: number;
  results: BulkWordsItemResult[];
};

const PUBLISH_ROLES = new Set(['admin', 'root', 'reviewer']);

/**
 * Mass-action kata dari panel admin (checkbox baris termuat).
 * Delegasi ke SoftDelete / Publish agar merge, audit, dan aturan
 * taken_down sama dengan aksi tunggal. Partial success per-id.
 */
export class BulkWordsActionUseCase {
  constructor(
    private readonly deleteWord: SoftDeleteWordUseCase,
    private readonly publishWord: PublishWordUseCase,
  ) {}

  async execute(cmd: {
    action: BulkWordsAction;
    ids: string[];
    actorId: string;
    actorRole: string;
    requestId?: string | null;
  }): Promise<BulkWordsActionResult> {
    if (cmd.ids.length === 0) {
      throw new BadRequestError('WORDS_BULK_EMPTY', 'Pilih minimal satu kata', [
        { field: 'ids', message: 'Pilih minimal satu kata' },
      ]);
    }
    if (cmd.ids.length > WORDS_BULK_MAX) {
      throw new BadRequestError(
        'WORDS_BULK_TOO_LARGE',
        `Maksimal ${WORDS_BULK_MAX} kata per permintaan`,
        [{ field: 'ids', message: `Maksimal ${WORDS_BULK_MAX} kata per permintaan` }],
      );
    }

    if (
      (cmd.action === 'publish' || cmd.action === 'unpublish') &&
      !PUBLISH_ROLES.has(cmd.actorRole)
    ) {
      throw new ForbiddenError(
        'FORBIDDEN',
        'Hanya verifikator (admin/root/reviewer) yang boleh mengubah status tayang',
      );
    }

    // Pertahankan urutan pertama kali muncul; buang duplikat di body.
    const seen = new Set<string>();
    const uniqueIds: string[] = [];
    for (const id of cmd.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      uniqueIds.push(id);
    }

    const results: BulkWordsItemResult[] = [];
    for (const id of uniqueIds) {
      results.push(await this.runOne(cmd.action, id, cmd.actorId, cmd.requestId));
    }

    const succeeded = results.filter((r) => r.ok).length;
    return {
      action: cmd.action,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  }

  private async runOne(
    action: BulkWordsAction,
    id: string,
    actorId: string,
    requestId?: string | null,
  ): Promise<BulkWordsItemResult> {
    try {
      if (action === 'delete') {
        await this.deleteWord.execute({ wordId: id, actorId, requestId });
        return { id, ok: true, merged_into_word_id: null };
      }
      const published = action === 'publish';
      const result = await this.publishWord.execute({
        wordId: id,
        published,
        actorId,
        requestId,
      });
      return {
        id,
        ok: true,
        merged_into_word_id: result.mergedIntoWordId,
      };
    } catch (err) {
      if (err instanceof AppError) {
        return { id, ok: false, error_code: err.errorCode, message: err.message };
      }
      throw err;
    }
  }
}
