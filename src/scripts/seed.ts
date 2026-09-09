import { db, pool } from '@/shared/database/drizzle/client';
import { users } from '@/shared/database/drizzle/schema';
import { Argon2PasswordService } from '@/modules/auth/infrastructure/argon2-password.service';
import { logger } from '@/shared/logging/logger';

// Seeder user admin & root — jalankan: pnpm seed
// (butuh database sudah up + sudah dimigrate)
const SEED_USERS = [
  { username: 'admin', email: 'admin@email.com', role: 'admin' },
  { username: 'root', email: 'root@email.com', role: 'root' },
] as const;

const SEED_PASSWORD = 'pass1234';

async function main() {
  // Hash pakai service yang sama dengan register — tidak pernah simpan plain password
  const hasher = new Argon2PasswordService();
  const passwordHash = await hasher.hash(SEED_PASSWORD);

  for (const user of SEED_USERS) {
    // Idempoten: kalau email sudah ada, update password/role — seeder aman dijalankan berulang
    await db
      .insert(users)
      .values({ ...user, passwordHash })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, role: user.role, updatedAt: new Date() },
      });
    logger.info(`Seeded user ${user.email} (role: ${user.role})`);
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error(err, 'Seed gagal — pastikan database up dan sudah dimigrate (pnpm drizzle-kit migrate)');
    await pool.end().catch(() => {});
    process.exit(1);
  });
