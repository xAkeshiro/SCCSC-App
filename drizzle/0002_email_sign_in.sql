ALTER TABLE "access_requests" ALTER COLUMN "phone_e164" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_private" ALTER COLUMN "phone_e164" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "staff_private" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "staff_private" ADD CONSTRAINT "staff_private_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_contact" CHECK ("access_requests"."phone_e164" is not null or "access_requests"."email" is not null);--> statement-breakpoint
ALTER TABLE "staff_private" ADD CONSTRAINT "staff_private_contact" CHECK ("staff_private"."phone_e164" is not null or "staff_private"."email" is not null);--> statement-breakpoint
ALTER TABLE "staff_private" ADD CONSTRAINT "staff_private_email_lower" CHECK ("staff_private"."email" = lower("staff_private"."email"));