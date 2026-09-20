import type { Context } from 'hono';
import type { ListShareBackgroundsUseCase } from '../../application/use-cases/list-share-backgrounds.use-case';

export class ShareController {
  constructor(private deps: { listBackgrounds: ListShareBackgroundsUseCase }) {}

  async backgrounds(c: Context, q: string) {
    const result = await this.deps.listBackgrounds.execute(q);
    return c.json({
      success: true as const,
      data: {
        query: result.query,
        cache_hit: result.cache_hit,
        items: result.items,
      },
    });
  }
}
