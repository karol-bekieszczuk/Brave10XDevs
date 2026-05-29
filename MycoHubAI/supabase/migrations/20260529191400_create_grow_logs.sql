create table public.grow_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  stage text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grow_logs_stage_check check (stage in ('agar', 'grain')),
  constraint grow_logs_title_not_blank check (btrim(title) <> ''),
  constraint grow_logs_body_not_blank check (btrim(body) <> '')
);

create index grow_logs_owner_id_idx on public.grow_logs (owner_id);
create index grow_logs_owner_updated_at_idx on public.grow_logs (owner_id, updated_at desc);

create function public.set_grow_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_grow_logs_updated_at
before update on public.grow_logs
for each row
execute function public.set_grow_logs_updated_at();

alter table public.grow_logs enable row level security;

create policy "grow_logs_select_own"
on public.grow_logs
for select
to authenticated
using (owner_id = auth.uid());

create policy "grow_logs_insert_own"
on public.grow_logs
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "grow_logs_update_own"
on public.grow_logs
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "grow_logs_delete_own"
on public.grow_logs
for delete
to authenticated
using (owner_id = auth.uid());
