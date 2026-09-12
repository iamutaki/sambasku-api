import { asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { categories } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import type { Category } from '../domain/entities/category.entity';
import type { CategoryRepository } from '../domain/repositories/category.repository';

export class CategoryRepositoryImpl implements CategoryRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async listCategories(): Promise<Category[]> {
    const rows = await this.db.select().from(categories).orderBy(asc(categories.name));
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      description: r.description,
    }));
  }
}
