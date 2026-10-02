CREATE TYPE "public"."admin_area" AS ENUM('staff', 'access', 'rates', 'rules', 'budget_codes');--> statement-breakpoint
CREATE TABLE "admin_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"area" "admin_area" NOT NULL,
	"summary" text NOT NULL,
	"staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_events_created_idx" ON "admin_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_events_staff_idx" ON "admin_events" USING btree ("staff_id");