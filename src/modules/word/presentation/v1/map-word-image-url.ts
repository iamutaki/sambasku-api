import { PENDING_WORD_IMAGE_PLACEHOLDER_URL } from '@/shared/constants/pending-word-image';

export interface WordImageUrlFields {
  url: string;
  provider?: string | null;
  isVerified?: boolean | null;
  providerFileId?: string | null;
}

/**
 * Wire publik: staging ImageKit yang belum diverifikasi → placeholder.
 * Admin / antrean review memanggil dengan redact=false.
 */
export function mapPublicWordImageUrl(
  img: WordImageUrlFields,
  opts: { redactStaging: boolean },
): { url: string; providerFileId: string } {
  const staging =
    opts.redactStaging &&
    img.provider === 'imagekit' &&
    img.isVerified !== true;

  if (!staging) {
    return { url: img.url, providerFileId: img.providerFileId ?? '' };
  }

  return {
    url: PENDING_WORD_IMAGE_PLACEHOLDER_URL,
    // Jangan bocorkan file id ImageKit ke klien publik
    providerFileId: '',
  };
}
