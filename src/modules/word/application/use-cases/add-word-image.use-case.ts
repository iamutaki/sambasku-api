import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository, WordImageMedia } from '../../domain/repositories/word.repository';
import { resolveChildPublication } from '../utils/resolve-publication';
import type { Actor } from './create-word.use-case';

export interface AddWordImageDto {
  url: string;
  providerFileId: string;
  altText?: string | null;
  isPrimary: boolean;
}

// Kontribusi gambar contoh pada kata existing (03-api-kontribusi-verifikasi.md).
// Gambar hasil direct-upload client (upload-token) — backend hanya simpan referensi.
export class AddWordImageUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(wordId: string, dto: AddWordImageDto, actor: Actor): Promise<WordImageMedia> {
    const word = await this.wordRepo.findById(wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    const publication = resolveChildPublication(actor.role);
    const media = await this.wordRepo.addWordImage(wordId, { ...dto, ...publication }, actor.userId);

    await this.auditRepo.record({
      userId: actor.userId,
      action: 'create',
      entityType: 'word_image',
      entityId: media.id,
      newData: {
        word_id: wordId,
        url: media.url,
        provider_file_id: media.providerFileId,
        status: media.status,
        is_verified: media.isVerified,
      },
      requestId: actor.requestId ?? null,
    });

    return media;
  }
}
