import { and, asc, eq } from 'drizzle-orm';
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
      .where(activeOnly ? eq(languages.isActive, true) : undefined)
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
        activeOnly
          ? and(eq(dialects.languageId, languageId), eq(dialects.isActive, true))
          : eq(dialects.languageId, languageId),
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
