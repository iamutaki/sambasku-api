export interface DeviceTokenRecord {
  id: string;
  userId: string;
  udid: string;
  fcmToken: string;
}

export interface DeviceTokenRepository {
  /** Upsert by udid; soft-delete baris aktif lain dengan fcm_token sama. */
  register(userId: string, udid: string, fcmToken: string): Promise<DeviceTokenRecord>;
  /** Soft-delete satu device milik user. Return false jika tidak ditemukan. */
  revoke(userId: string, udid: string): Promise<boolean>;
  /** Soft-delete semua device aktif user (logout-all). */
  revokeAllForUser(userId: string): Promise<number>;
  /** Token FCM aktif untuk fan-out push. */
  listActiveFcmTokensByUserId(userId: string): Promise<string[]>;
}
