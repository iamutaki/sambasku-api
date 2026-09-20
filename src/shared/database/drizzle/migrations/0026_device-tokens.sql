CREATE TABLE "device_tokens" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"udid" text NOT NULL,
	"fcm_token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_udid_unique" ON "device_tokens" USING btree ("udid");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_active_fcm_token_idx" ON "device_tokens" USING btree ("fcm_token") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "device_tokens_active_user_id_idx" ON "device_tokens" USING btree ("user_id") WHERE deleted_at is null;
