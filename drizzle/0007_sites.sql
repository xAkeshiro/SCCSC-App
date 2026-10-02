-- Programs become "sites": the Aplos "Schools" tags (a school or site, which belongs to a fund).
-- A rename keeps every trip's and person's link. Constraint and policy names follow the new name.
alter table public.programs rename to sites;
--> statement-breakpoint
alter table public.sites rename constraint programs_pkey to sites_pkey;
--> statement-breakpoint
alter table public.sites rename constraint programs_code_unique to sites_code_unique;
--> statement-breakpoint
alter table public.request_items rename column program_id to site_id;
--> statement-breakpoint
alter table public.request_items rename constraint request_items_program_id_programs_id_fk to request_items_site_id_sites_id_fk;
--> statement-breakpoint
alter table public.staff rename column default_program_id to default_site_id;
--> statement-breakpoint
alter table public.staff rename constraint staff_default_program_id_programs_id_fk to staff_default_site_id_sites_id_fk;
--> statement-breakpoint
alter policy programs_select on public.sites rename to sites_select;
--> statement-breakpoint
alter policy programs_admin_insert on public.sites rename to sites_admin_insert;
--> statement-breakpoint
alter policy programs_admin_update on public.sites rename to sites_admin_update;
--> statement-breakpoint
alter policy programs_admin_delete on public.sites rename to sites_admin_delete;
--> statement-breakpoint
update public.settings set key = 'require_site', description = 'Every trip and phone bill must say which school or site it is for.'
  where key = 'require_program';
