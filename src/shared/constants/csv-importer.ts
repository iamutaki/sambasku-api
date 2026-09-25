// User sistem penampung atribusi impor massal (CSV / lembar admin).
// Kata yang diimpor memakai created_by user ini supaya jejak data jelas
// berasal dari impor, bukan dari akun admin yang menekan Simpan.
// ID ULID STABIL — idempoten di seeder, konsisten antar environment.
export const CSV_IMPORTER_USER_ID = '01CSVIMP'.padEnd(26, '0');
export const CSV_IMPORTER_USERNAME = 'Importir Data CSV';
export const CSV_IMPORTER_EMAIL = 'importir-csv@iamutaki.com';
