// User sistem penampung kontribusi ANONIM (base-stack.md Section 22 +
// 03-api-kontribusi-verifikasi.md): pengunjung tanpa login submit lewat
// endpoint publik, semuanya diatribusikan ke user ini lalu masuk antrean
// review seperti kontributor biasa.
// ID ULID STABIL (bukan hasil generate) supaya bisa dirujuk kode,
// idempoten di seeder, dan konsisten antar environment.
export const ANONIM_USER_ID = '01ANONIM'.padEnd(26, '0');
export const ANONIM_USERNAME = 'anonim';
export const ANONIM_EMAIL = 'anonim@iamutaki.com';
