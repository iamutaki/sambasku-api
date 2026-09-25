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

export interface PromoteWordImageOptions {
  /** Bytes hasil sensor admin; kosong = unduh dari URL staging. */
  bytes?: Uint8Array;
  mimeType?: string | null;
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
  opts?: PromoteWordImageOptions,
): Promise<PromotedWordImage> {
  let bytes: Uint8Array;
  let mimeHint: string | null;
  if (opts?.bytes && opts.bytes.byteLength > 0) {
    bytes = opts.bytes;
    mimeHint = opts.mimeType ?? null;
  } else {
    const fetched = await fetchImageBytes(staging.url);
    bytes = fetched.bytes;
    mimeHint = fetched.mimeType;
  }

  const file = validateImageFile({ bytes, mimeType: mimeHint });
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
