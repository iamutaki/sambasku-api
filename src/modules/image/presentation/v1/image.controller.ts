import type { Context } from 'hono';
import type { CreateUploadCredentialsUseCase } from '../../application/use-cases/create-upload-credentials.use-case';

export class ImageController {
  constructor(private deps: { createUploadCredentials: CreateUploadCredentialsUseCase }) {}

  async uploadCredentials(c: Context, folder?: string) {
    const credentials = await this.deps.createUploadCredentials.execute(folder);
    return c.json({ success: true as const, data: credentials });
  }
}
