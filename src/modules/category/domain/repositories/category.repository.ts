import type { Category } from '../entities/category.entity';

export interface CategoryRepository {
  listCategories(): Promise<Category[]>;
}
