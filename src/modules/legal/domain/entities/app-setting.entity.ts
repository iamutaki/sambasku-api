/** Keys yang diizinkan di app_settings (admin PATCH whitelist). */
export const APP_SETTING_KEYS = [
  'oauth.third_party_registration',
  'oauth.request_log_retention_days',
  'legal.terms_version',
  'legal.privacy_version',
] as const;

export type AppSettingKey = (typeof APP_SETTING_KEYS)[number];

export const LEGAL_TERMS_VERSION_KEY = 'legal.terms_version' as const;
export const LEGAL_PRIVACY_VERSION_KEY = 'legal.privacy_version' as const;

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface LegalActiveVersions {
  termsVersion: string;
  privacyVersion: string;
}
