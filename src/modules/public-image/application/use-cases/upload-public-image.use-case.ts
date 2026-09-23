import type { PublicImageStoragePort } from '../ports/public-image-storage.port';
import { buildWordImagePath } from '../utils/public-image-path';
import { validateImageFile } from '../utils/validate-image-file';

export interface UploadPublicImageResult {
  url: string;
  provider: string;
  providerFileId: string;
  sha: string;
}

/** Upload gambar kata saja (purpose=word). Avatar punya use-case sendiri. */
export class UploadPublicImageUseCase {
  constructor(private readonly storage: PublicImageStoragePort) {}

  async execute(input: {
    bytes: Uint8Array;
    mimeType: string | null | undefined;
    filename?: string | null;
  }): Promise<UploadPublicImageResult> {
    const file = validateImageFile(input);
    const path = buildWordImagePath(file.mimeType);
    const uploaded = await this.storage.upload({
      path,
      content: file.bytes,
      mimeType: file.mimeType,
    });
    return {
      url: uploaded.url,
      provider: this.storage.providerName,
      providerFileId: uploaded.path,
      sha: uploaded.sha,
    };
  }
}
