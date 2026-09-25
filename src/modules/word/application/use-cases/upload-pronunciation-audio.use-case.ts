import { NotFoundError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { PronunciationStoragePort } from '../ports/pronunciation-storage.port';
import type { WordAudioMedia, WordRepository } from '../../domain/repositories/word.repository';
import { buildPronunciationAudioPath } from '../utils/pronunciation-audio-path';
import {
  clampDurationMs,
  validateAudioFile,
} from '../utils/validate-audio-file';
import { resolveChildPublication } from '../utils/resolve-publication';
import { assertCanContribute } from '../utils/assert-can-contribute';
import type { Actor } from './create-word.use-case';

export interface UploadPronunciationAudioDto {
  bytes: Uint8Array;
  mimeType: string | null | undefined;
  filename?: string | null;
  dialectId?: string | null;
  exampleId?: string | null;
  speakerName?: string | null;
  durationMs?: unknown;
}

/**
 * Upload audio pelafalan (multi) - satu langkah: storage + insert word_audios.
 * exampleId opsional → pelafalan kalimat contoh (harus milik wordId).
 */
export class UploadPronunciationAudioUseCase {
  constructor(
    private readonly wordRepo: WordRepository,
    private readonly storage: PronunciationStoragePort,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  async execute(
    wordId: string,
    dto: UploadPronunciationAudioDto,
    actor: Actor,
  ): Promise<WordAudioMedia> {
    await assertCanContribute(actor.userId);
    const word = await this.wordRepo.findById(wordId);
    if (!word) {
      throw new NotFoundError('WORD_NOT_FOUND', 'Kata dengan id tersebut tidak ditemukan');
    }

    let exampleId: string | null = dto.exampleId?.trim() || null;
    if (exampleId) {
      const ex = await this.wordRepo.findExampleWithWord(exampleId);
      if (!ex || ex.wordId !== wordId) {
        throw new NotFoundError(
          'EXAMPLE_NOT_FOUND',
          'Contoh kalimat tidak ditemukan pada kata ini',
        );
      }
    }

    let dialectCode: string | null = null;
    const dialectId = dto.dialectId?.trim() || null;
    if (dialectId) {
      dialectCode = await this.wordRepo.findDialectCode(dialectId);
      if (!dialectCode) {
        throw new NotFoundError('DIALECT_NOT_FOUND', 'Dialek tidak ditemukan');
      }
    }

    const file = validateAudioFile({
      bytes: dto.bytes,
      mimeType: dto.mimeType,
      filename: dto.filename,
    });
    const durationMs = clampDurationMs(dto.durationMs);
    const speakerName = dto.speakerName?.trim() || null;

    const path = buildPronunciationAudioPath({
      dialectCode,
      lemma: word.lemma,
      mimeType: file.mimeType,
    });

    const uploaded = await this.storage.upload({
      path,
      content: file.bytes,
      mimeType: file.mimeType,
    });

    const existingCount = await this.wordRepo.countWordAudios(wordId, exampleId);
    const publication = resolveChildPublication(actor.role);

    const media = await this.wordRepo.addWordAudio(
      wordId,
      {
        exampleId,
        dialectId,
        provider: this.storage.providerName,
        providerFileId: uploaded.path,
        sha: uploaded.sha,
        url: uploaded.url,
        mimeType: file.mimeType,
        fileSize: uploaded.size,
        durationMs,
        speakerName,
        isPrimary: existingCount === 0,
        ...publication,
      },
      actor.userId,
    );

    await this.auditRepo.record({
      userId: actor.userId,
      action: 'create',
      entityType: 'word_audio',
      entityId: media.id,
      newData: {
        word_id: wordId,
        example_id: exampleId,
        url: media.url,
        is_primary: media.isPrimary,
        status: media.status,
      },
      requestId: actor.requestId ?? null,
    });

    return media;
  }
}
