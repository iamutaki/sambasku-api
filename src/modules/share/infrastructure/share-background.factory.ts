import { env } from '@/shared/config/env';
import type {
  ShareBackgroundProviderId,
  ShareBackgroundProviderInfo,
  ShareBackgroundProviderPort,
} from '../application/ports/share-background-provider.port';
import { UnsplashBackgroundProvider } from './unsplash-background.provider';

export type ShareBackgroundProviderRegistry = Map<
  ShareBackgroundProviderId,
  ShareBackgroundProviderPort
>;

/** Registry provider aktif. Unsplash hanya masuk jika access key ada. */
export function createShareBackgroundProviderRegistry(): ShareBackgroundProviderRegistry {
  const registry: ShareBackgroundProviderRegistry = new Map();
  const key = env.UNSPLASH_ACCESS_KEY?.trim();
  if (key) {
    registry.set('unsplash', new UnsplashBackgroundProvider(key));
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
    },
  ];
}
