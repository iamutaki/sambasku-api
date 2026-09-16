import { lt, sql } from 'drizzle-orm';
import { db, pool } from '@/shared/database/drizzle/client';
import { passwordResetTokens, refreshTokens } from '@/shared/database/drizzle/schema';
import { logger } from '@/shared/logging/logger';

// Bersihkan token expired — jalankan berkala via cron/scheduler.
// Hanya menghapus baris yang SUDAH LEWAT expires_at (bukan soft-delete:
// token adalah data ephemeral per Section 7).
async function main() {
  const now = new Date();

  const [expiredRefresh] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(refreshTokens)
    .where(lt(refreshTokens.expiresAt, now));

  const [expiredReset] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, now));

  await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now));
  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));

  logger.info(
    `Cleanup: ${expiredRefresh?.count ?? 0} refresh_tokens + ${expiredReset?.count ?? 0} password_reset_tokens expired dihapus`,
  );
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error({ err }, 'Cleanup gagal');
    await pool.end().catch(() => {});
    process.exit(1);
  });
