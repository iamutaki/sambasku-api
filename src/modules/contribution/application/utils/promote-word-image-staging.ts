import { ValidationError } from '@/shared/errors/app-error';
import type { ImageStoragePort } from '@/modules/image/application/ports/image-storage.port';
import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';
import { buildWordImagePath } from '@/modules/public-image/application/utils/public-image-path';
import { validateImageFile } from '@/modules/public-image/application/utils/validate-image-file';

export interface StagingWordImage {
  id: string;
  url: string;
  provider: string;
  providerFileId: string;
}

export interface PromotedWordImage {
  url: string;
  provider: 'github';
  providerFileId: string;
  sha: string;
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

/** ImageKit staging → GitHub publik (pola approve translation-help). */
export async function promoteWordImageFromStaging(
  staging: StagingWordImage,
  publicImageStorage: PublicImageStoragePort,
): Promise<PromotedWordImage> {
  const fetched = await fetchImageBytes(staging.url);
  const file = validateImageFile({ bytes: fetched.bytes, mimeType: fetched.mimeType });
  const path = buildWordImagePath(file.mimeType);
  const uploaded = await publicImageStorage.upload({
    path,
    content: file.bytes,
    mimeType: file.mimeType,
  });
  return {
    url: uploaded.url,
    provider: 'github',
    providerFileId: uploaded.path,
    sha: uploaded.sha,
  };
}

/** Hapus file ImageKit best-effort (sudah di-log di implementasi port). */
export async function deleteStagingWordImage(
  staging: StagingWordImage,
  imageStorage: ImageStoragePort,
): Promise<void> {
  if (staging.provider !== 'imagekit') return;
  await imageStorage.deleteFile(staging.providerFileId);
}
