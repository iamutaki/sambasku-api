import { z } from 'zod';

// Plain text, di-trim, tanpa markup - client bertanggung jawab escape saat
// render (API tidak mengirim HTML)
export const commentBodySchema = z.object({
  body: z.string().trim().min(1, 'Komentar tidak boleh kosong').max(1000, 'Komentar maksimal 1000 karakter'),
});

export type CreateCommentBody = z.infer<typeof commentBodySchema>;

// Kosakata konten Section 22 (bukan kosakata workflow contributions)
export const commentStatusSchema = z.enum(['pending_review', 'published', 'rejected']);

export const listCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().length(26).optional(),
});

export type ListCommentsQueryBody = z.infer<typeof listCommentsQuerySchema>;

export const listAdminCommentsQuerySchema = z.object({
  // Optional TANPA default: absen = semua status (embed detail kata);
  // halaman antrean selalu mengirim status eksplisit (tab).
  status: commentStatusSchema.optional(),
  // Filter per kata - untuk section komentar di halaman detail admin
  word_id: z.string().length(26).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().length(26).optional(),
});

export type ListAdminCommentsQueryBody = z.infer<typeof listAdminCommentsQuerySchema>;

const commentDataSchema = z.object({
  id: z.string(),
  word_id: z.string(),
  user_id: z.string(),
  username: z.string().nullable(),
  body: z.string(),
  created_at: z.string(),
});

export const createCommentResponseSchema = z.object({
  success: z.literal(true),
  data: commentDataSchema.extend({ status: commentStatusSchema }),
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
      status: commentStatusSchema,
      reviewed_by: z.string().nullable(),
      reviewed_at: z.string().nullable(),
    }),
  ),
  meta: cursorMetaSchema,
});

export const reviewCommentResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    status: commentStatusSchema,
    reviewed_by: z.string(),
    reviewed_at: z.string(),
  }),
});
