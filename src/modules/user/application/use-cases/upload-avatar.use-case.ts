import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';
import { buildAvatarImagePath } from '@/modules/public-image/application/utils/public-image-path';
import { validateImageFile } from '@/modules/public-image/application/utils/validate-image-file';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
import { NotFoundError } from '@/shared/errors/app-error';

export interface AvatarUploadResult {
  avatarUrl: string;
}

export class UploadAvatarUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly storage: PublicImageStoragePort,
  ) {}

  async execute(
    userId: string,
    input: { bytes: Uint8Array; mimeType: string | null | undefined; filename?: string | null },
  ): Promise<AvatarUploadResult> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt) {
      throw new NotFoundError('USER_NOT_FOUND', 'User tidak ditemukan');
    }

    const file = validateImageFile(input);
    const path = buildAvatarImagePath(userId, file.mimeType);
    const uploaded = await this.storage.upload({
      path,
      content: file.bytes,
      mimeType: file.mimeType,
    });

    const previous = {
      path: user.avatarProviderFileId,
      sha: user.avatarSha,
    };

    await this.userRepo.updateAvatar(userId, {
      avatarUrl: uploaded.url,
      avatarProvider: this.storage.providerName,
      avatarProviderFileId: uploaded.path,
      avatarSha: uploaded.sha,
    });

    if (previous.path && previous.sha) {
      await this.storage.delete(previous.path, previous.sha);
    }

    return { avatarUrl: uploaded.url };
  }
}
