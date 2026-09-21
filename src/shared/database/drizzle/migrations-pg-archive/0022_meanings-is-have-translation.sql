-- is_have_translation: false = makna punya definisi tanpa padanan kata IDN.
ALTER TABLE "meanings" ADD COLUMN IF NOT EXISTS "is_have_translation" boolean DEFAULT true NOT NULL;
