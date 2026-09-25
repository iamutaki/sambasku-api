import { CSV_IMPORTER_USER_ID } from '@/shared/constants/csv-importer';
import { NotFoundError } from '@/shared/errors/app-error';
import type {
  NewWordImportSession,
  WordImportSession,
  WordImportSessionItem,
  WordImportSessionStatus,
} from '../../domain/entities/word-import-session.entity';
import type { WordImportSessionRepository } from '../../domain/repositories/word-import-session.repository';

export class SaveWordImportSessionUseCase {
  constructor(private readonly repo: WordImportSessionRepository) {}

  async execute(input: {
    id: string;
    triggeredBy: string;
    sourceLabel?: string | null;
    status: WordImportSessionStatus;
    total: number;
    createdCount: number;
    duplicatesCount: number;
    meaningsAddedCount: number;
    invalidCount: number;
    items: WordImportSessionItem[];
  }): Promise<WordImportSession> {
    const payload: NewWordImportSession = {
      id: input.id,
      triggeredBy: input.triggeredBy,
      attributedTo: CSV_IMPORTER_USER_ID,
      sourceLabel: input.sourceLabel,
      status: input.status,
      total: input.total,
      createdCount: input.createdCount,
      duplicatesCount: input.duplicatesCount,
      meaningsAddedCount: input.meaningsAddedCount,
      invalidCount: input.invalidCount,
      items: input.items,
      finishedAt: new Date(),
    };
    return this.repo.upsert(payload);
  }
}

export class ListWordImportSessionsUseCase {
  constructor(private readonly repo: WordImportSessionRepository) {}

  async execute(input: { limit?: number; cursor?: string }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    return this.repo.list({ limit, cursor: input.cursor });
  }
}

export class GetWordImportSessionUseCase {
  constructor(private readonly repo: WordImportSessionRepository) {}

  async execute(id: string): Promise<WordImportSession> {
    const session = await this.repo.findById(id);
    if (!session) throw new NotFoundError('NOT_FOUND', 'Sesi impor tidak ditemukan');
    return session;
  }
}
