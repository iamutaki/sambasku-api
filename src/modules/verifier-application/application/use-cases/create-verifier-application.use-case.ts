import { ConflictError, ForbiddenError } from '@/shared/errors/app-error';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
import type { SocialLink, VerifierApplication } from '../../domain/entities/verifier-application.entity';
import type { VerifierApplicationRepository } from '../../domain/repositories/verifier-application.repository';

export interface CreateVerifierApplicationCommand {
  userId: string;
  role: string;
  phone: string;
  address: string;
  socialLinks: SocialLink[];
}

export class CreateVerifierApplicationUseCase {
  constructor(
    private readonly appRepo: VerifierApplicationRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async execute(cmd: CreateVerifierApplicationCommand): Promise<VerifierApplication> {
    if (cmd.role !== 'contributor') {
      throw new ForbiddenError(
        'ALREADY_VERIFIER',
        'Hanya kontributor yang dapat mengajukan jadi verifikator',
      );
    }

    const existing = await this.appRepo.findByUserId(cmd.userId);
    if (existing) {
      throw new ConflictError(
        'APPLICATION_ALREADY_EXISTS',
        'Pengajuan verifikator sudah ada. Perbaiki lewat formulir jika ditolak.',
      );
    }

    const phoneOwner = await this.userRepo.findByPhone(cmd.phone);
    if (phoneOwner && phoneOwner.id !== cmd.userId) {
      throw new ConflictError('PHONE_ALREADY_EXISTS', 'Nomor HP sudah terdaftar');
    }

    return this.appRepo.createWithPhone({
      userId: cmd.userId,
      phone: cmd.phone,
      address: cmd.address,
      socialLinks: cmd.socialLinks,
    });
  }
}
