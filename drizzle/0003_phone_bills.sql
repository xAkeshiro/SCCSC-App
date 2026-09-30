ALTER TABLE "request_items" ADD CONSTRAINT "request_items_id_owner_unique" UNIQUE("id","owner_id");--> statement-breakpoint
CREATE TABLE "phone_details" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"month" date NOT NULL,
	"rate_id" uuid,
	"rate_cents" numeric(7, 2) NOT NULL,
	CONSTRAINT "phone_details_owner_month_unique" UNIQUE("owner_id","month"),
	CONSTRAINT "phone_details_first_of_month" CHECK (extract(day from "phone_details"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "phone_details" ADD CONSTRAINT "phone_details_rate_id_rates_id_fk" FOREIGN KEY ("rate_id") REFERENCES "public"."rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_details" ADD CONSTRAINT "phone_details_item_fk" FOREIGN KEY ("item_id","owner_id") REFERENCES "public"."request_items"("id","owner_id") ON DELETE cascade ON UPDATE no action;
