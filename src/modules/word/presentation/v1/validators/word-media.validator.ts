import { z } from 'zod';
import { choiceId, opaqueId } from '@/shared/validation/id';

const ulid = opaqueId;
const wordClassId = choiceId('Kelas kata');

// Status konten anak (03-api-kontribusi-verifikasi.md): tanpa draft -
// kontribusi media langsung masuk gerbang pending/published per role
export const childStatusSchema = z.enum(['pending_review', 'published', 'rejected']);

export const addPronunciationSchema = z.object({
  dialect_id: ulid.optional(),
  notation: z.string().trim().min(1).default('ipa'),
  value: z.string().trim().min(1, 'Pengucapan tidak boleh kosong').max(500),
  audio_url: z.url('URL audio tidak valid').optional(),
  speaker_name: z.string().trim().max(255).optional(),
  notes: z.string().optional(),
});

export const addWordImageSchema = z.object({
  url: z.url('URL gambar tidak valid'),
  provider_file_id: z.string().trim().min(1, 'provider_file_id wajib diisi'),
  sha: z.string().trim().min(1).max(128).optional(),
  alt_text: z.string().trim().max(500).optional(),
  is_primary: z.boolean().default(false),
});

export const addExampleSchema = z.object({
  source_language_id: ulid,
  source_sentence: z.string().trim().min(1, 'Contoh kalimat tidak boleh kosong'),
  target_language_id: ulid.optional(),
  target_sentence: z.string().optional(),
  source_type: z.enum(['native_speaker', 'book', 'corpus', 'interview', 'other']).optional(),
  notes: z.string().optional(),
});

// 17-api-usul-definisi.md: definisi selalu nyata (BUKAN placeholder "-");
// placeholder hanya lahir dari create-word dengan is_have_definition=false.
export const addMeaningSchema = z.object({
  word_class_id: wordClassId.optional(),
  definition: z.string().trim().min(1, 'Definisi tidak boleh kosong'),
  translations: z
    .array(
      z.object({
        language_id: ulid,
        translation_text: z.string().trim().min(1, 'Terjemahan tidak boleh kosong'),
        translation_type: z.enum(['direct', 'descriptive', 'idiomatic']).default('direct'),
      }),
    )
    .min(1, 'Minimal harus ada 1 terjemahan'),
});

export type AddPronunciationBody = z.infer<typeof addPronunciationSchema>;
export type AddWordImageBody = z.infer<typeof addWordImageSchema>;
export type AddExampleBody = z.infer<typeof addExampleSchema>;
export type AddMeaningBody = z.infer<typeof addMeaningSchema>;

// Response 201 - field publikasi per role (contributor → pending_review)
export const addPronunciationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    word_id: z.string(),
    dialect_id: z.string().nullable(),
    notation: z.string(),
    value: z.string(),
    audio_url: z.string().nullable(),
    speaker_name: z.string().nullable(),
    notes: z.string().nullable(),
    status: childStatusSchema,
    is_verified: z.boolean(),
    is_corrected: z.boolean(),
  }),
});

export const addWordImageResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    word_id: z.string(),
    url: z.string(),
    provider_file_id: z.string(),
    alt_text: z.string().nullable(),
    is_primary: z.boolean(),
    status: childStatusSchema,
    is_verified: z.boolean(),
    is_corrected: z.boolean(),
  }),
});

export const addExampleResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    meaning_id: z.string(),
    source_language_id: z.string(),
    source_sentence: z.string(),
    target_language_id: z.string().nullable(),
    target_sentence: z.string().nullable(),
    source_type: z.string().nullable(),
    notes: z.string().nullable(),
    status: childStatusSchema,
    is_verified: z.boolean(),
    is_corrected: z.boolean(),
  }),
});

export const addMeaningResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    word_id: z.string(),
    word_class_id: z.string().nullable(),
    definition: z.string(),
    order_index: z.number().int(),
    status: childStatusSchema,
    is_verified: z.boolean(),
    is_corrected: z.boolean(),
  }),
});

export const wordAudioResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    word_id: z.string(),
    example_id: z.string().nullable(),
    dialect_id: z.string().nullable(),
    url: z.string(),
    mime_type: z.string(),
    file_size: z.number().int(),
    duration_ms: z.number().int().nullable(),
    speaker_name: z.string().nullable(),
    is_primary: z.boolean(),
    status: childStatusSchema,
    is_verified: z.boolean(),
    is_corrected: z.boolean(),
  }),
});
