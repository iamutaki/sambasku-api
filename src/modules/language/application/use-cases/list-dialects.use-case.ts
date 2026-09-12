import type { Dialect } from '../../domain/entities/language.entity';
import type { LanguageRepository } from '../../domain/repositories/language.repository';

// Dropdown dialek — menyusul bahasa yang dipilih di form admin
export class ListDialectsUseCase {
  constructor(private readonly languageRepo: LanguageRepository) {}

  async execute(languageId: string): Promise<Dialect[]> {
    return this.languageRepo.listDialects(languageId, true);
  }
}
