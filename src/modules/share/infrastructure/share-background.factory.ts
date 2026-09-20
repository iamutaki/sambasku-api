import { env } from '@/shared/config/env';
import type { ShareBackgroundProviderPort } from '../application/ports/share-background-provider.port';
import { UnsplashBackgroundProvider } from './unsplash-background.provider';

/** null = belum dikonfigurasi; use case mengembalikan items []. */
export function createShareBackgroundProvider(): ShareBackgroundProviderPort | null {
  const key = env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return null;
  return new UnsplashBackgroundProvider(key);
}
