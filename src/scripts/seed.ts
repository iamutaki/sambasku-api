import { db, pool } from '@/shared/database/drizzle/client';
import {
  categories,
  dialects,
  languages,
  users,
  wordClasses,
} from '@/shared/database/drizzle/schema';
import { Argon2PasswordService } from '@/modules/auth/infrastructure/argon2-password.service';
import { logger } from '@/shared/logging/logger';

// Seeder: user admin & root + data referensi form admin — jalankan: pnpm seed
// (butuh database sudah up + sudah dimigrate; idempoten, aman dijalankan berulang)
const SEED_USERS = [
  { username: 'admin', email: 'admin@email.com', role: 'admin' },
  { username: 'root', email: 'root@email.com', role: 'root' },
] as const;

const SEED_PASSWORD = 'pass1234';

const SEED_LANGUAGES = [
  { code: 'SBS', name: 'Sambas', nativeName: 'Sambas' },
  { code: 'IDN', name: 'Indonesia', nativeName: 'Bahasa Indonesia' },
] as const;

const SEED_DIALECTS = [
  { languageCode: 'SBS', code: 'umum', name: 'Umum' },
  { languageCode: 'SBS', code: 'kota', name: 'Sambas Kota' },
  { languageCode: 'SBS', code: 'pesisir', name: 'Sambas Pesisir' },
] as const;

const SEED_WORD_CLASSES = [
  { code: 'n', name: 'Nomina' },
  { code: 'v', name: 'Verba' },
  { code: 'adj', name: 'Adjektiva' },
  { code: 'adv', name: 'Adverbia' },
] as const;

const SEED_CATEGORIES = [
  { name: 'Kekerabatan' },
  { name: 'Alam' },
  { name: 'Makanan' },
] as const;

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

  // Data referensi — upsert by key unik
  for (const lang of SEED_LANGUAGES) {
    await db
      .insert(languages)
      .values({ ...lang })
      .onConflictDoUpdate({ target: languages.code, set: { name: lang.name } });
  }
  const smbLanguage = await db.query.languages.findFirst({ where: (l, { eq }) => eq(l.code, 'SBS') });
  for (const d of SEED_DIALECTS) {
    await db
      .insert(dialects)
      .values({ languageId: smbLanguage!.id, code: d.code, name: d.name })
      .onConflictDoNothing();
  }
  for (const wc of SEED_WORD_CLASSES) {
    await db
      .insert(wordClasses)
      .values({ ...wc })
      .onConflictDoUpdate({ target: wordClasses.code, set: { name: wc.name } });
  }
  for (const cat of SEED_CATEGORIES) {
    await db
      .insert(categories)
      .values({ ...cat })
      .onConflictDoNothing(); // tidak ada key unik selain PK — skip kalau sudah ada
  }
  logger.info(`Seeded referensi: ${SEED_LANGUAGES.length} bahasa, ${SEED_DIALECTS.length} dialek, ${SEED_WORD_CLASSES.length} kelas kata, ${SEED_CATEGORIES.length} kategori`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error(err, 'Seed gagal — pastikan database up dan sudah dimigrate (pnpm drizzle-kit migrate)');
    await pool.end().catch(() => {});
    process.exit(1);
  });
