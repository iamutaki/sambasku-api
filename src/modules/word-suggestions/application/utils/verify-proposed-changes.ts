import type { ProposedChanges } from '../../domain/entities/word-suggestion.entity';

export interface ValidationError {
  field: string;
  message: string;
}

export function verifyProposedChanges(changes: ProposedChanges): {
  valid: boolean;
  errors: ValidationError[];
} {
  const errors: ValidationError[] = [];

  const hasContent =
    changes.lemma !== undefined ||
    changes.notes !== undefined ||
    (changes.meanings?.length ?? 0) > 0 ||
    (changes.categoryIdsToAdd?.length ?? 0) > 0 ||
    (changes.categoryIdsToRemove?.length ?? 0) > 0 ||
    (changes.relations?.length ?? 0) > 0 ||
    (changes.variants?.length ?? 0) > 0 ||
    (changes.images?.length ?? 0) > 0;

  if (!hasContent) {
    errors.push({ field: 'proposed_changes', message: 'Minimal satu field harus diisi' });
    return { valid: false, errors };
  }

  if (changes.meanings && changes.meanings.length > 10) {
    errors.push({ field: 'meanings', message: 'Maksimal 10 makna per usulan' });
  }

  if (changes.meanings) {
    changes.meanings.forEach((mc, idx) => {
      const prefix = `meanings.${idx}`;

      if (mc.action === 'delete' && !mc.meaningId) {
        errors.push({ field: `${prefix}.meaning_id`, message: 'action=delete wajib ada meaning_id' });
      }

      if (mc.action === 'add') {
        if (!mc.definition || mc.definition.trim() === '') {
          errors.push({ field: `${prefix}.definition`, message: 'action=add wajib ada definition' });
        }
        if (!mc.translations || mc.translations.length === 0) {
          const def = (mc.definition ?? '').trim();
          const hasRealDef = def !== '-' && def.length > 0;
          if (!hasRealDef) {
            errors.push({
              field: `${prefix}.translations`,
              message: 'action=add tanpa definisi nyata wajib ada minimal 1 translation',
            });
          }
        }
      }

      if (mc.action === 'update' && mc.meaningId) {
        const hasAny =
          mc.definition !== undefined ||
          mc.wordClassId !== undefined ||
          (mc.translations?.length ?? 0) > 0;
        if (!hasAny) {
          errors.push({
            field: `${prefix}`,
            message: 'action=update wajib ada minimal satu field yang diubah',
          });
        }
      }

      if (mc.translations) {
        mc.translations.forEach((t, tIdx) => {
          if (!t.languageId) {
            errors.push({
              field: `${prefix}.translations.${tIdx}.language_id`,
              message: 'language_id wajib',
            });
          }
          if (!t.translationText || t.translationText.trim() === '') {
            errors.push({
              field: `${prefix}.translations.${tIdx}.translation_text`,
              message: 'translation_text wajib',
            });
          }
        });
      }
    });
  }

  if (changes.relations && changes.relations.length > 10) {
    errors.push({ field: 'relations', message: 'Maksimal 10 relasi per usulan' });
  }
  if (changes.relations) {
    const seen = new Set<string>();
    changes.relations.forEach((r, idx) => {
      const prefix = `relations.${idx}`;
      if (!r.wordId) {
        errors.push({ field: `${prefix}.word_id`, message: 'word_id wajib (Form A saja)' });
      }
      const key = `${r.action}|${r.relationType}|${r.wordId}`;
      if (seen.has(key)) {
        errors.push({ field: prefix, message: 'Relasi duplikat dalam satu usulan' });
      }
      seen.add(key);
    });
  }

  if (changes.variants && changes.variants.length > 10) {
    errors.push({ field: 'variants', message: 'Maksimal 10 varian per usulan' });
  }
  if (changes.variants) {
    const seen = new Set<string>();
    changes.variants.forEach((v, idx) => {
      const prefix = `variants.${idx}`;
      if (!v.form?.trim()) {
        errors.push({ field: `${prefix}.form`, message: 'form wajib' });
      }
      if (changes.lemma && v.action === 'add' && v.form.trim().toLowerCase() === changes.lemma.trim().toLowerCase()) {
        errors.push({ field: `${prefix}.form`, message: 'form tidak boleh sama dengan lemma' });
      }
      const key = `${v.form.trim().toLowerCase()}|${v.dialectId ?? ''}`;
      if (v.action === 'add' && seen.has(key)) {
        errors.push({ field: `${prefix}.form`, message: 'Varian duplikat (form+dialect)' });
      }
      if (v.action === 'add') seen.add(key);
    });
  }

  if (changes.images && changes.images.length > 5) {
    errors.push({ field: 'images', message: 'Maksimal 5 perubahan gambar per usulan' });
  }
  if (changes.images) {
    let primaryAdds = 0;
    changes.images.forEach((img, idx) => {
      const prefix = `images.${idx}`;
      if (img.action === 'add') {
        if (!img.url) errors.push({ field: `${prefix}.url`, message: 'action=add wajib url' });
        if (!img.providerFileId) {
          errors.push({
            field: `${prefix}.provider_file_id`,
            message: 'action=add wajib provider_file_id',
          });
        }
        if (img.isPrimary) primaryAdds++;
      }
      if ((img.action === 'remove' || img.action === 'set_primary') && !img.imageId) {
        errors.push({
          field: `${prefix}.image_id`,
          message: `action=${img.action} wajib image_id`,
        });
      }
    });
    if (primaryAdds > 1) {
      errors.push({
        field: 'images',
        message: 'Maksimal satu gambar is_primary=true di batch add',
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
