import 'dotenv/config'; // script CLI jalan di Node - env.ts tidak lagi memuat dotenv
import { isNull } from 'drizzle-orm';
import { db, pool } from '@/shared/database/drizzle/client';
import {
  categories,
  dialects,
  languages,
  users,
  wordClasses,
} from '@/shared/database/drizzle/schema';
import { Pbkdf2PasswordService } from '@/modules/auth/infrastructure/pbkdf2-password.service';
import { logger } from '@/shared/logging/logger';
import { ANONIM_EMAIL, ANONIM_USER_ID, ANONIM_USERNAME } from '@/shared/constants/anonim';

// Seeder: user admin & root + data referensi form admin - jalankan: pnpm seed
// (butuh database sudah up + sudah dimigrate; idempoten, aman dijalankan berulang)
const SEED_USERS = [
  { username: 'admin', email: 'admin@email.com', role: 'admin' },
  { username: 'root', email: 'root@email.com', role: 'root' },
  // Untuk uji alur approval gate (Bruno http/auth/login-contributor.bru):
  // contributor → submit masuk antrean; reviewer → verifikator antrean
  { username: 'contributor', email: 'contributor@email.com', role: 'contributor' },
  { username: 'reviewer', email: 'reviewer@email.com', role: 'reviewer' },
] as const;

const SEED_PASSWORD = 'pass1234';

const SEED_LANGUAGES = [
  { code: 'SBS', name: 'Sambas', nativeName: 'Sambas' },
  { code: 'IDN', name: 'Indonesia', nativeName: 'Bahasa Indonesia' },
] as const;

const SEED_DIALECTS = [
  { languageCode: 'SBS', code: 'umum', name: 'Umum', isDefault: true },
  { languageCode: 'SBS', code: 'kota', name: 'Sambas Kota', isDefault: false },
  { languageCode: 'SBS', code: 'pesisir', name: 'Sambas Pesisir', isDefault: false },
] as const;

// Kelas kata lengkap (KBBI-aligned) + alias nama umum + keterangan.
// 'umum' = pilihan generik saat user belum tahu kelas katanya (fallback).
const SEED_WORD_CLASSES = [
  { code: 'n', name: 'Nomina', alias: 'Kata Benda', description: 'noun - kata yang menyebut orang, benda, tempat, atau konsep' },
  { code: 'v', name: 'Verba', alias: 'Kata Kerja', description: 'verb - kata yang menyatakan perbuatan atau tindakan' },
  { code: 'adj', name: 'Adjektiva', alias: 'Kata Sifat', description: 'adjective - kata yang menjelaskan sifat, keadaan, atau jumlah' },
  { code: 'adv', name: 'Adverbia', alias: 'Kata Keterangan', description: 'adverb - kata yang menjelaskan verba/adjektiva (waktu, tempat, cara, derajat)' },
  { code: 'pron', name: 'Pronomina', alias: 'Kata Ganti', description: 'pronoun - kata pengganti nomina (saya, kamu, dia, ini)' },
  { code: 'num', name: 'Numeralia', alias: 'Kata Bilangan', description: 'numeral - kata yang menyatakan jumlah atau urutan (satu, kedua)' },
  { code: 'prep', name: 'Preposisi', alias: 'Kata Depan', description: 'preposition - kata sebelum nomina (di, ke, dari, pada)' },
  { code: 'konj', name: 'Konjungsi', alias: 'Kata Sambung', description: 'conjunction - kata penghubung kata/klausa/kalimat (dan, tetapi, karena)' },
  { code: 'interj', name: 'Interjeksi', alias: 'Kata Seru', description: 'interjection - kata seru perasaan spontan (aduh, wah, hore)' },
  { code: 'art', name: 'Artikula', alias: 'Kata Sandang', description: 'article - kata pembatas nomina (si, sang)' },
  { code: 'part', name: 'Partikel', alias: 'Kata Tugas', description: 'particle - kata penegas, penanya, atau pembantu (kah, lah, pun)' },
  { code: 'umum', name: 'Umum', alias: 'Belum Diketahui', description: 'generic - dipilih saat kelas kata belum diketahui atau tidak yakin' },
] as const;

const SEED_CATEGORIES = [
  // Kelompok dasar - sesuai admin "Kategori / Glosarium" (opsional per kata)
  { name: 'Kekerabatan' },
  { name: 'Alam' },
  { name: 'Makanan' },
  { name: 'Binatang & Hewan' },
  { name: 'Tumbuhan & Tanaman' },
  { name: 'Tubuh & Kesehatan' },
  { name: 'Pakaian & Aksesori' },
  { name: 'Rumah & Bangunan' },
  { name: 'Pertanian & Perkebunan' },
  { name: 'Perikanan & Kelautan' },
  { name: 'Alat & Perkakas' },
  { name: 'Transportasi' },
  { name: 'Warna' },
  { name: 'Waktu & Musim' },
  { name: 'Cuaca' },
  { name: 'Geografi & Tempat' },
  { name: 'Seni & Budaya' },
  { name: 'Adat & Tradisi' },
  { name: 'Agama & Kepercayaan' },
  { name: 'Pekerjaan & Profesi' },
  { name: 'Aktivitas Harian' },
  { name: 'Sifat & Perasaan' },
  { name: 'Ekonomi & Perdagangan' },
  { name: 'Angka & Ukuran' },
  { name: 'Permainan & Hiburan' },
] as const;

async function main() {
  // Hash pakai service yang sama dengan register - tidak pernah simpan plain password
  const hasher = new Pbkdf2PasswordService();
  const passwordHash = await hasher.hash(SEED_PASSWORD);

  for (const user of SEED_USERS) {
    // Idempoten: kalau email sudah ada, update password/role - seeder aman dijalankan berulang
    await db
      .insert(users)
      .values({ ...user, passwordHash })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, role: user.role, updatedAt: new Date() },
      });
    logger.info(`Seeded user ${user.email} (role: ${user.role})`);
  }

  // User sistem Anonim - penampung kontribusi pengunjung tanpa login
  // (03-api-kontribusi-verifikasi.md). Password = acak permanen: akun ini
  // TIDAK bisa dipakai login; hanya sebagai atribusi created_by/user_id.
  await db
    .insert(users)
    .values({
      id: ANONIM_USER_ID,
      username: ANONIM_USERNAME,
      email: ANONIM_EMAIL,
      passwordHash: await hasher.hash(crypto.randomUUID()),
      role: 'contributor', // non-verifikator: submit selalu pending_review
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { role: 'contributor', updatedAt: new Date() },
    });
  logger.info(`Seeded user sistem ${ANONIM_EMAIL} (penampung kontribusi anonim)`);

  // Data referensi - upsert by key unik
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
      .values({
        languageId: smbLanguage!.id,
        code: d.code,
        name: d.name,
        isDefault: d.isDefault,
      })
      .onConflictDoUpdate({
        // Unique (language_id, code) - sync is_default saat re-seed
        target: [dialects.languageId, dialects.code],
        set: { name: d.name, isDefault: d.isDefault, updatedAt: new Date() },
      });
  }
  for (const wc of SEED_WORD_CLASSES) {
    await db
      .insert(wordClasses)
      .values({ ...wc })
      .onConflictDoUpdate({
        target: wordClasses.code,
        set: { name: wc.name, alias: wc.alias, description: wc.description },
      });
  }
  // Kategori TIDAK punya key unik selain PK - onConflictDoNothing() di sini
  // adalah no-op (tidak pernah konflik di PK karena ULID baru tiap insert),
  // itu sebabnya seed lama menumpuk duplikat. Solusi: cek-dulu lalu insert
  // yang belum ada; DB juga dijaga partial unique index pada name aktif
  // (migration 0009) untuk jalur tulis lain.
  const existingCategoryNames = new Set(
    (await db.select({ name: categories.name }).from(categories).where(isNull(categories.deletedAt))).map((r) => r.name),
  );
  const missingCategories = SEED_CATEGORIES.filter((cat) => !existingCategoryNames.has(cat.name));
  if (missingCategories.length > 0) {
    await db.insert(categories).values(missingCategories);
  }
  logger.info(`Seeded referensi: ${SEED_LANGUAGES.length} bahasa, ${SEED_DIALECTS.length} dialek, ${SEED_WORD_CLASSES.length} kelas kata, ${SEED_CATEGORIES.length} kategori`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error(err, 'Seed gagal - pastikan database up dan sudah dimigrate (pnpm drizzle-kit migrate)');
    await pool.end().catch(() => {});
    process.exit(1);
  });
