create policy "account_deletion_requests_select_own"
on public.account_deletion_requests
for select
to authenticated
using (user_id = auth.uid());
