import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository } from '../../domain/repositories/word.repository';
import type { MeaningMedia } from '../../domain/entities/meaning.entity';
import { resolveChildPublication } from '../utils/resolve-publication';
import { assertCanContribute } from '../utils/assert-can-contribute';
import type { Actor } from './create-word.use-case';

export interface AddMeaningDto {
  wordClassId?: string | null;
  definition: string;
  translations: { languageId: string; translationText: string; translationType: string }[];
}

// Kontribusi definisi (makna) pada kata existing (17-api-usul-definisi.md).
// Dipakai jalur "Bantu definisi" untuk kata placeholder (is_have_definition
// = false). Login non-verifikator → published, belum dicek.
export class AddMeaningUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(wordId: string, dto: AddMeaningDto, actor: Actor): Promise<MeaningMedia> {
    await assertCanContribute(actor.userId);
    const word = await this.wordRepo.findById(wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    const publication = resolveChildPublication(actor.role);
    const meaning = await this.wordRepo.addMeaning(wordId, { ...dto, ...publication }, actor.userId);

    await this.auditRepo.record({
      userId: actor.userId,
      action: 'create',
      entityType: 'meaning',
      entityId: meaning.id,
      newData: {
        word_id: wordId,
        definition: meaning.definition,
        status: meaning.status,
        is_verified: meaning.isVerified,
      },
      requestId: actor.requestId ?? null,
    });

    return meaning;
  }
}
