import { UnauthorizedError } from '@/shared/errors/app-error';
import type { User } from '@/modules/auth/domain/entities/user.entity';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
import type { UpdateMyProfileDto } from '../dto/update-my-profile.dto';

export interface MyProfileResult {
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
}

function toMyProfile(user: User): MyProfileResult {
  return {
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
  };
}

export class GetMyProfileUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(userId: string): Promise<MyProfileResult> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Sesi tidak valid');
    }
    return toMyProfile(user);
  }
}

export class UpdateMyProfileUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(userId: string, dto: UpdateMyProfileDto): Promise<MyProfileResult> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Sesi tidak valid');
    }

    const updated = await this.userRepo.updateProfile(userId, {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
      ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
    });

    return toMyProfile(updated);
  }
}
