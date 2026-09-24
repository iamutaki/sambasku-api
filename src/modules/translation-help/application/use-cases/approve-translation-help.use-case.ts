import { NotFoundError, ValidationError } from '@/shared/errors/app-error';
import type { AuditLogRepository } from '@/modules/audit/domain/repositories/audit-log.repository';
import type { ImageStoragePort } from '@/modules/image/application/ports/image-storage.port';
import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';
import { buildTranslationHelpImagePath } from '@/modules/public-image/application/utils/public-image-path';
import { validateImageFile } from '@/modules/public-image/application/utils/validate-image-file';
import type { RecordInboxNotificationUseCase } from '@/modules/notification/application/use-cases/record-inbox-notification.use-case';
import type {
  TranslationHelp,
  TranslationHelpImage,
} from '../../domain/entities/translation-help.entity';
import type { TranslationHelpRepository } from '../../domain/repositories/translation-help.repository';

export interface ApproveTranslationHelpCommand {
  id: string;
  actorId: string;
  /** Bytes tersensor per indeks gambar (opsional). Jika kosong, fetch dari ImageKit. */
  censoredFiles?: Uint8Array[];
  /** MIME per file (sejajar censoredFiles); fallback deteksi magic. */
  censoredMimeTypes?: (string | null)[];
  requestId?: string | null;
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string | null }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new ValidationError([
      { field: 'images', message: 'Gagal mengunduh gambar staging untuk dipromosikan' },
    ]);
  }
  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    mimeType: res.headers.get('content-type'),
  };
}

export class ApproveTranslationHelpUseCase {
  constructor(
    private readonly repo: TranslationHelpRepository,
    private readonly publicImageStorage: PublicImageStoragePort,
    private readonly imageStorage: ImageStoragePort,
    private readonly auditRepo: AuditLogRepository,
    private readonly inbox?: RecordInboxNotificationUseCase,
  ) {}

  async execute(cmd: ApproveTranslationHelpCommand): Promise<TranslationHelp> {
    const existing = await this.repo.findById(cmd.id);
    if (!existing || existing.status !== 'pending_review') {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    let nextImages: TranslationHelpImage[] = existing.images;

    if (existing.images.length > 0) {
      const promoted: TranslationHelpImage[] = [];
      for (let i = 0; i < existing.images.length; i++) {
        const staging = existing.images[i];
        const provided = cmd.censoredFiles?.[i];
        let bytes: Uint8Array;
        let mimeHint: string | null;

        if (provided && provided.byteLength > 0) {
          bytes = provided;
          mimeHint = cmd.censoredMimeTypes?.[i] ?? null;
        } else {
          const fetched = await fetchImageBytes(staging.url);
          bytes = fetched.bytes;
          mimeHint = fetched.mimeType;
        }

        const file = validateImageFile({ bytes, mimeType: mimeHint });
        const path = buildTranslationHelpImagePath(file.mimeType);
        const uploaded = await this.publicImageStorage.upload({
          path,
          content: file.bytes,
          mimeType: file.mimeType,
        });

        promoted.push({
          url: staging.url,
          providerFileId: staging.providerFileId,
          publicUrl: uploaded.url,
        });
      }
      nextImages = promoted;

      for (const img of existing.images) {
        // deleteFile ImageKit sudah best-effort (log internal, tidak lempar)
        await this.imageStorage.deleteFile(img.providerFileId);
      }
    }

    const updated = await this.repo.updateStatus({
      id: existing.id,
      fromStatus: 'pending_review',
      toStatus: 'published',
      actorId: cmd.actorId,
      images: nextImages,
      rejectionNote: null,
    });
    if (!updated) {
      throw new NotFoundError('TRANSLATION_HELP_NOT_FOUND', 'Bantuan terjemahan tidak ditemukan');
    }

    await this.auditRepo.record({
      userId: cmd.actorId,
      action: 'update',
      entityType: 'translation_help',
      entityId: updated.id,
      oldData: { status: existing.status },
      newData: {
        status: updated.status,
        image_count: nextImages.length,
        promoted: nextImages.some((i) => i.publicUrl != null),
      },
      requestId: cmd.requestId ?? null,
    });

    await this.inbox?.execute({
      userId: existing.userId,
      type: 'translation_help_approved',
      targetKind: 'translation_help',
      targetId: updated.id,
    });

    return updated;
  }
}
