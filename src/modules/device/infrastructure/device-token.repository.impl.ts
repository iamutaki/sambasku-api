import { and, eq, isNull, ne } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { deviceTokens } from '@/shared/database/drizzle/schema';
import type * as schema from '@/shared/database/drizzle/schema';
import type {
  DeviceTokenRecord,
  DeviceTokenRepository,
} from '../domain/repositories/device-token.repository';

function toRecord(row: {
  id: string;
  userId: string;
  udid: string;
  fcmToken: string;
}): DeviceTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    udid: row.udid,
    fcmToken: row.fcmToken,
  };
}

export class DeviceTokenRepositoryImpl implements DeviceTokenRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async register(userId: string, udid: string, fcmToken: string): Promise<DeviceTokenRecord> {
    return this.db.transaction(async (tx) => {
      const now = new Date();

      // Dedup: token yang sama aktif di udid lain → soft-delete dulu
      // (hindari unique partial violation + double push).
      await tx
        .update(deviceTokens)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(deviceTokens.fcmToken, fcmToken),
            isNull(deviceTokens.deletedAt),
            ne(deviceTokens.udid, udid),
          ),
        );

      const [existing] = await tx
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.udid, udid))
        .limit(1);

      if (existing) {
        const [updated] = await tx
          .update(deviceTokens)
          .set({
            userId,
            fcmToken,
            updatedAt: now,
            deletedAt: null,
          })
          .where(eq(deviceTokens.udid, udid))
          .returning();
        return toRecord(updated);
      }

      const [inserted] = await tx
        .insert(deviceTokens)
        .values({ userId, udid, fcmToken })
        .returning();
      return toRecord(inserted);
    });
  }

  async revoke(userId: string, udid: string): Promise<boolean> {
    const now = new Date();
    const updated = await this.db
      .update(deviceTokens)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(deviceTokens.udid, udid),
          eq(deviceTokens.userId, userId),
          isNull(deviceTokens.deletedAt),
        ),
      )
      .returning({ id: deviceTokens.id });
    return updated.length > 0;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const now = new Date();
    const updated = await this.db
      .update(deviceTokens)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(deviceTokens.userId, userId), isNull(deviceTokens.deletedAt)))
      .returning({ id: deviceTokens.id });
    return updated.length;
  }

  async listActiveFcmTokensByUserId(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ fcmToken: deviceTokens.fcmToken })
      .from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), isNull(deviceTokens.deletedAt)));
    return rows.map((r) => r.fcmToken);
  }
}
