import type { Context } from 'hono';
import type { ListCategoriesUseCase } from '../../application/use-cases/list-categories.use-case';

export class CategoryController {
  constructor(private readonly deps: { listCategories: ListCategoriesUseCase }) {}

  async categories(c: Context) {
    const items = await this.deps.listCategories.execute();
    return c.json({
      success: true as const,
      data: items.map((cat) => ({
        id: cat.id,
        parent_id: cat.parentId,
        name: cat.name,
        description: cat.description,
      })),
    });
  }
}
