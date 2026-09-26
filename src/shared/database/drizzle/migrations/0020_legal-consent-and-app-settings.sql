CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE TABLE `legal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`document_type` text NOT NULL,
	`version` text NOT NULL,
	`title` text NOT NULL,
	`body_markdown` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_documents_type_version_uidx` ON `legal_documents` (`document_type`,`version`);--> statement-breakpoint
CREATE INDEX `legal_documents_type_status_idx` ON `legal_documents` (`document_type`,`status`);--> statement-breakpoint
CREATE TABLE `user_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_type` text NOT NULL,
	`document_version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`source` text NOT NULL,
	`client_id` text,
	`request_id` text,
	`ip` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `user_consents_user_type_accepted_idx` ON `user_consents` (`user_id`,`document_type`,`accepted_at`);--> statement-breakpoint
INSERT INTO `app_settings` (`key`, `value`, `updated_at`, `updated_by`) VALUES
	('oauth.write_enforcement', 'legacy_map', unixepoch() * 1000, NULL),
	('oauth.third_party_registration', 'closed', unixepoch() * 1000, NULL),
	('oauth.request_log_retention_days', '90', unixepoch() * 1000, NULL),
	('legal.terms_version', '2026-09-26', unixepoch() * 1000, NULL),
	('legal.privacy_version', '2026-09-26', unixepoch() * 1000, NULL);--> statement-breakpoint
INSERT INTO `legal_documents` (`id`, `document_type`, `version`, `title`, `body_markdown`, `status`, `published_at`, `created_by`, `updated_by`, `created_at`, `updated_at`) VALUES
(
	'01LEGALPRIVACY20260926001',
	'privacy',
	'2026-09-26',
	'Kebijakan Privasi',
	'# Kebijakan Privasi SambasKu

**Berlaku efektif:** 26 September 2026

Kebijakan Privasi ini menjelaskan bagaimana SambasKu mengumpulkan, menggunakan, menyimpan, dan melindungi informasi ketika Anda menggunakan situs web dan aplikasi SambasKu.

## 1. Pengontrol data

Pengontrol data adalah pengelola proyek SambasKu, kamus digital kolaboratif bahasa Melayu Sambas-Indonesia.

## 2. Cakupan

Kebijakan ini berlaku untuk situs web SambasKu, aplikasi seluler, dan layanan backend yang mendukung login, kamus, kontribusi, notifikasi, dan unggahan media.

## 3. Data yang kami kumpulkan

Jenis data bergantung pada fitur yang Anda gunakan. Kami tidak menjual data pribadi Anda.

- Akun dan autentikasi: email, username, kata sandi (hash), token sesi; data profil dasar dari Google/Facebook jika Anda memilih masuk dengan penyedia tersebut
- Konten yang Anda kirim: usulan kata, makna, contoh, komentar, laporan, lampiran media
- Perangkat dan notifikasi: pengenal perangkat, token push, preferensi
- Data teknis: alamat IP dan log permintaan untuk keamanan dan diagnosis

## 4. Tujuan pemrosesan

Data digunakan untuk menyediakan layanan kamus, autentikasi, memproses kontribusi, notifikasi yang Anda aktifkan, peningkatan produk, mencegah penyalahgunaan, dan kewajiban hukum.

## 5. Layanan pihak ketiga

Kami menggunakan penyedia (misalnya Google, Cloudflare, Turso, Resend) sejauh diperlukan untuk menjalankan layanan. Aplikasi pihak ketiga yang Anda izinkan lewat OAuth Sambasku dapat mengakses data sesuai lingkup yang Anda setujui.

## 6. Retensi dan penghapusan

Data akun disimpan selama akun aktif. Anda dapat menghapus akun lewat aplikasi atau situs. Entri kamus yang sudah tayang dapat tetap ada tanpa identitas akun.

## 7. Hak Anda

Anda dapat meminta akses, koreksi, penghapusan, atau menarik persetujuan sesuai hukum yang berlaku. Hubungi pengelola melalui saluran resmi SambasKu.

## 8. Perubahan kebijakan

Kami dapat memperbarui kebijakan ini. Versi aktif ditampilkan di layanan; perubahan material dapat meminta Anda menyetujui ulang sebelum melanjutkan penggunaan fitur tertentu.
',
	'published',
	unixepoch() * 1000,
	NULL,
	NULL,
	unixepoch() * 1000,
	NULL
),
(
	'01LEGALSTERMS202609260001',
	'terms',
	'2026-09-26',
	'Syarat dan Ketentuan',
	'# Syarat dan Ketentuan SambasKu

**Berlaku efektif:** 26 September 2026

Dengan membuat akun atau menggunakan SambasKu, Anda menyetujui syarat berikut.

## 1. Layanan

SambasKu adalah kamus digital kolaboratif. Fitur mencakup pencarian, kontribusi, komentar, pemberian suara (upvote/downvote), dan notifikasi.

## 2. Akun

Anda bertanggung jawab menjaga kerahasiaan kredensial. Akun yang melanggar ketentuan dapat dinonaktifkan.

## 3. Kontribusi dan konten

Konten yang Anda kirim harus sesuai hukum dan norma komunitas. Kami dapat meninjau, menolak, atau menghapus konten yang melanggar.

## 4. Pemberian suara

Arah suara (naik/turun) harus mencerminkan penilaian Anda yang jujur. Memanipulasi suara secara sistematis atau menyesatkan pengguna lain tentang arti aksi di aplikasi dilarang.

## 5. Aplikasi pihak ketiga

Akses tulis atas nama Anda hanya diizinkan melalui aplikasi resmi SambasKu atau aplikasi pihak ketiga yang Anda izinkan secara eksplisit lewat layar izin OAuth Sambasku. Menyalahgunakan API atau menampilkan label aksi yang menyesatkan dilarang dan dapat berakibat pencabutan akses aplikasi serta penonaktifan akun.

## 6. Perubahan

Kami dapat memperbarui syarat ini. Versi aktif ditampilkan di layanan; perubahan material dapat meminta persetujuan ulang.
',
	'published',
	unixepoch() * 1000,
	NULL,
	NULL,
	unixepoch() * 1000,
	NULL
);
