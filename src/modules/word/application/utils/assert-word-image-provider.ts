import { ValidationError } from '@/shared/errors/app-error';
import {
  isStockWordImageProvider,
  wordImageIsAutoVerified,
} from '../../domain/word-image-provider';
import { isVerifierRole } from '../utils/resolve-publication';

/**
 * Kontributor non-verifikator: wajib ImageKit staging ATAU stock.
 * Tidak boleh menyisipkan URL GitHub/jsDelivr langsung (bypass gate).
 */
export function assertContributorWordImageProvider(
  provider: string,
  role: string,
): void {
  if (isVerifierRole(role)) return;
  if (provider === 'imagekit' || isStockWordImageProvider(provider)) return;
  throw new ValidationError([
    {
      field: 'provider',
      message:
        'Gambar kontributor harus dari ImageKit (staging) atau Media Explorer (stock)',
    },
  ]);
}

/** Stock / github langsung → verified; ImageKit staging → menunggu tinjauan. */
export function resolveWordImageVerified(
  provider: string,
  wordOrActorVerified: boolean,
): boolean {
  if (wordImageIsAutoVerified(provider)) return true;
  return wordOrActorVerified;
}
