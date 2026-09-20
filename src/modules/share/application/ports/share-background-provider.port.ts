export type ShareBackgroundProviderId = 'unsplash';

export const SHARE_BACKGROUND_PROVIDER_IDS = ['unsplash'] as const satisfies readonly ShareBackgroundProviderId[];

export interface ShareBackgroundItem {
  id: string;
  url: string;
  photographer: string;
  username: string;
  attribution_url: string;
  /** Alias backward-compat untuk client lama. */
  unsplash_url: string;
  provider: ShareBackgroundProviderId;
}

export type ShareBackgroundSort = 'relevant' | 'popular';

export interface ShareBackgroundProviderPort {
  readonly providerId: ShareBackgroundProviderId;
  /** @deprecated pakai providerId */
  readonly providerName: string;
  search(
    query: string,
    limit: number,
    page: number,
    sort?: ShareBackgroundSort,
  ): Promise<ShareBackgroundItem[]>;
}

export interface ShareBackgroundProviderInfo {
  id: ShareBackgroundProviderId;
  label: string;
  available: boolean;
}
