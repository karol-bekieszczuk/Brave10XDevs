alter table public.account_deletion_requests
  add column processing_claim_id uuid,
  add column processing_expires_at timestamptz,
  add constraint account_deletion_processing_pair
    check ((processing_claim_id is null) = (processing_expires_at is null));

create or replace function public.claim_account_deletion_processing(
  p_user_id uuid,
  p_claim_id uuid
)
returns table (
  claimed boolean,
  user_id uuid,
  requested_at timestamptz,
  purge_after timestamptz,
  soft_deleted_at timestamptz,
  last_attempt_at timestamptz,
  attempt_count integer,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_state public.account_deletion_requests%rowtype;
begin
  insert into public.account_deletion_requests (user_id, requested_at, purge_after)
  values (p_user_id, v_now, v_now + interval '30 days')
  on conflict on constraint account_deletion_requests_pkey do nothing;

  select * into v_state
  from public.account_deletion_requests r
  where r.user_id = p_user_id
  for update;

  if v_state.soft_deleted_at is not null
     or (v_state.processing_claim_id is not null and v_state.processing_expires_at > v_now) then
    return query select false, v_state.user_id, v_state.requested_at, v_state.purge_after,
      v_state.soft_deleted_at, v_state.last_attempt_at, v_state.attempt_count, v_state.last_error;
    return;
  end if;

  update public.account_deletion_requests r
  set processing_claim_id = p_claim_id,
      processing_expires_at = v_now + interval '2 minutes',
      last_error = null
  where r.user_id = p_user_id;

  return query select true, v_state.user_id, v_state.requested_at, v_state.purge_after,
    v_state.soft_deleted_at, v_state.last_attempt_at, v_state.attempt_count, null::text;
end;
$$;

revoke execute on function public.claim_account_deletion_processing(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_processing(uuid, uuid) to service_role;

create or replace function public.finalize_account_deletion_processing(
  p_user_id uuid,
  p_claim_id uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns table (
  user_id uuid,
  requested_at timestamptz,
  purge_after timestamptz,
  soft_deleted_at timestamptz,
  last_attempt_at timestamptz,
  attempt_count integer,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if p_succeeded and p_error_code is not null then
    raise exception 'successful finalization cannot contain an error code' using errcode = '22023';
  end if;

  if not p_succeeded and p_error_code is distinct from 'admin_delete_failed' then
    raise exception 'invalid account deletion error code' using errcode = '22023';
  end if;

  return query
  update public.account_deletion_requests r
  set soft_deleted_at = case when p_succeeded then coalesce(r.soft_deleted_at, v_now) else r.soft_deleted_at end,
      last_attempt_at = v_now,
      attempt_count = r.attempt_count + 1,
      last_error = case when p_succeeded then null else p_error_code end,
      processing_claim_id = null,
      processing_expires_at = null
  where r.user_id = p_user_id
    and r.processing_claim_id = p_claim_id
  returning r.user_id, r.requested_at, r.purge_after, r.soft_deleted_at,
    r.last_attempt_at, r.attempt_count, r.last_error;
end;
$$;

revoke execute on function public.finalize_account_deletion_processing(uuid, uuid, boolean, text)
from public, anon, authenticated;
grant execute on function public.finalize_account_deletion_processing(uuid, uuid, boolean, text)
to service_role;

revoke select on table public.account_deletion_requests from authenticated;
grant select (user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count)
on table public.account_deletion_requests
to authenticated;
