import { z } from 'zod';

export const listLanguagesQuerySchema = z.object({
  is_active: z.coerce.boolean().default(true),
});

export const languageListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      native_name: z.string().nullable(),
      is_active: z.boolean(),
    }),
  ),
});

export const listDialectsQuerySchema = z.object({
  language_id: z.string().length(26, 'language_id wajib ULID 26 karakter'),
});

export const dialectListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      language_id: z.string(),
      code: z.string(),
      name: z.string(),
      is_active: z.boolean(),
    }),
  ),
});

export const errorSchema = z.object({
  success: z.literal(false),
  error_code: z.string(),
  message: z.string(),
  details: z.null(),
});
