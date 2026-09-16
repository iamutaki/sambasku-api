import { and, asc, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { dialects, languages } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import type { Dialect, Language } from '../domain/entities/language.entity';
import type { LanguageRepository } from '../domain/repositories/language.repository';

export class LanguageRepositoryImpl implements LanguageRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async listLanguages(activeOnly: boolean): Promise<Language[]> {
    const rows = await this.db
      .select()
      .from(languages)
      .where(activeOnly ? and(eq(languages.isActive, true), isNull(languages.deletedAt)) : isNull(languages.deletedAt))
      .orderBy(asc(languages.name));
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      nativeName: r.nativeName,
      isActive: r.isActive,
    }));
  }

  async listDialects(languageId: string, activeOnly = true): Promise<Dialect[]> {
    const rows = await this.db
      .select()
      .from(dialects)
      .where(
        and(
          eq(dialects.languageId, languageId),
          isNull(dialects.deletedAt),
          activeOnly ? eq(dialects.isActive, true) : undefined,
        ),
      )
      .orderBy(asc(dialects.name));
    return rows.map((r) => ({
      id: r.id,
      languageId: r.languageId,
      code: r.code,
      name: r.name,
      isActive: r.isActive,
    }));
  }
}
