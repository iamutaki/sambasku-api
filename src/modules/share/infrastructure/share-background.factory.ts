import { env } from '@/shared/config/env';
import type {
  ShareBackgroundProviderId,
  ShareBackgroundProviderInfo,
  ShareBackgroundProviderPort,
} from '../application/ports/share-background-provider.port';
import { SHARE_PROVIDER_MEDIA } from '../application/ports/share-background-provider.port';
import { PixabayBackgroundProvider } from './pixabay-background.provider';
import { OpenverseBackgroundProvider } from './openverse-background.provider';
import { UnsplashBackgroundProvider } from './unsplash-background.provider';

export type ShareBackgroundProviderRegistry = Map<
  ShareBackgroundProviderId,
  ShareBackgroundProviderPort
>;

/**
 * Registry provider Media Explorer.
 * Hanya penyedia dengan flag safe-search / content filter.
 * Openverse selalu terdaftar (anonim).
 */
export function createShareBackgroundProviderRegistry(): ShareBackgroundProviderRegistry {
  const registry: ShareBackgroundProviderRegistry = new Map();
  const unsplashKey = env.UNSPLASH_ACCESS_KEY?.trim();
  if (unsplashKey) {
    registry.set('unsplash', new UnsplashBackgroundProvider(unsplashKey));
  }
  const pixabayKey = env.PIXABAY_API_KEY?.trim();
  if (pixabayKey) {
    registry.set('pixabay', new PixabayBackgroundProvider(pixabayKey));
  }
  registry.set('openverse', new OpenverseBackgroundProvider());
  return registry;
}

/** @deprecated pakai createShareBackgroundProviderRegistry */
export function createShareBackgroundProvider(): ShareBackgroundProviderPort | null {
  const registry = createShareBackgroundProviderRegistry();
  return registry.get('pixabay') ?? registry.get('unsplash') ?? registry.get('openverse') ?? null;
}

export function listShareBackgroundProviderInfos(
  registry: ShareBackgroundProviderRegistry,
): ShareBackgroundProviderInfo[] {
  return [
    {
      id: 'pixabay',
      label: 'Pixabay',
      available: registry.has('pixabay'),
      media: [...SHARE_PROVIDER_MEDIA.pixabay],
    },
    {
      id: 'openverse',
      label: 'Openverse',
      available: registry.has('openverse'),
      media: [...SHARE_PROVIDER_MEDIA.openverse],
    },
    {
      id: 'unsplash',
      label: 'Unsplash',
      available: registry.has('unsplash'),
      media: [...SHARE_PROVIDER_MEDIA.unsplash],
    },
  ];
}
