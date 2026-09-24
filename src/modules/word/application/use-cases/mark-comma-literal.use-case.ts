import { NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';

export type MarkCommaLiteralCommand =
  | {
      kind: 'lemma';
      wordId: string;
      actorId: string;
      requestId?: string | null;
    }
  | {
      kind: 'translation';
      meaningTranslationId: string;
      actorId: string;
      requestId?: string | null;
    };

export class MarkCommaLiteralUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(cmd: MarkCommaLiteralCommand): Promise<{ kind: 'lemma' | 'translation'; id: string }> {
    if (cmd.kind === 'lemma') {
      const ok = await this.wordRepo.markLemmaAllowsComma(cmd.wordId, cmd.actorId);
      if (!ok) {
        throw new NotFoundError('WORD_NOT_FOUND', 'Kata tidak ditemukan atau sudah dihapus');
      }
      await this.auditRepo.record({
        userId: cmd.actorId,
        action: 'update',
        entityType: 'word',
        entityId: cmd.wordId,
        newData: { lemma_allows_comma: true },
        requestId: cmd.requestId ?? null,
      });
      return { kind: 'lemma', id: cmd.wordId };
    }

    if (!cmd.meaningTranslationId) {
      throw new ValidationError([
        { field: 'meaning_translation_id', message: 'ID padanan wajib diisi' },
      ]);
    }

    const ok = await this.wordRepo.markTranslationAllowsComma(
      cmd.meaningTranslationId,
      cmd.actorId,
    );
    if (!ok) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Padanan tidak ditemukan atau sudah dihapus');
    }
    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'word',
      entityId: cmd.meaningTranslationId,
      newData: { translation_allows_comma: true },
      requestId: cmd.requestId ?? null,
    });
    return { kind: 'translation', id: cmd.meaningTranslationId };
  }
}
