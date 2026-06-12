create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '30 days'),
  soft_deleted_at timestamptz,
  last_attempt_at timestamptz,
  attempt_count integer not null default 0,
  last_error text
);

create index account_deletion_requests_purge_after_idx on public.account_deletion_requests (purge_after);

alter table public.account_deletion_requests enable row level security;
