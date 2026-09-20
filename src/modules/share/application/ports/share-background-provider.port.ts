export interface ShareBackgroundItem {
  url: string;
  photographer: string;
  username: string;
  unsplash_url: string;
}

export interface ShareBackgroundProviderPort {
  readonly providerName: string;
  search(query: string, limit: number): Promise<ShareBackgroundItem[]>;
}
