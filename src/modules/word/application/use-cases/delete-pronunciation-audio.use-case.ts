import { ForbiddenError, NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { PronunciationStoragePort } from '../ports/pronunciation-storage.port';
import type { WordRepository } from '../../domain/repositories/word.repository';
import type { Actor } from './create-word.use-case';

const DELETE_ROLES = new Set(['admin', 'editor', 'root']);

/**
 * Soft-delete baris word_audios + best-effort hapus file di storage.
 */
export class DeletePronunciationAudioUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly storage: PronunciationStoragePort,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(wordId: string, audioId: string, actor: Actor): Promise<void> {
    if (!DELETE_ROLES.has(actor.role)) {
      throw new ForbiddenError('FORBIDDEN', 'Hanya admin/editor yang boleh menghapus audio');
    }

    const word = await this.wordRepo.findById(wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    const media = await this.wordRepo.softDeleteWordAudio(wordId, audioId);
    if (!media) {
      throw new NotFoundError('WORD_AUDIO_NOT_FOUND', 'Audio pelafalan tidak ditemukan');
    }

    if (media.sha) {
      await this.storage.delete(media.providerFileId, media.sha);
    }

    await this.auditRepo.record({
      userId: actor.userId,
      action: 'delete',
      entityType: 'word_audio',
      entityId: media.id,
      oldData: {
        word_id: wordId,
        url: media.url,
        provider_file_id: media.providerFileId,
      },
      requestId: actor.requestId ?? null,
    });
  }
}
