-- Index A-Z list (18-api-list-words.md): lower(lemma) COLLATE "C", id.
-- File ini sempat berisi dump skema 0020-0024 (CREATE TABLE word_edit_suggestions
-- ulang, ADD COLUMN yang sudah ada). drizzle-kit generate memakai snapshot 0023
-- sebagai baseline karena 0024 tidak punya snapshot - CI migrate di DB kosong gagal.
CREATE INDEX "words_lemma_az_idx" ON "words" USING btree ((lower("lemma") COLLATE "C"), "id");
