import 'dotenv/config';
import { closeDb } from '@/shared/database/drizzle/client';
import { logger } from '@/shared/logging/logger';
import { seedAccounts } from './seed-accounts';
import { seedReference } from './seed-reference';

/** Lokal/bootstrap: accounts lalu reference. Staging/prod pakai workflow terpisah. */
async function main() {
  await seedAccounts();
  await seedReference();
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error(err, 'Seed gagal - pastikan database up dan sudah dimigrate (pnpm drizzle-kit migrate)');
    await closeDb().catch(() => {});
    process.exit(1);
  });
