import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository, PronunciationMedia } from '../../domain/repositories/word.repository';
import { resolveChildPublication } from '../utils/resolve-publication';
import { assertCanContribute } from '../utils/assert-can-contribute';
import type { Actor } from './create-word.use-case';

export interface AddPronunciationDto {
  dialectId?: string | null;
  notation: string;
  value: string;
  audioUrl?: string | null;
  speakerName?: string | null;
  notes?: string | null;
}

// Kontribusi pelafalan pada kata existing.
// Login non-verifikator → published, belum dicek; verifikator → published+verified.
export class AddPronunciationUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(wordId: string, dto: AddPronunciationDto, actor: Actor): Promise<PronunciationMedia> {
    await assertCanContribute(actor.userId);
    const word = await this.wordRepo.findById(wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    const publication = resolveChildPublication(actor.role);
    const media = await this.wordRepo.addPronunciation(wordId, { ...dto, ...publication }, actor.userId);

    await this.auditRepo.record({
      userId: actor.userId,
      action: 'create',
      entityType: 'pronunciation',
      entityId: media.id,
      newData: {
        word_id: wordId,
        notation: media.notation,
        value: media.value,
        status: media.status,
        is_verified: media.isVerified,
      },
      requestId: actor.requestId ?? null,
    });

    return media;
  }
}
