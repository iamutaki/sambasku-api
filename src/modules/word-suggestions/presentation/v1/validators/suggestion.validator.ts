import { z } from 'zod';
import { choiceId, opaqueId } from '@/shared/validation/id';
import type {
  ProposedChanges,
  SuggestionReasonCode,
} from '../../../domain/entities/word-suggestion.entity';
import { composeReasonDisplay } from '../../../domain/entities/word-suggestion.entity';

const ulid = opaqueId;
const wordClassId = choiceId('Kelas kata');

const meaningChangeSchema = z.object({
  meaning_id: ulid.optional(),
  action: z.enum(['update', 'add', 'delete']),
  word_class_id: wordClassId.optional(),
  definition: z.string().max(5000).optional(),
  translations: z
    .array(
      z.object({
        language_id: ulid,
        translation_text: z.string().trim().min(1).max(500),
        translation_type: z.string().max(50).optional(),
      }),
    )
    .optional(),
  examples: z
    .array(
      z.object({
        source_language_id: ulid,
        source_sentence: z.string().max(2000),
        target_language_id: ulid.optional(),
        target_sentence: z.string().max(2000).optional(),
        source_type: z.string().max(100).optional(),
      }),
    )
    .optional(),
});

const relationChangeSchema = z.object({
  action: z.enum(['add', 'remove']),
  relation_type: z.enum(['synonym', 'antonym', 'has_component', 'derived_from']),
  word_id: ulid,
});

const variantChangeSchema = z.object({
  action: z.enum(['add', 'remove']),
  form: z.string().trim().min(1).max(255),
  variant_type: z.enum(['alternative', 'inflection', 'derivation', 'reduplication']).default('alternative'),
  dialect_id: ulid.nullable().optional(),
});

const imageChangeSchema = z
  .object({
    action: z.enum(['add', 'remove', 'set_primary']),
    image_id: ulid.optional(),
    url: z.string().url().optional(),
    provider_file_id: z.string().trim().min(1).max(255).optional(),
    alt_text: z.string().trim().max(500).optional(),
    is_primary: z.boolean().optional(),
  })
  .superRefine((img, ctx) => {
    if (img.action === 'add') {
      if (!img.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'action=add wajib url' });
      if (!img.provider_file_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['provider_file_id'],
          message: 'action=add wajib provider_file_id',
        });
      }
    }
    if ((img.action === 'remove' || img.action === 'set_primary') && !img.image_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['image_id'],
        message: `action=${img.action} wajib image_id`,
      });
    }
  });

const proposedChangesObjectSchema = z
  .object({
    lemma: z.string().trim().min(1).max(255).optional(),
    notes: z.string().max(2000).optional(),
    meanings: z.array(meaningChangeSchema).max(10).optional(),
    category_ids_to_add: z.array(ulid).optional(),
    category_ids_to_remove: z.array(ulid).optional(),
    relations: z.array(relationChangeSchema).max(10).optional(),
    variants: z.array(variantChangeSchema).max(10).optional(),
    images: z.array(imageChangeSchema).max(5).optional(),
  })
  .refine(
    (p) =>
      p.lemma !== undefined ||
      p.notes !== undefined ||
      (p.meanings?.length ?? 0) > 0 ||
      (p.category_ids_to_add?.length ?? 0) > 0 ||
      (p.category_ids_to_remove?.length ?? 0) > 0 ||
      (p.relations?.length ?? 0) > 0 ||
      (p.variants?.length ?? 0) > 0 ||
      (p.images?.length ?? 0) > 0,
    { message: 'Minimal satu field perubahan harus diisi' },
  )
  .superRefine((p, ctx) => {
    const primaryAdds = (p.images ?? []).filter((i) => i.action === 'add' && i.is_primary).length;
    if (primaryAdds > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['images'],
        message: 'Maksimal satu gambar is_primary=true di batch add',
      });
    }
  });

export const suggestionReasonCodeSchema = z.enum([
  'typo',
  'inaccurate_definition',
  'missing_example',
  'missing_relation',
  'image_issue',
  'other',
]);

export const createSuggestionSchema = z
  .object({
    proposed_changes: proposedChangesObjectSchema,
    reason_code: suggestionReasonCodeSchema.optional(),
    reason_text: z.string().trim().max(500).optional(),
    // deprecated back-compat
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((body, ctx) => {
    const code = body.reason_code ?? (body.reason ? 'other' : undefined);
    if (!code) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason_code'],
        message: 'reason_code wajib diisi',
      });
      return;
    }
    const text = body.reason_text ?? (code === 'other' && body.reason ? body.reason : undefined);
    if (code === 'other') {
      if (!text || text.trim().length < 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['reason_text'],
          message: 'reason_text wajib (min 3) jika reason_code=other',
        });
      }
    }
  });

export type CreateSuggestionRequest = z.infer<typeof createSuggestionSchema>;

export function resolveReasonFields(body: CreateSuggestionRequest): {
  reasonCode: SuggestionReasonCode;
  reasonDisplay: string;
  reasonText: string | null;
} {
  const reasonCode = (body.reason_code ?? 'other') as SuggestionReasonCode;
  const reasonText =
    body.reason_text?.trim() ||
    (reasonCode === 'other' && body.reason ? body.reason.trim() : null) ||
    null;
  return {
    reasonCode,
    reasonText,
    reasonDisplay: composeReasonDisplay(reasonCode, reasonText),
  };
}

/** Map body snake_case → ProposedChanges camelCase (domain). */
export function mapProposedChanges(
  raw: CreateSuggestionRequest['proposed_changes'],
): ProposedChanges {
  return {
    lemma: raw.lemma,
    notes: raw.notes,
    meanings: raw.meanings?.map((m) => ({
      meaningId: m.meaning_id,
      action: m.action,
      wordClassId: m.word_class_id,
      definition: m.definition,
      translations: m.translations?.map((t) => ({
        languageId: t.language_id,
        translationText: t.translation_text,
        translationType: t.translation_type,
      })),
      examples: m.examples?.map((e) => ({
        sourceLanguageId: e.source_language_id,
        sourceSentence: e.source_sentence,
        targetLanguageId: e.target_language_id,
        targetSentence: e.target_sentence,
        sourceType: e.source_type,
      })),
    })),
    categoryIdsToAdd: raw.category_ids_to_add,
    categoryIdsToRemove: raw.category_ids_to_remove,
    relations: raw.relations?.map((r) => ({
      action: r.action,
      relationType: r.relation_type,
      wordId: r.word_id,
    })),
    variants: raw.variants?.map((v) => ({
      action: v.action,
      form: v.form,
      variantType: v.variant_type,
      dialectId: v.dialect_id ?? null,
    })),
    images: raw.images?.map((i) => ({
      action: i.action,
      imageId: i.image_id,
      url: i.url,
      providerFileId: i.provider_file_id,
      altText: i.alt_text,
      isPrimary: i.is_primary,
    })),
  };
}

export const createSuggestionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    suggestion_id: z.string().length(26),
    word_id: z.string().length(26),
    word_lemma: z.string(),
    status: z.literal('pending'),
    created_at: z.string(),
    message: z.string(),
  }),
});

export const suggestionListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string().length(26),
      word_id: z.string().length(26),
      word_lemma: z.string(),
      contributor_id: z.string().length(26),
      contributor_username: z.string().nullable(),
      reason: z.string(),
      reason_code: suggestionReasonCodeSchema,
      status: z.enum(['pending', 'approved', 'rejected', 'corrected']),
      created_at: z.string(),
      summary_changes: z.object({
        lemma: z.string().nullable(),
        notes: z.string().nullable(),
        meanings_count: z.number(),
        categories_added: z.number(),
        categories_removed: z.number(),
        relations_count: z.number(),
        variants_count: z.number(),
        images_count: z.number(),
      }),
    }),
  ),
  meta: z.object({
    limit: z.number(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const suggestionDetailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    suggestion: z.object({
      id: z.string().length(26),
      word_id: z.string().length(26),
      word_lemma: z.string(),
      contributor_id: z.string().length(26),
      contributor_username: z.string().nullable(),
      reason: z.string(),
      reason_code: suggestionReasonCodeSchema,
      proposed_changes: z.any(),
      status: z.enum(['pending', 'approved', 'rejected', 'corrected']),
      created_at: z.string(),
    }),
    current_word: z.object({
      lemma: z.string(),
      notes: z.string().nullable(),
      meanings: z.array(
        z.object({
          id: z.string().length(26),
          word_class: z.object({ code: z.string(), name: z.string() }).nullable(),
          definition: z.string(),
          translations: z.array(z.object({ translation_text: z.string() })),
        }),
      ),
      category_ids: z.array(z.string().length(26)),
      relations: z.array(
        z.object({
          relation_type: z.string(),
          word_id: z.string().length(26),
          lemma: z.string(),
        }),
      ),
      variants: z.array(
        z.object({
          form: z.string(),
          variant_type: z.string(),
          dialect_id: z.string().nullable(),
        }),
      ),
      images: z.array(
        z.object({
          id: z.string().length(26),
          url: z.string(),
          is_primary: z.boolean(),
          alt_text: z.string().nullable(),
        }),
      ),
    }),
    diff: z.object({
      lemma: z.object({
        current: z.string().nullable(),
        proposed: z.string().nullable(),
        changed: z.boolean(),
      }),
      notes: z.object({
        current: z.string().nullable(),
        proposed: z.string().nullable(),
        changed: z.boolean(),
      }),
      meanings: z.array(
        z.object({
          meaning_id: z.string().length(26).nullable(),
          changes: z.array(
            z.object({
              current: z.string().nullable(),
              proposed: z.string().nullable(),
              changed: z.boolean(),
            }),
          ),
        }),
      ),
      categories: z.object({
        added: z.array(z.string().length(26)),
        removed: z.array(z.string().length(26)),
      }),
      relations: z.object({
        added: z.array(
          z.object({
            relation_type: z.string(),
            word_id: z.string().length(26),
            lemma: z.string().optional(),
          }),
        ),
        removed: z.array(
          z.object({
            relation_type: z.string(),
            word_id: z.string().length(26),
            lemma: z.string().optional(),
          }),
        ),
      }),
      variants: z.object({
        added: z.array(z.object({ form: z.string(), variant_type: z.string() })),
        removed: z.array(z.object({ form: z.string(), variant_type: z.string() })),
      }),
      images: z.object({
        added: z.array(z.object({ url: z.string(), is_primary: z.boolean() })),
        removed: z.array(z.object({ image_id: z.string().length(26) })),
        set_primary: z.array(z.object({ image_id: z.string().length(26) })),
      }),
    }),
  }),
});

export const approveResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    suggestion_id: z.string().length(26),
    word_id: z.string().length(26),
    word_lemma: z.string(),
    status: z.literal('approved'),
    changes_applied: z.number(),
    message: z.string(),
  }),
});

export const rejectResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    suggestion_id: z.string().length(26),
    status: z.literal('rejected'),
  }),
});

export const changeHistoryResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string().length(26),
      timestamp: z.string(),
      actor: z.object({
        user_id: z.string(),
        username: z.string().nullable(),
      }),
      type: z.enum(['direct_edit', 'suggest_edit']),
      changes: z.array(
        z.object({
          entity: z.string(),
          field: z.string(),
          old_value: z.any().nullable(),
          new_value: z.any().nullable(),
          display_old: z.string(),
          display_new: z.string(),
        }),
      ),
      source: z
        .object({
          suggestion_id: z.string().length(26),
          suggested_by: z.object({
            user_id: z.string().length(26),
            username: z.string().nullable(),
          }),
          reason: z.string(),
          reviewer: z
            .object({
              user_id: z.string().length(26),
              username: z.string().nullable(),
            })
            .nullable(),
          review_comment: z.string().nullable(),
        })
        .nullable(),
    }),
  ),
  meta: z.object({
    limit: z.number(),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  }),
});

export const adminListSuggestionsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'corrected']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
});

export const approveSuggestionBodySchema = z.object({
  comment: z.string().max(500).optional(),
});

export const rejectSuggestionBodySchema = z.object({
  comment: z.string().trim().min(1).max(500),
});
