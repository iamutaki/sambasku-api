import { env } from '@/shared/config/env';
import type { PronunciationStoragePort } from '../application/ports/pronunciation-storage.port';
import { GitHubPronunciationStorageService } from './github-pronunciation-storage.service';

// Pilih impl dari env (pola image-storage.factory.ts).
// Nilai tak dikenal → CRASH saat boot (fail fast).
export function createPronunciationStorage(): PronunciationStoragePort {
  const provider = (env.PRONUNCIACION_PROVIDER ?? 'github').toLowerCase();
  switch (provider) {
    case 'github':
      return new GitHubPronunciationStorageService();
    default:
      throw new Error(
        `PRONUNCIACION_PROVIDER "${env.PRONUNCIACION_PROVIDER}" tidak dikenal - tersedia: github`,
      );
  }
}
