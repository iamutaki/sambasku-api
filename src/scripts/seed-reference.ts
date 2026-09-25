import 'dotenv/config';
import { eq, isNull } from 'drizzle-orm';
import { closeDb, db } from '@/shared/database/drizzle/client';
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
import {
  CSV_IMPORTER_EMAIL,
  CSV_IMPORTER_USER_ID,
  CSV_IMPORTER_USERNAME,
} from '@/shared/constants/csv-importer';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SEED_LANGUAGES = [
  { code: 'SBS', name: 'Sambas', nativeName: 'Sambas' },
  { code: 'IDN', name: 'Indonesia', nativeName: 'Bahasa Indonesia' },
] as const;

const SEED_DIALECTS = [
  { languageCode: 'SBS', code: 'umum', name: 'Umum', isDefault: true },
  { languageCode: 'SBS', code: 'kota', name: 'Sambas Kota', isDefault: false },
  { languageCode: 'SBS', code: 'pesisir', name: 'Sambas Pesisir', isDefault: false },
] as const;

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

/**
 * Seed referensi + user sistem.
 * Insert-if-missing saja — baris yang sudah ada tidak diubah (aman staging/prod).
 */
export async function seedReference(): Promise<void> {
  const hasher = new Pbkdf2PasswordService();

  // User sistem — password acak hanya saat insert pertama; skip jika id sudah ada.
  await db
    .insert(users)
    .values({
      id: ANONIM_USER_ID,
      username: ANONIM_USERNAME,
      displayName: ANONIM_USERNAME,
      email: ANONIM_EMAIL,
      passwordHash: await hasher.hash(crypto.randomUUID()),
      role: 'contributor',
      emailVerified: true,
    })
    .onConflictDoNothing({ target: users.id });
  logger.info(`Seed referensi: user sistem ${ANONIM_EMAIL} (skip jika sudah ada)`);

  await db
    .insert(users)
    .values({
      id: CSV_IMPORTER_USER_ID,
      username: CSV_IMPORTER_USERNAME,
      displayName: CSV_IMPORTER_USERNAME,
      email: CSV_IMPORTER_EMAIL,
      passwordHash: await hasher.hash(crypto.randomUUID()),
      role: 'contributor',
      emailVerified: true,
    })
    .onConflictDoNothing({ target: users.id });
  // Nama tampilan boleh berganti; password dan id tetap.
  await db
    .update(users)
    .set({
      username: CSV_IMPORTER_USERNAME,
      displayName: CSV_IMPORTER_USERNAME,
    })
    .where(eq(users.id, CSV_IMPORTER_USER_ID));
  logger.info(`Seed referensi: user sistem ${CSV_IMPORTER_EMAIL} (skip jika sudah ada)`);

  for (const lang of SEED_LANGUAGES) {
    await db.insert(languages).values({ ...lang }).onConflictDoNothing({ target: languages.code });
  }

  const smbLanguage = await db.query.languages.findFirst({ where: (l, { eq }) => eq(l.code, 'SBS') });
  if (!smbLanguage) {
    throw new Error('Bahasa SBS belum ada setelah seed languages');
  }

  for (const d of SEED_DIALECTS) {
    await db
      .insert(dialects)
      .values({
        languageId: smbLanguage.id,
        code: d.code,
        name: d.name,
        isDefault: d.isDefault,
      })
      .onConflictDoNothing({ target: [dialects.languageId, dialects.code] });
  }

  for (const wc of SEED_WORD_CLASSES) {
    await db.insert(wordClasses).values({ ...wc }).onConflictDoNothing({ target: wordClasses.code });
  }

  const existingCategoryNames = new Set(
    (await db.select({ name: categories.name }).from(categories).where(isNull(categories.deletedAt))).map(
      (r) => r.name,
    ),
  );
  const missingCategories = SEED_CATEGORIES.filter((cat) => !existingCategoryNames.has(cat.name));
  if (missingCategories.length > 0) {
    await db.insert(categories).values(missingCategories);
  }

  logger.info(
    `Seed referensi: ${SEED_LANGUAGES.length} bahasa, ${SEED_DIALECTS.length} dialek, ${SEED_WORD_CLASSES.length} kelas kata, ${SEED_CATEGORIES.length} kategori (${missingCategories.length} kategori baru)`,
  );
}

const isDirectRun =
  process.argv[1] != null && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  seedReference()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error(err, 'Seed reference gagal - pastikan database up dan sudah dimigrate');
      await closeDb().catch(() => {});
      process.exit(1);
    });
}
