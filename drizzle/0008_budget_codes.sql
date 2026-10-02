CREATE TYPE "public"."cost_type" AS ENUM('direct', 'indirect');--> statement-breakpoint
CREATE TABLE "accounts" (
	"number" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_number" text,
	"aplos_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aplos_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mileage_details" ADD COLUMN "parking_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_items" ADD COLUMN "cost_type" "cost_type";--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "fund_code" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "aplos_name" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "aplos_name" text;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_fund_code_funds_code_fk" FOREIGN KEY ("fund_code") REFERENCES "public"."funds"("code") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mileage_details" ADD CONSTRAINT "mileage_parking_range" CHECK ("mileage_details"."parking_cents" >= 0 and "mileage_details"."parking_cents" <= 50000);