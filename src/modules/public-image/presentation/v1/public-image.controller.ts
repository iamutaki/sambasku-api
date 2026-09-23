import type { Context } from 'hono';
import { BadRequestError } from '@/shared/errors/app-error';
import type { UploadPublicImageUseCase } from '../../application/use-cases/upload-public-image.use-case';
import { MAX_IMAGE_BYTES } from '../../application/utils/validate-image-file';

export class PublicImageController {
  constructor(private readonly deps: { uploadPublicImage: UploadPublicImageUseCase }) {}

  async upload(c: Context) {
    const contentLength = Number(c.req.header('content-length') ?? 0);
    if (contentLength > MAX_IMAGE_BYTES + 1024 * 1024) {
      throw new BadRequestError('IMAGE_TOO_LARGE', 'File gambar terlalu besar (maks 5 MB)', [
        { field: 'file', message: 'Ukuran maksimal 5 MB' },
      ]);
    }

    const body = await c.req.parseBody({ all: true });
    const filePart = body['file'];
    if (!filePart || typeof filePart === 'string') {
      throw new BadRequestError('VALIDATION_ERROR', 'File gambar wajib diunggah', [
        { field: 'file', message: 'Field multipart `file` wajib berisi file' },
      ]);
    }

    const file = filePart as File;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await this.deps.uploadPublicImage.execute({
      bytes,
      mimeType: file.type || null,
      filename: file.name || null,
    });

    return c.json(
      {
        success: true as const,
        data: {
          url: result.url,
          provider: result.provider,
          provider_file_id: result.providerFileId,
          sha: result.sha,
        },
      },
      201,
    );
  }
}
