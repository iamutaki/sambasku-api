import type { ImageStoragePort } from '@/modules/image/application/ports/image-storage.port';
import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';
import {
  deleteStagingWordImage,
  promoteWordImageFromStaging,
} from '@/modules/contribution/application/utils/promote-word-image-staging';
import type { ImageChange, ProposedChanges } from '../../domain/entities/word-suggestion.entity';

export interface SuggestionImageDecision {
  /** Indeks add di images[], atau provider_file_id */
  key: string;
  decision: 'approve' | 'reject';
}

export interface CensoredSuggestionFile {
  bytes: Uint8Array;
  mimeType: string | null;
}

/**
 * Siapkan gambar usulan sebelum apply approve:
 * - ImageKit + approve → promote GitHub (bytes sensor opsional)
 * - ImageKit + reject → hapus staging, buang dari changes
 * - Stock → biarkan
 */
export async function prepareProposedImagesForApprove(
  changes: ProposedChanges,
  opts: {
    publicImageStorage: PublicImageStoragePort;
    imageStorage: ImageStoragePort;
    decisions?: SuggestionImageDecision[];
    /** Key = indeks string atau provider_file_id */
    censoredFiles?: Record<string, CensoredSuggestionFile>;
  },
): Promise<ProposedChanges> {
  if (!changes.images?.length) return changes;

  const decisionByKey = new Map(
    (opts.decisions ?? []).map((d) => [d.key, d.decision] as const),
  );
  const nextImages: ImageChange[] = [];
  let addIndex = 0;

  for (const img of changes.images) {
    if (img.action !== 'add') {
      nextImages.push(img);
      continue;
    }

    const indexKey = String(addIndex);
    const fileKey = img.providerFileId ?? '';
    addIndex += 1;

    const decision =
      decisionByKey.get(indexKey) ??
      (fileKey ? decisionByKey.get(fileKey) : undefined) ??
      'approve';

    if (img.provider === 'imagekit' && img.url && img.providerFileId) {
      const staging = {
        id: indexKey,
        url: img.url,
        provider: 'imagekit',
        providerFileId: img.providerFileId,
      };

      if (decision === 'reject') {
        await deleteStagingWordImage(staging, opts.imageStorage);
        continue;
      }

      const censored =
        opts.censoredFiles?.[indexKey] ??
        (fileKey ? opts.censoredFiles?.[fileKey] : undefined);
      const promoted = await promoteWordImageFromStaging(
        staging,
        opts.publicImageStorage,
        { bytes: censored?.bytes, mimeType: censored?.mimeType },
      );
      await deleteStagingWordImage(staging, opts.imageStorage);
      nextImages.push({
        ...img,
        url: promoted.url,
        provider: promoted.provider,
        providerFileId: promoted.providerFileId,
      });
      continue;
    }

    if (decision === 'reject') {
      // Stock yang ditolak: jangan terapkan
      continue;
    }
    nextImages.push(img);
  }

  return { ...changes, images: nextImages.length ? nextImages : undefined };
}

/** Hapus staging ImageKit dari proposed_changes (saat reject usulan). */
export async function deleteProposedStagingImages(
  changes: ProposedChanges,
  imageStorage: ImageStoragePort,
): Promise<void> {
  for (const img of changes.images ?? []) {
    if (img.action !== 'add' || img.provider !== 'imagekit' || !img.providerFileId) continue;
    await deleteStagingWordImage(
      {
        id: img.providerFileId,
        url: img.url ?? '',
        provider: 'imagekit',
        providerFileId: img.providerFileId,
      },
      imageStorage,
    );
  }
}
