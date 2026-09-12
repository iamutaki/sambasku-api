import type { Context } from 'hono';
import { ValidationError } from '@/shared/errors/app-error';
import type { ListDialectsUseCase } from '../../application/use-cases/list-dialects.use-case';
import type { ListLanguagesUseCase } from '../../application/use-cases/list-languages.use-case';

export class LanguageController {
  constructor(
    private readonly deps: {
      listLanguages: ListLanguagesUseCase;
      listDialects: ListDialectsUseCase;
    },
  ) {}

  async languages(c: Context, isActive = true) {
    const items = await this.deps.listLanguages.execute(isActive);
    return c.json({
      success: true as const,
      data: items.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        native_name: l.nativeName,
        is_active: l.isActive,
      })),
    });
  }

  async dialects(c: Context, languageId: unknown) {
    if (typeof languageId !== 'string' || languageId.length !== 26) {
      throw new ValidationError([{ field: 'language_id', message: 'language_id wajib ULID 26 karakter' }]);
    }
    const items = await this.deps.listDialects.execute(languageId);
    return c.json({
      success: true as const,
      data: items.map((d) => ({
        id: d.id,
        language_id: d.languageId,
        code: d.code,
        name: d.name,
        is_active: d.isActive,
      })),
    });
  }
}
