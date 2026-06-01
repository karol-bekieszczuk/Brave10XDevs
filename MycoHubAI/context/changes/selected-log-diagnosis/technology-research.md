# Selected Log Diagnosis Technology Research

Research date: 2026-06-01

## Goal

Identify a pragmatic technology approach for adding an AI chat flow that answers a user's troubleshooting question against one selected grow log. The runtime should use the selected log title, selected log body, stage, and user question, then search only a controlled internal knowledge base before returning possible causes, suggested actions, and uncertainty.

The current product boundary excludes live web search, saved chat history, image analysis, species-specific advice, and diagnosis outside agar or grain stages.

The stack boundary comes from `context/foundation/tech-stack.md`: Astro SSR, React islands, TypeScript, Supabase, and Cloudflare Workers. The chosen approach should fit that stack without introducing a second application server, a separate product database, or a broad agent framework.

## Recommendation

Build a small custom retrieval-augmented generation (RAG) flow using the existing TypeScript, Astro, Supabase, and Cloudflare-oriented stack:

- Astro API route for the selected-log diagnosis endpoint.
- Vercel AI SDK (`ai`) for model calls, query/chunk embeddings, streaming if needed, and structured output.
- `@ai-sdk/openai` as the first provider package because the repo already has an `OPENAI_API_KEY` surface in Supabase config.
- Zod as an explicit application dependency for request validation and the diagnosis response schema.
- Supabase Postgres with `pgvector` for semantic search over the internal knowledge base.
- Repo-local Markdown files as the source of truth for diagnosis knowledge.
- A controlled ingestion script that chunks those Markdown files and writes embeddings into Supabase.

This fits the MVP better than a full agent framework because the workflow is narrow and deterministic: load one selected log, retrieve relevant internal context, generate a scoped answer, and validate the output shape.

Suggested dependencies for implementation:

```bash
npm install ai @ai-sdk/openai zod
```

## Proposed Architecture

```txt
User selects grow log and asks question
  -> Astro API route receives grow_log_id + question
  -> API route loads the owner-scoped grow log from Supabase
  -> API route checks stage is agar or grain
  -> Build retrieval query from stage + title + body + question
  -> Generate query embedding
  -> Supabase RPC searches diagnosis knowledge chunks with pgvector
  -> Prompt model with selected log + retrieved chunks + rubric rules
  -> AI SDK returns structured diagnosis output
  -> UI renders possible causes, actions, confidence band, uncertainty, or follow-up question
```

The runtime should not call Exa, perform live web search, or query arbitrary external sources. Exa is useful for implementation research only; the product behavior must stay bound to selected grow logs plus the internal agar/grain knowledge base.

## Knowledge Base Shape

Keep the canonical knowledge in Git-tracked Markdown files, for example:

```txt
context/diagnosis-knowledge/
  agar-contamination.md
  agar-healthy-growth.md
  grain-contamination.md
  grain-colonization-problems.md
```

Supabase should store the searchable index, not become the only source of truth. This keeps knowledge reviewable in pull requests and makes embeddings reproducible.

Suggested table shape:

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

The final embedding dimension depends on the chosen embedding model. If using OpenAI `text-embedding-3-small`, use 1536 dimensions unless deliberately opting into a smaller dimension. If using Supabase's built-in `gte-small` flow, dimensions differ. The schema, query RPC argument type, and index must match the selected model.

Use an HNSW index for the embedding column once there is enough data for retrieval latency to matter. Keep the first migration simple if the corpus is tiny, but design the table so the index can be added without reshaping the app contract.

## Retrieval Pattern

Use a Postgres RPC function for semantic search. Put stage filtering inside the SQL function rather than filtering after `.rpc()`, so the database can combine the stage predicate with vector ranking.

Expected API behavior:

- Retrieve only knowledge for the selected `stage`.
- Use a similarity threshold to avoid weak context.
- Return a small number of chunks, likely 3-8.
- If no strong chunks are found, ask a follow-up or return an uncertainty-forward answer instead of inventing a diagnosis.

The RPC should accept at least:

- `query_embedding`
- `stage_filter`
- `match_threshold`
- `match_count`

Do not call `.rpc(...).eq("stage", stage)` for the stage boundary. Supabase semantic search guidance recommends pushing selective metadata filters into the SQL function; post-filtering an RPC result can reduce recall and prevent the vector planner from combining the filter with similarity ranking.

## Diagnosis Output Contract

Use structured output rather than free-form prose. A future implementation can shape this with Zod:

```ts
const diagnosisResponseSchema = z.object({
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
```

This should be aligned with `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md` before implementation.

The backend should use AI SDK structured output (`generateObject` or the current equivalent structured-output API) so the route returns a typed object, not free-form model prose. The route can still render a conversational UI, but the server contract should remain structured enough to evaluate against the F-03 rubric cases.

## Options Considered

### Custom RAG with Supabase pgvector and AI SDK

Verdict: recommended for MVP.

Strengths:

- Matches the existing Astro, TypeScript, Supabase, and Cloudflare stack.
- Keeps runtime small and understandable.
- Avoids agent framework overhead.
- Gives direct control over stage filtering, owner-scoped log loading, and rubric prompts.
- Easy to evaluate against prepared cases.

Tradeoffs:

- Requires writing ingestion and retrieval glue code.
- The team owns chunking, re-indexing, and prompt assembly.
- Requires explicit model/provider secret management in Cloudflare Worker deployment.

### LlamaIndex.TS

Verdict: worth evaluating later if the knowledge base grows.

Strengths:

- Purpose-built for RAG and document querying.
- Provides document loading, indexing, query engine, and vector store abstractions.
- Good fit when ingestion complexity becomes the main problem.

Tradeoffs:

- Adds another framework layer.
- May be unnecessary while the knowledge base is small and controlled.
- The current MVP can likely implement the needed retrieval path directly with less code surface.

### LangChain.js

Verdict: not recommended for the first selected-log diagnosis implementation.

Strengths:

- Large ecosystem for tools, retrievers, loaders, and complex agent workflows.
- Useful if the product later needs multi-step agents, many external tools, or sophisticated orchestration.

Tradeoffs:

- Heavy abstraction surface for a narrow selected-log diagnosis flow.
- More moving parts to learn and maintain.
- Higher risk of implementing a generic agent instead of the PRD's constrained diagnosis behavior.

### Mastra

Verdict: not needed for MVP, but potentially relevant if future work needs durable workflows, built-in evals, memory, or observability.

Strengths:

- TypeScript-native agent and workflow framework.
- Stronger production workflow story than a bare AI SDK setup.
- Built-in concepts for tools, memory, workflows, and evals.

Tradeoffs:

- The current product explicitly avoids saved chat history.
- The diagnosis flow is request-scoped and should remain simple.
- Mastra also sits on top of AI SDK concepts, so starting with AI SDK keeps the dependency surface smaller.

### Cloudflare Workers AI and Vectorize

Verdict: plausible platform-aligned alternative, but not the first choice while grow logs and app data already live in Supabase.

Strengths:

- Strong Cloudflare Workers alignment.
- Cloudflare has first-party RAG examples using Workers AI, Vectorize, D1, and Workers.
- Could reduce external model provider dependency if Workers AI model quality is sufficient.

Tradeoffs:

- Splits data between Supabase and Cloudflare Vectorize/D1 unless carefully designed.
- Adds operational surfaces beyond the current Supabase-centered data model.
- Evaluation quality for mushroom troubleshooting still needs proof against the rubric cases.

### Cloudflare AI Search

Verdict: not recommended for S-02.

Strengths:

- Strong Cloudflare alignment.
- Managed search, hybrid search, vector index, and MCP-facing features can reduce retrieval infrastructure work.

Tradeoffs:

- Introduces a separate managed search surface while the selected grow log and app data already live in Supabase.
- The MVP needs a controlled internal agar/grain knowledge base, not broad agent-facing search.
- Adds product and deployment choices that are not required to prove selected-log diagnosis.

### Exa.ai

Verdict: useful for development research, not for product runtime.

Strengths:

- Good for current technology discovery and source fetching during planning.
- Useful when comparing libraries, docs, and current ecosystem tradeoffs.

Tradeoffs:

- Live web search is explicitly outside the S-02 product boundary.
- Runtime diagnosis must use only the selected grow log and controlled internal knowledge, not arbitrary web results.

## MVP Implementation Notes

- Do not add live web search to the runtime.
- Do not persist chat history; only persist grow logs and the knowledge index.
- Do not answer outside agar/grain scope.
- Always bind the answer to the selected log and stage.
- Prefer `generateObject` or structured output over free-form text for the backend contract.
- Include retrieved source references internally and optionally expose concise source labels in the UI.
- Make the ingestion script deterministic so a changed Markdown knowledge file can be re-embedded.
- Add evaluation against `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json` once the diagnosis endpoint exists.
- Keep the selected grow log owner-scoped through the existing Supabase access pattern before any diagnosis generation happens.
- Keep all diagnosis knowledge and returned answers constrained to `agar` and `grain`.
- Treat no-match retrieval as a first-class path: return `missing_context` or uncertainty rather than filling gaps.

## Compatibility Decision

The recommended implementation is compatible with `context/foundation/tech-stack.md` because it extends the existing app surfaces:

- Astro API route handles the S-02 POST endpoint.
- React island can provide the selected-log question UI if static Astro is not enough.
- Supabase remains the only product database and stores both grow logs and knowledge chunks.
- Cloudflare Workers remains the deployment target.
- TypeScript and Zod keep the route, prompt input, and diagnosis response typed.

The only new runtime dependency family is the AI SDK provider layer. This is smaller than adding LangChain, Mastra, LlamaIndex, Cloudflare Vectorize, or a standalone search platform for the first proof point.

## Sources

- Exa search result: AI Development Stack for JavaScript 2026, 2026-03-29: https://www.pkgpulse.com/guides/ai-development-stack-javascript-2026
- Exa search result: Vercel AI SDK vs Mastra vs LangChain.js comparison, 2026-03-23: https://vadimall.com/posts/vercel-ai-sdk-vs-mastra-vs-langchainjs-which-typescript-ai-framework
- Supabase semantic search documentation: https://supabase.com/docs/guides/ai/semantic-search
- Supabase Edge Function semantic search example: https://supabase.com/docs/guides/functions/examples/semantic-search
- Supabase vector querying documentation: https://supabase.com/docs/guides/storage/vector/querying-vectors
- AI SDK RAG Agent Guide: https://ai-sdk.dev/cookbook/guides/rag-chatbot
- Cloudflare Workers AI RAG tutorial: https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-retrieval-augmented-generation-ai/
- Context7 lookup: `/vercel/ai` for AI SDK `embed`, `embedMany`, `generateObject`, structured output, and provider dependency guidance.
- Context7 lookup: `/supabase/supabase` for Supabase `rpc()`, pgvector semantic search, metadata filtering inside SQL functions, and HNSW index guidance.
