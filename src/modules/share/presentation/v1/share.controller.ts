import type { Context } from 'hono';
import type { ListShareBackgroundsUseCase } from '../../application/use-cases/list-share-backgrounds.use-case';
import type {
  ShareBackgroundProviderId,
  ShareBackgroundProviderInfo,
  ShareBackgroundSort,
} from '../../application/ports/share-background-provider.port';

export class ShareController {
  constructor(
    private deps: {
      listBackgrounds: ListShareBackgroundsUseCase;
      listProviders: () => ShareBackgroundProviderInfo[];
    },
  ) {}

  async backgrounds(
    c: Context,
    q: string,
    page: number,
    sort: ShareBackgroundSort,
    provider: ShareBackgroundProviderId,
    limit: number,
  ) {
    const result = await this.deps.listBackgrounds.execute(
      q,
      page,
      sort,
      provider,
      limit,
    );
    return c.json({
      success: true as const,
      data: {
        provider: result.provider,
        query: result.query,
        page: result.page,
        cache_hit: result.cache_hit,
        degraded: result.degraded,
        items: result.items,
      },
    });
  }

  providers(c: Context) {
    return c.json({
      success: true as const,
      data: {
        providers: this.deps.listProviders(),
      },
    });
  }
}
