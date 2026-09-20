import { NotFoundError } from '@/shared/errors/app-error';
import type { VerifierApplication } from '../../domain/entities/verifier-application.entity';
import type { VerifierApplicationRepository } from '../../domain/repositories/verifier-application.repository';

export class GetVerifierApplicationDetailUseCase {
  constructor(private readonly appRepo: VerifierApplicationRepository) {}

  async execute(id: string): Promise<VerifierApplication> {
    const row = await this.appRepo.findById(id);
    if (!row) {
      throw new NotFoundError(
        'VERIFIER_APPLICATION_NOT_FOUND',
        'Pengajuan verifikator tidak ditemukan',
      );
    }
    return row;
  }
}
