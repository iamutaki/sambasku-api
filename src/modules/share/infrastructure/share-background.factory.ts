import { env } from '@/shared/config/env';
import type {
  ShareBackgroundProviderId,
  ShareBackgroundProviderInfo,
  ShareBackgroundProviderPort,
} from '../application/ports/share-background-provider.port';
import { SHARE_PROVIDER_MEDIA } from '../application/ports/share-background-provider.port';
import { PexelsBackgroundProvider } from './pexels-background.provider';
import { UnsplashBackgroundProvider } from './unsplash-background.provider';

export type ShareBackgroundProviderRegistry = Map<
  ShareBackgroundProviderId,
  ShareBackgroundProviderPort
>;

/** Registry provider aktif. Hanya masuk jika kuncinya terisi. */
export function createShareBackgroundProviderRegistry(): ShareBackgroundProviderRegistry {
  const registry: ShareBackgroundProviderRegistry = new Map();
  const unsplashKey = env.UNSPLASH_ACCESS_KEY?.trim();
  if (unsplashKey) {
    registry.set('unsplash', new UnsplashBackgroundProvider(unsplashKey));
  }
  const pexelsKey = env.PEXELS_API_KEY?.trim();
  if (pexelsKey) {
    registry.set('pexels', new PexelsBackgroundProvider(pexelsKey));
  }
  return registry;
}

/** @deprecated pakai createShareBackgroundProviderRegistry */
export function createShareBackgroundProvider(): ShareBackgroundProviderPort | null {
  return createShareBackgroundProviderRegistry().get('unsplash') ?? null;
}

export function listShareBackgroundProviderInfos(
  registry: ShareBackgroundProviderRegistry,
): ShareBackgroundProviderInfo[] {
  return [
    {
      id: 'unsplash',
      label: 'Unsplash',
      available: registry.has('unsplash'),
      media: [...SHARE_PROVIDER_MEDIA.unsplash],
    },
    {
      id: 'pexels',
      label: 'Pexels',
      available: registry.has('pexels'),
      media: [...SHARE_PROVIDER_MEDIA.pexels],
    },
  ];
}
