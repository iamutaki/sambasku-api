import type { Language } from '../../domain/entities/language.entity';
import type { LanguageRepository } from '../../domain/repositories/language.repository';

// Dropdown bahasa di form admin
export class ListLanguagesUseCase {
  constructor(private readonly languageRepo: LanguageRepository) {}

  async execute(activeOnly = true): Promise<Language[]> {
    return this.languageRepo.listLanguages(activeOnly);
  }
}
