import { z } from 'zod';
import { MAX_BOOKMARK_WORD_IDS } from '@/modules/bookmark/domain/repositories/bookmark.repository';

const ulid = z.string().length(26, 'ID harus ULID 26 karakter');

export const toggleBookmarkSchema = z.object({
  word_id: ulid,
});

export type ToggleBookmarkBody = z.infer<typeof toggleBookmarkSchema>;

// Alfabet longgar ([0-9A-Za-z]) - konsisten dengan validator vote: fixture
// ULID handmade di repo memakai huruf bebas; guard sesungguhnya adalah cek
// eksistensi di use case (404).
const WORD_ID_PATTERN = /^[0-9A-Za-z]{26}$/;

// "01X,01Y" → array ULID tervalidasi (trim, dedupe, maks 50)
export const myBookmarksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: ulid.optional(),
  word_ids: z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (val === undefined) return undefined;
      const items = [...new Set(val.split(',').map((s) => s.trim()).filter(Boolean))];
      if (
        items.length === 0 ||
        items.length > MAX_BOOKMARK_WORD_IDS ||
        items.some((i) => !WORD_ID_PATTERN.test(i))
      ) {
        ctx.addIssue({
          code: 'custom',
          input: val,
          message: `word_ids harus 1-${MAX_BOOKMARK_WORD_IDS} ULID (26 char) dipisah koma`,
        });
        return z.NEVER;
      }
      return items;
    }),
});

export type MyBookmarksQuery = z.infer<typeof myBookmarksQuerySchema>;

export const toggleBookmarkResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    word_id: z.string(),
    is_bookmarked: z.boolean(),
    bookmarked_at: z.string().nullable(),
  }),
});

const bookmarkDataSchema = z.object({
  word_id: z.string(),
  bookmarked_at: z.string(),
  word: z.object({
    id: z.string(),
    lemma: z.string(),
    word_type: z.string(),
    is_verified: z.boolean(),
  }),
});

const cursorMetaSchema = z.object({
  limit: z.number().int(),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});

export const myBookmarksResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(bookmarkDataSchema),
  // meta hanya saat tanpa filter word_ids (mode cek status batch)
  meta: cursorMetaSchema.optional(),
});
