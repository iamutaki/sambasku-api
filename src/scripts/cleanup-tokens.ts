import 'dotenv/config'; // script CLI jalan di Node - env.ts tidak lagi memuat dotenv
import { count, lt } from 'drizzle-orm';
import { closeDb, db } from '@/shared/database/drizzle/client';
import { passwordResetTokens, refreshTokens } from '@/shared/database/drizzle/schema';
import { logger } from '@/shared/logging/logger';

// Bersihkan token expired - jalankan berkala via cron/scheduler.
// Hanya menghapus baris yang SUDAH LEWAT expires_at (bukan soft-delete:
// token adalah data ephemeral per Section 7).
async function main() {
  const now = new Date();

  // helper count() - typed resmi drizzle (hasil bigint dipetakan jadi number)
  const [expiredRefresh] = await db
    .select({ count: count() })
    .from(refreshTokens)
    .where(lt(refreshTokens.expiresAt, now));

  const [expiredReset] = await db
    .select({ count: count() })
    .from(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, now));

  await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now));
  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));

  logger.info(
    `Cleanup: ${expiredRefresh?.count ?? 0} refresh_tokens + ${expiredReset?.count ?? 0} password_reset_tokens expired dihapus`,
  );
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error({ err }, 'Cleanup gagal');
    await closeDb().catch(() => {});
    process.exit(1);
  });
