import { asc, isNull } from 'drizzle-orm';
import { categories } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import type { Category } from '../domain/entities/category.entity';
import type { CategoryRepository } from '../domain/repositories/category.repository';

export class CategoryRepositoryImpl implements CategoryRepository {
  constructor(private readonly db: AppDatabase) {}

  async listCategories(): Promise<Category[]> {
    const rows = await this.db.select().from(categories).where(isNull(categories.deletedAt)).orderBy(asc(categories.name));
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      description: r.description,
    }));
  }
}
