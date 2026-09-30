CREATE TABLE "request_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_attachments_size" CHECK ("request_attachments"."size_bytes" > 0 and "request_attachments"."size_bytes" <= 5242880 and "request_attachments"."size_bytes" = octet_length("request_attachments"."data")),
	CONSTRAINT "request_attachments_type" CHECK ("request_attachments"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'))
);
--> statement-breakpoint
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_attachments_request_idx" ON "request_attachments" USING btree ("request_id");