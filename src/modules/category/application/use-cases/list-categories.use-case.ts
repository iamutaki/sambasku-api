import type { Category } from '../../domain/entities/category.entity';
import type { CategoryRepository } from '../../domain/repositories/category.repository';

// Multi-select kategori/glosarium di form admin
export class ListCategoriesUseCase {
  constructor(private readonly categoryRepo: CategoryRepository) {}

  async execute(): Promise<Category[]> {
    return this.categoryRepo.listCategories();
  }
}
