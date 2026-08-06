create table public.diagnosis_admission (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  active_claim_id uuid,
  active_expires_at timestamptz,
  check ((active_claim_id is null) = (active_expires_at is null))
);

create table public.diagnosis_admission_cooldowns (
  owner_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null check (length(fingerprint) = 64),
  claimed_at timestamptz not null,
  primary key (owner_id, fingerprint)
);

alter table public.diagnosis_admission enable row level security;
alter table public.diagnosis_admission_cooldowns enable row level security;

revoke all on table public.diagnosis_admission from public, anon, authenticated;
revoke all on table public.diagnosis_admission_cooldowns from public, anon, authenticated;
grant select, insert, update, delete on table public.diagnosis_admission to service_role;
grant select, insert, update, delete on table public.diagnosis_admission_cooldowns to service_role;

create or replace function public.claim_diagnosis_admission(
  p_fingerprint text,
  p_claim_id uuid
)
returns table (admitted boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from statement_timestamp()) / 600) * 600);
  v_state public.diagnosis_admission%rowtype;
  v_retry integer;
begin
  if v_owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid fingerprint' using errcode = '22023';
  end if;

  insert into public.diagnosis_admission (owner_id, window_started_at)
  values (v_owner_id, v_window_start)
  on conflict (owner_id) do nothing;

  select * into v_state
  from public.diagnosis_admission
  where owner_id = v_owner_id
  for update;

  if v_state.window_started_at <> v_window_start then
    update public.diagnosis_admission
    set window_started_at = v_window_start,
        attempt_count = 0
    where owner_id = v_owner_id;
    v_state.window_started_at := v_window_start;
    v_state.attempt_count := 0;
  end if;

  if v_state.active_claim_id is not null and v_state.active_expires_at > v_now then
    v_retry := greatest(1, ceil(extract(epoch from (v_state.active_expires_at - v_now)))::integer);
    return query select false, v_retry;
    return;
  end if;

  delete from public.diagnosis_admission_cooldowns
  where owner_id = v_owner_id
    and claimed_at <= v_now - interval '60 seconds';

  select greatest(1, ceil(extract(epoch from (claimed_at + interval '60 seconds' - v_now)))::integer)
  into v_retry
  from public.diagnosis_admission_cooldowns
  where owner_id = v_owner_id
    and fingerprint = p_fingerprint;

  if v_retry is not null then
    return query select false, v_retry;
    return;
  end if;

  if v_state.attempt_count >= 10 then
    v_retry := greatest(1, ceil(extract(epoch from (v_window_start + interval '10 minutes' - v_now)))::integer);
    return query select false, v_retry;
    return;
  end if;

  update public.diagnosis_admission
  set attempt_count = v_state.attempt_count + 1,
      active_claim_id = p_claim_id,
      active_expires_at = v_now + interval '2 minutes'
  where owner_id = v_owner_id;

  insert into public.diagnosis_admission_cooldowns (owner_id, fingerprint, claimed_at)
  values (v_owner_id, p_fingerprint, v_now)
  on conflict (owner_id, fingerprint)
  do update set claimed_at = excluded.claimed_at;

  return query select true, 0;
end;
$$;

create or replace function public.release_diagnosis_admission(p_claim_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.diagnosis_admission
  set active_claim_id = null,
      active_expires_at = null
  where owner_id = auth.uid()
    and active_claim_id = p_claim_id;
$$;

revoke execute on function public.claim_diagnosis_admission(text, uuid) from public, anon;
revoke execute on function public.release_diagnosis_admission(uuid) from public, anon;
grant execute on function public.claim_diagnosis_admission(text, uuid) to authenticated;
grant execute on function public.release_diagnosis_admission(uuid) to authenticated;
