# Selected Log Diagnosis Context7 Documentation Notes

Research date: 2026-06-02

## Goal

Capture current Context7 documentation findings for the new technology surfaces needed to implement S-02 selected-log diagnosis. The baseline stack in `context/foundation/tech-stack.md` already includes Astro, React, TypeScript, Supabase, and Cloudflare Workers. This note covers the additional implementation details introduced by `context/changes/selected-log-diagnosis/technology-research.md`.

S-02 should let the user ask a question about one selected agar or grain grow log and receive scoped possible causes, suggested actions, uncertainty, or a follow-up question. The runtime should use only the selected grow log and the controlled internal agar/grain knowledge base.

## New or Expanded Technology Surfaces

Compared with the foundation stack, the selected-log diagnosis implementation adds or expands these surfaces:

- Vercel AI SDK package `ai`.
- OpenRouter provider package `@openrouter/ai-sdk-provider`.
- Zod as an explicit runtime validation and structured-output schema dependency.
- Supabase Postgres `pgvector` semantic search as a Supabase capability for indexing internal knowledge chunks.

Supabase itself is already part of the foundation stack. The new part is using vector columns, embedding similarity, and an RPC search function for retrieval.

## AI SDK Findings

Context7 library ID: `/vercel/ai`

Relevant documentation sources:

- `https://github.com/vercel/ai/blob/main/content/cookbook/05-node/60-embed-text.mdx`
- `https://github.com/vercel/ai/blob/main/content/providers/01-ai-sdk-providers/03-openai.mdx`
- `https://github.com/vercel/ai/blob/main/skills/develop-ai-functions-example/SKILL.md`

Key findings:

- Use `embed()` from `ai` to generate embeddings for a user/log query.
- Use `embedMany()` or repeated `embed()` calls during ingestion to generate embeddings for Markdown knowledge chunks.
- Use `generateObject()` from `ai` with a Zod schema for the diagnosis response contract.
- Use `@openrouter/ai-sdk-provider` for OpenRouter chat and embedding models.
- AI SDK examples show embedding calls returning both `embedding` and `usage`, which can be useful for logging or debugging ingestion cost.

Relevant API shape:

```ts
import { embed, generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  appName: "MycoHubAI",
});

const { embedding } = await embed({
  model: openrouter.embeddingModel("openai/text-embedding-3-small"),
  value: queryText,
});

const result = await generateObject({
  model: openrouter("openai/gpt-4o-mini"),
  schema: diagnosisResponseSchema,
  prompt,
});
```

Implementation implication for S-02:

- The API route should create one query embedding from the selected log title, selected log body, stage, and user question.
- The ingestion script should create chunk embeddings from repo-local Markdown knowledge files.
- The answer generation step should use structured output rather than free-form prose.

## Supabase pgvector Findings

Context7 library ID: `/supabase/supabase`

Relevant documentation sources:

- `https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/ai/vector-columns.mdx`
- `https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/ai/semantic-search.mdx`
- `https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/ai/rag-with-permissions.mdx`
- `https://github.com/supabase/supabase/blob/master/apps/www/_blog/2023-09-06-increase-performance-pgvector-hnsw.mdx`

Key findings:

- Supabase supports storing text sections/chunks with an `embedding vector(...)` column.
- Semantic search is commonly exposed through a Postgres function such as `match_documents`.
- The RPC accepts a query embedding, a similarity threshold, and a match count.
- Metadata filtering should be inside the SQL function. For S-02, that means filtering by `stage` before ranking or returning chunks.
- HNSW indexes can be added later for vector search performance when the corpus size or latency requires it.

S-02 table shape remains appropriate:

```sql
create table diagnosis_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_path text not null,
  source_heading text,
  stage text not null check (stage in ('agar', 'grain')),
  content text not null,
  content_hash text not null,
  chunk_index integer not null,
  embedding_model text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_path, chunk_index),
  unique (source_path, content_hash)
);
```

The `1536` dimension matches OpenRouter model id `openai/text-embedding-3-small` when using its default embedding size. If another embedding model or custom dimension is selected, the table, RPC argument type, and index must use the same dimension.

Suggested S-02 RPC shape:

```sql
create or replace function match_diagnosis_knowledge_chunks (
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
language sql stable
as $$
  select
    diagnosis_knowledge_chunks.id,
    diagnosis_knowledge_chunks.source_path,
    diagnosis_knowledge_chunks.source_heading,
    diagnosis_knowledge_chunks.stage,
    diagnosis_knowledge_chunks.content,
    1 - (diagnosis_knowledge_chunks.embedding <=> query_embedding) as similarity
  from diagnosis_knowledge_chunks
  where diagnosis_knowledge_chunks.stage = stage_filter
    and 1 - (diagnosis_knowledge_chunks.embedding <=> query_embedding) > match_threshold
  order by diagnosis_knowledge_chunks.embedding <=> query_embedding
  limit least(match_count, 20);
$$;
```

Implementation implication for S-02:

- Keep Markdown files as the canonical source of truth.
- Store Supabase rows as a reproducible search index, not as the only copy of the knowledge base.
- The ingestion script should upsert chunks by `source_path`, `chunk_index`, and/or `content_hash`.
- Runtime retrieval should call `.rpc("match_diagnosis_knowledge_chunks", ...)`, not fetch all chunks and filter in application code.

## Zod Findings

Context7 library ID: `/colinhacks/zod`

Relevant documentation sources:

- `https://github.com/colinhacks/zod/blob/main/README.md`
- `https://github.com/colinhacks/zod/blob/main/packages/docs-v3/README.md`

Key findings:

- Use `z.object(...)` to define request and response schemas.
- Use `z.enum(...)`, `z.array(...)`, nullable fields, and nested objects for the diagnosis output.
- Use `.parse(...)` for strict validation or `.safeParse(...)` when the route should return a controlled validation error.
- Use `z.infer<typeof schema>` to derive TypeScript types from schemas.

S-02 response schema shape:

```ts
import { z } from "zod";

export const diagnosisResponseSchema = z.object({
  scopeStatus: z.enum(["in_scope", "missing_context", "out_of_scope"]),
  possibleCauses: z.array(z.string()),
  suggestedActions: z.array(z.string()),
  confidenceBand: z.enum(["low", "medium", "high"]).nullable(),
  uncertainty: z.string(),
  followUpQuestion: z.string().nullable(),
  sources: z.array(
    z.object({
      sourcePath: z.string(),
      sourceHeading: z.string().nullable(),
    }),
  ),
});

export type DiagnosisResponse = z.infer<typeof diagnosisResponseSchema>;
```

Implementation implication for S-02:

- Use Zod for the incoming API request shape, including `growLogId` and `question`.
- Use the same Zod schema for AI SDK `generateObject()` and for server response typing.
- Align the schema with `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md` before implementation.

## Recommended S-02 Runtime Flow

```txt
User submits selected grow log question
  -> Astro API route validates request with Zod
  -> API route loads owner-scoped grow log from Supabase
  -> API route verifies stage is agar or grain
  -> API route builds retrieval text from stage + title + body + question
  -> AI SDK creates query embedding
  -> Supabase RPC searches matching stage-scoped knowledge chunks
  -> API route builds prompt from selected log + retrieved chunks + rubric rules
  -> AI SDK generateObject returns structured diagnosis response
  -> API route validates/returns the typed response
```

## Planning Notes

- Do not use live web search at runtime.
- Do not persist chat history for this change.
- Do not answer outside agar or grain.
- Keep retrieved sources attached to the output so diagnosis answers remain inspectable.
- Treat no-match retrieval as a first-class outcome: return `missing_context`, uncertainty, or a follow-up question instead of inventing missing knowledge.
- Add the HNSW index only when the chunk corpus is large enough or retrieval latency proves it is needed.
