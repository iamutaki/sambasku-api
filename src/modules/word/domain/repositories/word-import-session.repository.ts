import type { CursorPage } from '@/modules/word/domain/repositories/word.repository';
import type { NewWordImportSession, WordImportSession } from '../entities/word-import-session.entity';

export interface WordImportSessionRepository {
  upsert(session: NewWordImportSession): Promise<WordImportSession>;
  findById(id: string): Promise<WordImportSession | null>;
  list(filter: { limit: number; cursor?: string }): Promise<CursorPage<WordImportSession>>;
}
