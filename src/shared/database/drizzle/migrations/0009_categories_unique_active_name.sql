-- Dedupe kategori aktif bernama sama (seed lama membuat duplikat karena tidak
-- ada unique key). Pertahankan baris tertua per nama, relokasi relasi
-- word_categories, lalu hapus duplikat. Hanya menyentuh baris aktif.

--> statement-breakpoint
DELETE FROM word_categories wc
USING categories c
JOIN (
  SELECT DISTINCT ON (name) id, name
  FROM categories
  WHERE deleted_at IS NULL
  ORDER BY name, created_at ASC, id ASC
) k ON k.name = c.name AND c.id <> k.id
WHERE wc.category_id = c.id
  AND c.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM word_categories wc2 WHERE wc2.word_id = wc.word_id AND wc2.category_id = k.id);

--> statement-breakpoint
UPDATE word_categories wc
SET category_id = k.id
FROM categories c
JOIN (
  SELECT DISTINCT ON (name) id, name
  FROM categories
  WHERE deleted_at IS NULL
  ORDER BY name, created_at ASC, id ASC
) k ON k.name = c.name AND c.id <> k.id
WHERE wc.category_id = c.id
  AND c.deleted_at IS NULL;

--> statement-breakpoint
DELETE FROM categories c
USING (
  SELECT DISTINCT ON (name) id, name
  FROM categories
  WHERE deleted_at IS NULL
  ORDER BY name, created_at ASC, id ASC
) k
WHERE c.deleted_at IS NULL AND c.name = k.name AND c.id <> k.id;

--> statement-breakpoint
CREATE UNIQUE INDEX "categories_active_name_idx" ON "categories" USING btree ("name") WHERE deleted_at is null;
