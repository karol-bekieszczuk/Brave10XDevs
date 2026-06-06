create extension if not exists vector with schema extensions;

create table public.diagnosis_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_path text not null,
  source_heading text,
  stage text not null,
  content text not null,
  content_hash text not null,
  chunk_index integer not null,
  embedding_model text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diagnosis_knowledge_chunks_stage_check check (stage in ('agar', 'grain')),
  constraint diagnosis_knowledge_chunks_content_not_blank check (btrim(content) <> ''),
  constraint diagnosis_knowledge_chunks_source_path_not_blank check (btrim(source_path) <> ''),
  constraint diagnosis_knowledge_chunks_content_hash_not_blank check (btrim(content_hash) <> ''),
  constraint diagnosis_knowledge_chunks_chunk_index_nonnegative check (chunk_index >= 0),
  constraint diagnosis_knowledge_chunks_source_chunk_unique unique (source_path, chunk_index),
  constraint diagnosis_knowledge_chunks_source_hash_unique unique (source_path, content_hash)
);

create index diagnosis_knowledge_chunks_stage_idx
on public.diagnosis_knowledge_chunks (stage);

create function public.set_diagnosis_knowledge_chunks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_diagnosis_knowledge_chunks_updated_at
before update on public.diagnosis_knowledge_chunks
for each row
execute function public.set_diagnosis_knowledge_chunks_updated_at();

alter table public.diagnosis_knowledge_chunks enable row level security;

revoke all on table public.diagnosis_knowledge_chunks from anon;
revoke all on table public.diagnosis_knowledge_chunks from authenticated;

create or replace function public.match_diagnosis_knowledge_chunks(
  query_embedding vector(1536),
  stage_filter text,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  source_path text,
  source_heading text,
  stage text,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    diagnosis_knowledge_chunks.id,
    diagnosis_knowledge_chunks.source_path,
    diagnosis_knowledge_chunks.source_heading,
    diagnosis_knowledge_chunks.stage,
    diagnosis_knowledge_chunks.content,
    1 - (diagnosis_knowledge_chunks.embedding <=> query_embedding) as similarity
  from public.diagnosis_knowledge_chunks
  where diagnosis_knowledge_chunks.stage = stage_filter
    and diagnosis_knowledge_chunks.stage in ('agar', 'grain')
    and 1 - (diagnosis_knowledge_chunks.embedding <=> query_embedding) >= match_threshold
  order by diagnosis_knowledge_chunks.embedding <=> query_embedding
  limit least(greatest(match_count, 0), 20);
$$;

revoke all on function public.match_diagnosis_knowledge_chunks(vector(1536), text, float, int) from public;
grant execute on function public.match_diagnosis_knowledge_chunks(vector(1536), text, float, int) to authenticated;
grant execute on function public.match_diagnosis_knowledge_chunks(vector(1536), text, float, int) to service_role;
