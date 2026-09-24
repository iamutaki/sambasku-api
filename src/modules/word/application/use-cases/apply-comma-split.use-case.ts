import { BadRequestError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';
import { normalizeSplitParts } from '../utils/split-comma-parts';

export type ApplyCommaSplitCommand =
  | {
      kind: 'lemma';
      wordId: string;
      parts: string[];
      actorId: string;
      requestId?: string | null;
    }
  | {
      kind: 'translation';
      meaningTranslationId: string;
      parts: string[];
      actorId: string;
      requestId?: string | null;
    };

export class ApplyCommaSplitUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: ApplyCommaSplitCommand): Promise<{
    kind: 'lemma' | 'translation';
    wordId: string;
    createdWordIds?: string[];
    meaningIds?: string[];
  }> {
    const parts = normalizeSplitParts(cmd.parts);
    if (parts.length < 2) {
      throw new ValidationError([
        { field: 'parts', message: 'Minimal dua bagian setelah dipisah koma' },
      ]);
    }

    try {
      if (cmd.kind === 'lemma') {
        const result = await this.wordRepo.applyCommaSplitLemma(
          cmd.wordId,
          parts,
          cmd.actorId,
        );
        await this.auditRepo.record({
          userId: cmd.actorId,
          action: 'update',
          entityType: 'word',
          entityId: result.wordId,
          newData: {
            comma_split: 'lemma',
            parts,
            created_word_ids: result.createdWordIds,
          },
          requestId: cmd.requestId ?? null,
        });
        return {
          kind: 'lemma',
          wordId: result.wordId,
          createdWordIds: result.createdWordIds,
        };
      }

      const result = await this.wordRepo.applyCommaSplitTranslation(
        cmd.meaningTranslationId,
        parts,
        cmd.actorId,
      );
      await this.auditRepo.record({
        userId: cmd.actorId,
        action: 'update',
        entityType: 'word',
        entityId: result.wordId,
        newData: {
          comma_split: 'translation',
          parts,
          meaning_ids: result.meaningIds,
        },
        requestId: cmd.requestId ?? null,
      });
      return {
        kind: 'translation',
        wordId: result.wordId,
        meaningIds: result.meaningIds,
      };
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (
        code === 'WORD_NOT_FOUND' ||
        code === 'TRANSLATION_NOT_FOUND' ||
        code === 'MEANING_NOT_FOUND'
      ) {
        throw new NotFoundError('WORD_NOT_FOUND', 'Entri tidak ditemukan atau sudah dihapus');
      }
      if (code === 'PARTS_TOO_FEW') {
        throw new BadRequestError(
          'COMMA_SPLIT_PARTS_INVALID',
          'Minimal dua bagian setelah dipisah koma',
        );
      }
      throw err;
    }
  }
}
