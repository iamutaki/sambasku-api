import { env } from '@/shared/config/env';
import type { ImageStoragePort } from '../application/ports/image-storage.port';
import { ImageKitStorageService } from './imagekit-storage.service';

// Pilih impl ImageStoragePort dari env (Section 8 - pola yang sama dengan
// createMailer): IMAGE_PROVIDER=imagekit (default: satu-satunya provider
// hari ini). Provider baru = file impl baru + satu case di sini.
// Kredensial tetap per-provider (IMAGEKIT_*) karena bentuknya beda-beda:
// ImageKit butuh private+public+endpoint, S3 butuh key+secret+region+bucket.
// Nilai tak dikenal → CRASH saat boot (fail fast, bukan diam-diam salah).
export function createImageStorage(): ImageStoragePort {
  const provider = (env.IMAGE_PROVIDER ?? 'imagekit').toLowerCase();
  switch (provider) {
    case 'imagekit':
      return new ImageKitStorageService();
    default:
      throw new Error(
        `IMAGE_PROVIDER "${env.IMAGE_PROVIDER}" tidak dikenal - tersedia: imagekit`,
      );
  }
}
