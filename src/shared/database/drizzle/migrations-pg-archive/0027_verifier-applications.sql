CREATE TABLE "verifier_applications" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"social_links" jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"admin_comment" text,
	"reviewed_by" varchar(26),
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "verifier_applications" ADD CONSTRAINT "verifier_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifier_applications" ADD CONSTRAINT "verifier_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verifier_applications_user_id_unique" ON "verifier_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifier_applications_status_id_idx" ON "verifier_applications" USING btree ("status","id");
