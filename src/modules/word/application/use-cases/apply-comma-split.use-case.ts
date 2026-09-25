import { BadRequestError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';
import type { LemmaSplitMeaningOverride } from '../../domain/repositories/word.repository';
import { normalizeSplitParts } from '../utils/split-comma-parts';

export type ApplyCommaSplitCommand =
  | {
      kind: 'lemma';
      wordId: string;
      parts: string[];
      meaningOverrides?: LemmaSplitMeaningOverride[];
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
        const overrides = cmd.meaningOverrides;
        if (overrides && overrides.length !== parts.length - 1) {
          throw new ValidationError([
            {
              field: 'meaning_overrides',
              message: 'Jumlah makna harus sama dengan jumlah kata baru',
            },
          ]);
        }
        overrides?.forEach((ov, index) => {
          if (ov.mode === 'replace' && ov.translationText.trim().length === 0) {
            throw new ValidationError([
              {
                field: `meaning_overrides.${index}.translation_text`,
                message: 'Terjemahan wajib diisi',
              },
            ]);
          }
        });

        const result = await this.wordRepo.applyCommaSplitLemma(
          cmd.wordId,
          parts,
          overrides,
          cmd.actorId,
        );
        const created = result.created.map((item) => ({
          word_id: item.wordId,
          lemma: item.lemma,
          mode: item.mode,
          translation_text: item.translationText,
          meaning_source: item.meaningSource,
        }));
        await this.auditRepo.record({
          userId: cmd.actorId,
          action: 'comma_split',
          entityType: 'word',
          entityId: result.wordId,
          oldData: {
            lemma: result.oldLemma,
            meanings: result.meanings.map((meaning) => ({
              translation_texts: meaning.translationTexts,
              definition: meaning.definition,
            })),
          },
          newData: {
            comma_split: 'lemma',
            kept_lemma: result.keptLemma,
            created,
          },
          requestId: cmd.requestId ?? null,
        });
        for (const item of created) {
          await this.auditRepo.record({
            userId: cmd.actorId,
            action: 'comma_split',
            entityType: 'word',
            entityId: item.word_id,
            newData: {
              comma_split: 'lemma',
              split_from_word_id: result.wordId,
              lemma: item.lemma,
              mode: item.mode,
              translation_text: item.translation_text,
              meaning_source: item.meaning_source,
            },
            requestId: cmd.requestId ?? null,
          });
        }
        return {
          kind: 'lemma',
          wordId: result.wordId,
          createdWordIds: result.created.map((item) => item.wordId),
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
      if (code === 'OVERRIDE_COUNT_MISMATCH') {
        throw new ValidationError([
          {
            field: 'meaning_overrides',
            message: 'Jumlah makna harus sama dengan jumlah kata baru',
          },
        ]);
      }
      if (code === 'REPLACE_TRANSLATION_REQUIRED') {
        throw new ValidationError([
          { field: 'meaning_overrides', message: 'Terjemahan wajib diisi' },
        ]);
      }
      if (code === 'INDONESIAN_LANGUAGE_NOT_FOUND') {
        throw new BadRequestError(
          'INDONESIAN_LANGUAGE_NOT_FOUND',
          'Bahasa Indonesia belum tersedia. Tidak bisa mengganti makna.',
        );
      }
      throw err;
    }
  }
}
