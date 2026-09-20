import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors/app-error';
import type { UserRepository } from '@/modules/auth/domain/repositories/user.repository';
import type { SocialLink, VerifierApplication } from '../../domain/entities/verifier-application.entity';
import type { VerifierApplicationRepository } from '../../domain/repositories/verifier-application.repository';

export interface ResubmitVerifierApplicationCommand {
  userId: string;
  role: string;
  phone: string;
  address: string;
  socialLinks: SocialLink[];
}

export class ResubmitVerifierApplicationUseCase {
  constructor(
    private readonly appRepo: VerifierApplicationRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async execute(cmd: ResubmitVerifierApplicationCommand): Promise<VerifierApplication> {
    if (cmd.role !== 'contributor') {
      throw new ForbiddenError(
        'ALREADY_VERIFIER',
        'Hanya kontributor yang dapat memperbaiki pengajuan',
      );
    }

    const existing = await this.appRepo.findByUserId(cmd.userId);
    if (!existing) {
      throw new NotFoundError(
        'VERIFIER_APPLICATION_NOT_FOUND',
        'Pengajuan verifikator tidak ditemukan',
      );
    }
    if (existing.status !== 'rejected') {
      throw new ConflictError(
        'VERIFIER_APPLICATION_NOT_REJECTED',
        'Pengajuan hanya bisa diperbaiki setelah ditolak',
      );
    }

    const phoneOwner = await this.userRepo.findByPhone(cmd.phone);
    if (phoneOwner && phoneOwner.id !== cmd.userId) {
      throw new ConflictError('PHONE_ALREADY_EXISTS', 'Nomor HP sudah terdaftar');
    }

    const updated = await this.appRepo.resubmitWithPhone(cmd.userId, {
      phone: cmd.phone,
      address: cmd.address,
      socialLinks: cmd.socialLinks,
    });
    if (!updated) {
      throw new ConflictError(
        'VERIFIER_APPLICATION_NOT_REJECTED',
        'Pengajuan hanya bisa diperbaiki setelah ditolak',
      );
    }
    return updated;
  }
}
