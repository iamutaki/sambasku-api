-- Backfill: makna ikut submit kata tertinggal pending_review setelah approve
-- (publishWordChildren tidak meng-update meanings). GET publik memfilter
-- status='published' → meanings:[] → definition/translations hilang.
--
-- Guard: hanya kata published yang BELUM punya makna published. Usul definisi
-- pending pada kata yang sudah tayang (antrean meaning) tidak ikut.
UPDATE "meanings" AS m
SET
	"status" = 'published',
	"is_verified" = true,
	"updated_at" = now()
FROM "words" AS w
WHERE m.word_id = w.id
	AND w.status = 'published'
	AND w.deleted_at IS NULL
	AND m.deleted_at IS NULL
	AND m.status = 'pending_review'
	AND NOT EXISTS (
		SELECT 1
		FROM "meanings" AS published
		WHERE published.word_id = m.word_id
			AND published.deleted_at IS NULL
			AND published.status = 'published'
	);
