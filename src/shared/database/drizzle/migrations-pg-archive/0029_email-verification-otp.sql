ALTER TABLE "users" ADD COLUMN "email_verified" boolean;--> statement-breakpoint
UPDATE "users" SET "email_verified" = true WHERE "email_verified" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET NOT NULL;--> statement-breakpoint
CREATE TABLE "email_verification_otps" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_verification_otps" ADD CONSTRAINT "email_verification_otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_verification_otps_user_unique" ON "email_verification_otps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_otps_user_idx" ON "email_verification_otps" USING btree ("user_id");
