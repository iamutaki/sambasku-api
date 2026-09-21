-- 14-api-search-miss-moderation: gate tayang beranda + koreksi term
-- Default false untuk SEMUA baris (termasuk existing) - admin harus
-- izinkan tayang dulu. Tidak ada grandfather ke true.
ALTER TABLE "search_misses" ADD COLUMN "is_visible" boolean DEFAULT false NOT NULL;
