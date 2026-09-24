import { z } from 'zod';
import {
  STOCK_WORD_IMAGE_PROVIDERS,
  isAllowedStockImageUrl,
  isStockWordImageProvider,
} from '@/modules/word/domain/word-image-provider';

/** Provider yang boleh dikirim client: stock Media Explorer atau github (upload). */
export const wordImageClientProviderSchema = z.enum([
  ...STOCK_WORD_IMAGE_PROVIDERS,
  'github',
]);

/**
 * Item images[] / body add-word-image.
 * `provider` opsional: stock → disimpan apa adanya; absen/github → storage aktif.
 */
export const wordImageInputSchema = z
  .object({
    url: z.url('URL gambar tidak valid'),
    provider: wordImageClientProviderSchema.optional(),
    provider_file_id: z.string().trim().min(1, 'provider_file_id wajib diisi'),
    sha: z.string().trim().min(1).max(128).optional(),
    alt_text: z.string().trim().max(500).optional(),
    is_primary: z.boolean().default(false),
  })
  .superRefine((img, ctx) => {
    if (!img.provider || !isStockWordImageProvider(img.provider)) return;
    if (!isAllowedStockImageUrl(img.provider, img.url)) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'URL gambar tidak cocok dengan penyedia yang dipilih',
      });
    }
  });

export type WordImageInput = z.infer<typeof wordImageInputSchema>;
