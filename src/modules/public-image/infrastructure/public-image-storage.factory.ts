import { env } from '@/shared/config/env';
import type { PublicImageStoragePort } from '../application/ports/public-image-storage.port';
import { GitHubPublicImageStorageService } from './github-public-image-storage.service';

export function createPublicImageStorage(): PublicImageStoragePort {
  const provider = (env.PUBLIC_IMAGE_PROVIDER ?? 'github').toLowerCase();
  switch (provider) {
    case 'github':
      return new GitHubPublicImageStorageService();
    default:
      throw new Error(
        `PUBLIC_IMAGE_PROVIDER "${env.PUBLIC_IMAGE_PROVIDER}" tidak dikenal - tersedia: github`,
      );
  }
}
