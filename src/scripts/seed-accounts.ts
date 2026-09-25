import 'dotenv/config';
import { closeDb, db } from '@/shared/database/drizzle/client';
import { users } from '@/shared/database/drizzle/schema';
import { Pbkdf2PasswordService } from '@/modules/auth/infrastructure/pbkdf2-password.service';
import { logger } from '@/shared/logging/logger';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** Akun login default — seed menimpa password jadi pass1234. */
const SEED_USERS = [
  { username: 'admin', email: 'admin@email.com', role: 'admin' },
  { username: 'root', email: 'root@email.com', role: 'root' },
  { username: 'contributor', email: 'contributor@email.com', role: 'contributor' },
  { username: 'reviewer', email: 'reviewer@email.com', role: 'reviewer' },
] as const;

const SEED_PASSWORD = 'pass1234';

/** Seed akun default (upsert password/role). Tidak menyentuh user sistem / referensi. */
export async function seedAccounts(): Promise<void> {
  const hasher = new Pbkdf2PasswordService();
  const passwordHash = await hasher.hash(SEED_PASSWORD);

  for (const user of SEED_USERS) {
    await db
      .insert(users)
      .values({ ...user, passwordHash, emailVerified: true, displayName: user.username })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, role: user.role, emailVerified: true, updatedAt: new Date() },
      });
    logger.info(`Seeded user ${user.email} (role: ${user.role})`);
  }
}

const isDirectRun =
  process.argv[1] != null && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  seedAccounts()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error(err, 'Seed accounts gagal - pastikan database up dan sudah dimigrate');
      await closeDb().catch(() => {});
      process.exit(1);
    });
}
