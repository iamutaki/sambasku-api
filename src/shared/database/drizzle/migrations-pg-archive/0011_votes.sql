CREATE TABLE "votes" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(26) NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "votes_user_target_unique" ON "votes" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "votes_target_idx" ON "votes" USING btree ("entity_type","entity_id");