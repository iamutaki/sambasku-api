import type { AppDatabase, AppTransaction } from '@/shared/database/drizzle/client';
import type { NewUserConsent, UserConsent } from '../entities/user-consent.entity';
import type { ConsentDocumentType } from '../entities/user-consent.entity';

export type DbExecutor = AppDatabase | AppTransaction;

export interface UserConsentRepository {
  insertMany(rows: NewUserConsent[], executor?: DbExecutor): Promise<UserConsent[]>;
  findLatestByUser(
    userId: string,
    documentType: ConsentDocumentType,
  ): Promise<UserConsent | null>;
  deleteByUserId(userId: string, executor?: DbExecutor): Promise<void>;
}
