CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('employee', 'coordinator', 'finance', 'admin');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('open', 'exported', 'paid');--> statement-breakpoint
CREATE TYPE "public"."request_action" AS ENUM('submitted', 'withdrawn', 'resubmitted', 'approved', 'returned', 'denied', 'batched', 'unbatched', 'paid');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('draft', 'submitted', 'returned', 'approved', 'denied', 'batched', 'paid');--> statement-breakpoint
CREATE TYPE "public"."staff_source" AS ENUM('roster', 'request', 'seed');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"matched_staff_id" uuid,
	"status" "access_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" bigint GENERATED ALWAYS AS IDENTITY (sequence name "batches_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 101 CACHE 1),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "batch_status" DEFAULT 'open' NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exported_at" timestamp with time zone,
	"exported_by" uuid,
	"paid_on" date,
	"paid_by" uuid,
	CONSTRAINT "batches_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "mileage_details" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"from_place_id" uuid,
	"from_label" text NOT NULL,
	"from_address" text,
	"from_is_home" boolean DEFAULT false NOT NULL,
	"to_place_id" uuid,
	"to_label" text NOT NULL,
	"to_address" text,
	"to_is_home" boolean DEFAULT false NOT NULL,
	"stops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"round_trip" boolean DEFAULT false NOT NULL,
	"miles_estimated" numeric(7, 1),
	"miles" numeric(7, 1) NOT NULL,
	"override_reason" text,
	"rate_id" uuid,
	"rate_cents" numeric(7, 2) NOT NULL,
	CONSTRAINT "mileage_miles_positive" CHECK ("mileage_details"."miles" > 0),
	CONSTRAINT "mileage_override_needs_reason" CHECK ("mileage_details"."miles_estimated" is null or "mileage_details"."miles" = "mileage_details"."miles_estimated" or coalesce(btrim("mileage_details"."override_reason"), '') <> '')
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_type" text NOT NULL,
	"rate_cents" numeric(7, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "rates_type_effective_unique" UNIQUE("request_type","effective_from"),
	CONSTRAINT "rates_positive" CHECK ("rates"."rate_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "request_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"request_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"action" "request_action" NOT NULL,
	"from_status" "request_status",
	"to_status" "request_status" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_id" uuid,
	"item_date" date NOT NULL,
	"purpose" text NOT NULL,
	"program_id" uuid,
	"notes" text,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_items_amount_nonnegative" CHECK ("request_items"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "request_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" bigint GENERATED ALWAYS AS IDENTITY (sequence name "requests_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1),
	"request_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "request_status" DEFAULT 'draft' NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"employee_note" text,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "saved_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"is_home" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"source" "staff_source" NOT NULL,
	"coordinator_id" uuid,
	"default_program_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "staff_private" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_private_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"staff_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	CONSTRAINT "staff_roles_staff_id_role_pk" PRIMARY KEY("staff_id","role")
);
--> statement-breakpoint
CREATE TABLE "staff_state" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"updates_seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_matched_staff_id_staff_id_fk" FOREIGN KEY ("matched_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_exported_by_staff_id_fk" FOREIGN KEY ("exported_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_paid_by_staff_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mileage_details" ADD CONSTRAINT "mileage_details_item_id_request_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."request_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mileage_details" ADD CONSTRAINT "mileage_details_from_place_id_saved_places_id_fk" FOREIGN KEY ("from_place_id") REFERENCES "public"."saved_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mileage_details" ADD CONSTRAINT "mileage_details_to_place_id_saved_places_id_fk" FOREIGN KEY ("to_place_id") REFERENCES "public"."saved_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mileage_details" ADD CONSTRAINT "mileage_details_rate_id_rates_id_fk" FOREIGN KEY ("rate_id") REFERENCES "public"."rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rates" ADD CONSTRAINT "rates_request_type_request_types_id_fk" FOREIGN KEY ("request_type") REFERENCES "public"."request_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rates" ADD CONSTRAINT "rates_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_request_type_request_types_id_fk" FOREIGN KEY ("request_type") REFERENCES "public"."request_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_request_type_request_types_id_fk" FOREIGN KEY ("request_type") REFERENCES "public"."request_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_decided_by_staff_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_coordinator_id_staff_id_fk" FOREIGN KEY ("coordinator_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_default_program_id_programs_id_fk" FOREIGN KEY ("default_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_private" ADD CONSTRAINT "staff_private_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_state" ADD CONSTRAINT "staff_state_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "request_events_request_idx" ON "request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "request_items_owner_idx" ON "request_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "request_items_request_idx" ON "request_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "requests_owner_idx" ON "requests" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_batch_idx" ON "requests" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "saved_places_owner_idx" ON "saved_places" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "staff_coordinator_idx" ON "staff" USING btree ("coordinator_id");