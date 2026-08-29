drop policy "grow_logs_select_own" on public.grow_logs;
drop policy "grow_logs_insert_own" on public.grow_logs;
drop policy "grow_logs_update_own" on public.grow_logs;
drop policy "grow_logs_delete_own" on public.grow_logs;

create policy "grow_logs_select_own"
on public.grow_logs
for select
to authenticated
using (
  owner_id = (select auth.uid())
  and not exists (
    select 1
    from public.account_deletion_requests deletion
    where deletion.user_id = (select auth.uid())
      and deletion.soft_deleted_at is not null
  )
);

create policy "grow_logs_insert_own"
on public.grow_logs
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and not exists (
    select 1
    from public.account_deletion_requests deletion
    where deletion.user_id = (select auth.uid())
      and deletion.soft_deleted_at is not null
  )
);

create policy "grow_logs_update_own"
on public.grow_logs
for update
to authenticated
using (
  owner_id = (select auth.uid())
  and not exists (
    select 1
    from public.account_deletion_requests deletion
    where deletion.user_id = (select auth.uid())
      and deletion.soft_deleted_at is not null
  )
)
with check (
  owner_id = (select auth.uid())
  and not exists (
    select 1
    from public.account_deletion_requests deletion
    where deletion.user_id = (select auth.uid())
      and deletion.soft_deleted_at is not null
  )
);

create policy "grow_logs_delete_own"
on public.grow_logs
for delete
to authenticated
using (
  owner_id = (select auth.uid())
  and not exists (
    select 1
    from public.account_deletion_requests deletion
    where deletion.user_id = (select auth.uid())
      and deletion.soft_deleted_at is not null
  )
);
