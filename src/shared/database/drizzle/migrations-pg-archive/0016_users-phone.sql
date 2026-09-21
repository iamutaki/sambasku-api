-- Register: no HP opsional (digit internasional tanpa '+', mis. 62899…).
-- Unique hanya bila terisi (NULL boleh banyak - partial unique index).
ALTER TABLE "users" ADD COLUMN "phone" varchar(20);
CREATE UNIQUE INDEX "users_phone_unique" ON "users" ("phone") WHERE "phone" IS NOT NULL;
