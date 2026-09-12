import type { Dialect, Language } from '../entities/language.entity';

export interface LanguageRepository {
  listLanguages(activeOnly: boolean): Promise<Language[]>;
  listDialects(languageId: string, activeOnly?: boolean): Promise<Dialect[]>;
}
