import type { AppSetting, AppSettingKey, LegalActiveVersions } from '../entities/app-setting.entity';

export interface AppSettingsRepository {
  getAll(): Promise<AppSetting[]>;
  getByKeys(keys: readonly string[]): Promise<AppSetting[]>;
  getValue(key: string): Promise<string | null>;
  getLegalActiveVersions(): Promise<LegalActiveVersions | null>;
  upsertMany(
    entries: { key: AppSettingKey | string; value: string }[],
    updatedBy: string | null,
  ): Promise<AppSetting[]>;
}
