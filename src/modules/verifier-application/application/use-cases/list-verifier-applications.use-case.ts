import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type {
  VerifierApplicationListItem,
  VerifierApplicationStatus,
} from '../../domain/entities/verifier-application.entity';
import type { VerifierApplicationRepository } from '../../domain/repositories/verifier-application.repository';

export class ListVerifierApplicationsUseCase {
  constructor(private readonly appRepo: VerifierApplicationRepository) {}

  execute(filter: {
    status?: VerifierApplicationStatus;
    limit: number;
    cursor?: string;
  }): Promise<CursorPage<VerifierApplicationListItem>> {
    return this.appRepo.list(filter);
  }
}
