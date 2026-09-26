import { eq, inArray } from 'drizzle-orm';
import { appSettings } from '@/shared/database/drizzle/schema';
import type { AppDatabase } from '@/shared/database/drizzle/client';
import {
  LEGAL_PRIVACY_VERSION_KEY,
  LEGAL_TERMS_VERSION_KEY,
  type AppSetting,
  type LegalActiveVersions,
} from '../domain/entities/app-setting.entity';
import type { AppSettingsRepository } from '../domain/repositories/app-settings.repository';

function toEntity(row: typeof appSettings.$inferSelect): AppSetting {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export class AppSettingsRepositoryImpl implements AppSettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  async getAll(): Promise<AppSetting[]> {
    const rows = await this.db.select().from(appSettings);
    return rows.map(toEntity);
  }

  async getByKeys(keys: readonly string[]): Promise<AppSetting[]> {
    if (keys.length === 0) return [];
    const rows = await this.db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, [...keys]));
    return rows.map(toEntity);
  }

  async getValue(key: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    return row?.value ?? null;
  }

  async getLegalActiveVersions(): Promise<LegalActiveVersions | null> {
    const rows = await this.getByKeys([LEGAL_TERMS_VERSION_KEY, LEGAL_PRIVACY_VERSION_KEY]);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const termsVersion = map[LEGAL_TERMS_VERSION_KEY];
    const privacyVersion = map[LEGAL_PRIVACY_VERSION_KEY];
    if (!termsVersion || !privacyVersion) return null;
    return { termsVersion, privacyVersion };
  }

  async upsertMany(
    entries: { key: string; value: string }[],
    updatedBy: string | null,
  ): Promise<AppSetting[]> {
    const now = new Date();
    const results: AppSetting[] = [];
    for (const entry of entries) {
      const [row] = await this.db
        .insert(appSettings)
        .values({
          key: entry.key,
          value: entry.value,
          updatedAt: now,
          updatedBy,
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: entry.value,
            updatedAt: now,
            updatedBy,
          },
        })
        .returning();
      results.push(toEntity(row));
    }
    return results;
  }
}
