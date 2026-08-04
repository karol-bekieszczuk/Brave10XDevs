grant select, insert, update, delete
on table public.grow_logs
to authenticated;

grant select
on table public.account_deletion_requests
to authenticated;

grant select, insert, update, delete
on table public.grow_logs, public.account_deletion_requests
to service_role;
