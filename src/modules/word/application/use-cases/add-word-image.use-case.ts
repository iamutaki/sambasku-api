import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { WordRepository, WordImageMedia } from '../../domain/repositories/word.repository';
import { resolveWordImageProvider } from '../../domain/word-image-provider';
import { resolveChildPublication } from '../utils/resolve-publication';
import { assertCanContribute } from '../utils/assert-can-contribute';
import type { Actor } from './create-word.use-case';

export interface AddWordImageDto {
  url: string;
  /** Stock Media Explorer; absen/github → storage aktif */
  provider?: string;
  providerFileId: string;
  sha?: string | null;
  altText?: string | null;
  isPrimary: boolean;
}

// Kontribusi gambar contoh pada kata existing (03-api-kontribusi-verifikasi.md).
// Upload GitHub ATAU referensi URL stock dari Media Explorer.
export class AddWordImageUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly imageProviderName: string,
  ) {}

  async execute(wordId: string, dto: AddWordImageDto, actor: Actor): Promise<WordImageMedia> {
    await assertCanContribute(actor.userId);
    const word = await this.wordRepo.findById(wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    const publication = resolveChildPublication(actor.role);
    const provider = resolveWordImageProvider(dto.provider, this.imageProviderName);
    const media = await this.wordRepo.addWordImage(
      wordId,
      { ...dto, provider, ...publication },
      actor.userId,
    );

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
