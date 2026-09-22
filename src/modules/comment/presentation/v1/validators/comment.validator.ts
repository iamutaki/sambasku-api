import { z } from 'zod';

export const commentBodySchema = z.object({
  body: z.string().trim().min(1, 'Komentar tidak boleh kosong').max(1000, 'Komentar maksimal 1000 karakter'),
});

export type CreateCommentBody = z.infer<typeof commentBodySchema>;

export const commentStatusSchema = z.enum(['published', 'taken_down', 'deleted_by_author']);

export const listCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().length(26).optional(),
});

export type ListCommentsQueryBody = z.infer<typeof listCommentsQuerySchema>;

export const listAdminCommentsQuerySchema = z.object({
  status: commentStatusSchema.optional(),
  word_id: z.string().length(26).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().length(26).optional(),
});

export type ListAdminCommentsQueryBody = z.infer<typeof listAdminCommentsQuerySchema>;

const commentDataSchema = z.object({
  id: z.string(),
  word_id: z.string(),
  word_lemma: z.string().nullable(),
  user_id: z.string(),
  username: z.string().nullable(),
  body: z.string().nullable(),
  status: commentStatusSchema,
  created_at: z.string(),
});

export const createCommentResponseSchema = z.object({
  success: z.literal(true),
  data: commentDataSchema,
});

const cursorMetaSchema = z.object({
  limit: z.number().int(),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});

export const listCommentsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(commentDataSchema.extend({ upvotes: z.number().int(), downvotes: z.number().int() })),
  meta: cursorMetaSchema,
});

export const adminListCommentsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    commentDataSchema.extend({
      // Admin selalu dapat body string (asli)
      body: z.string(),
      reviewed_by: z.string().nullable(),
      reviewed_at: z.string().nullable(),
    }),
  ),
  meta: cursorMetaSchema,
});

export const takedownCommentResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    status: z.literal('taken_down'),
    reviewed_by: z.string(),
    reviewed_at: z.string(),
  }),
});

export const listMyCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().length(26).optional(),
  status: commentStatusSchema.optional(),
});

export type ListMyCommentsQueryBody = z.infer<typeof listMyCommentsQuerySchema>;

export const myCommentsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string(),
      word_id: z.string(),
      word_lemma: z.string().nullable(),
      body: z.string(),
      status: commentStatusSchema,
      created_at: z.string(),
      reviewed_at: z.string().nullable(),
    }),
  ),
  meta: cursorMetaSchema,
});
