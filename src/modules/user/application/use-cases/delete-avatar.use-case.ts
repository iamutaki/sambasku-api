import type { PublicImageStoragePort } from '@/modules/public-image/application/ports/public-image-storage.port';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
import { NotFoundError } from '@/shared/errors/app-error';

export class DeleteAvatarUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly storage: PublicImageStoragePort,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt) {
      throw new NotFoundError('USER_NOT_FOUND', 'User tidak ditemukan');
    }

    const path = user.avatarProviderFileId;
    const sha = user.avatarSha;

    await this.userRepo.clearAvatar(userId);

    if (path && sha) {
      await this.storage.delete(path, sha);
    }
  }
}
