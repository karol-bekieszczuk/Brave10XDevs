# Selected Log Diagnosis Implementation Plan

## Overview

Build roadmap slice S-02: the owner can ask one troubleshooting question about one selected `agar` or `grain` grow log and receive a scoped, uncertainty-forward diagnosis response. The flow uses the selected log plus a controlled internal knowledge base, not live web search, saved chat history, image analysis, or unsupported cultivation scope.

## Current State Analysis

The repo already has the selected-log prerequisite from S-01: `/grow-logs/[id]` loads one owner-scoped grow log through `getOwnerGrowLog`, and the grow-log contract is limited to `agar` and `grain`. F-03 also already defines the quality contract and 10 prepared evaluation cases for selected-log diagnosis. What is missing is the diagnosis runtime: AI SDK dependencies, provider env surfaces, diagnosis schemas, canonical knowledge files, pgvector storage/RPC, ingestion, a JSON diagnosis API route, a React island on the selected-log detail page, and an evaluation runner.

## Desired End State

The owner can open a single grow log detail page, submit one troubleshooting question, and receive one final structured diagnosis JSON rendered as a readable UI result. The API validates request and response shapes, loads only the authenticated owner's selected log, retrieves only same-stage knowledge chunks, returns `missing_context` when retrieval or log detail is insufficient, and never answers outside the agar/grain MVP boundary. Local verification includes unit tests, mocked provider/service tests, and a runner against the F-03 prepared cases; production provider secrets remain a manual deployment step.

### Key Discoveries:

- `context/foundation/roadmap.md:26` defines S-02 as the north-star proof point: diagnosis for one selected agar or grain grow log.
- `context/changes/selected-log-diagnosis/change.md:12` requires owner-scoped, text-only, selected-log diagnosis with no live web search, saved chat history, image analysis, or non-agar/grain troubleshooting.
- `src/lib/grow-logs/repository.ts:48` already provides `getOwnerGrowLog`, filtering by both `id` and `owner_id`.
- `src/pages/grow-logs/[id].astro:7` already loads the selected grow log detail page through the server Supabase client.
- `src/pages/api/grow-logs/create.ts:20` shows the current API convention: uppercase `POST`, `context.locals.user`, `createClient`, and guarded error handling.
- `package.json:15` uses `ai`, `@openrouter/ai-sdk-provider`, and `zod` for the selected-log diagnosis runtime.
- `astro.config.mjs:20` and `src/lib/runtime-env.ts:8` currently expose Supabase and `AUTHORIZED_USER_ID`, not an AI provider secret.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:10` defines `scope_class` as `in_scope`, `missing_context`, `mixed_scope`, or `out_of_scope`.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md:152` forbids missing-context follow-ups from asking for smell, photos, saved chat history, species-specific details, or multi-log comparisons.
- `context/foundation/lessons.md:30` repeats the accepted rule: never ask or suggest that the user check agar or grain by smell.

## What We're NOT Doing

- No live web search, Exa runtime call, arbitrary external source lookup, or broad agent framework.
- No saved chat history, persisted diagnosis conversations, background diagnosis jobs, polling workflow, or durable task queue.
- No image/photo upload, image analysis, species identification, fruiting-stage advice, sharing, social features, export, or full multi-user account product surface.
- No streaming response in the MVP. The API returns one validated JSON object after retrieval and generation complete.
- No direct browser/client reads of the diagnosis knowledge chunk table. Runtime retrieval goes through the RPC surface.
- No HNSW/vector performance tuning unless the small MVP corpus proves it is needed.
- No production verification claim before the Cloudflare provider secret is configured and a deployed smoke test is actually run.
- No feature flag. If implementation later adds one, it must include an explicit kill date per `context/foundation/lessons.md`.

## Implementation Approach

Use a small custom RAG flow inside the existing Astro/Supabase/Cloudflare stack. Add typed diagnosis contracts first, then add a repo-local knowledge corpus under `lib/diagnosis/knowledge/` and a reproducible Supabase pgvector index. The backend remains request-scoped: validate JSON input, authenticate through existing middleware, load the selected owner grow log, embed the selected log plus question, retrieve same-stage chunks through an RPC, generate a Zod-validated response with the AI SDK, and return one final JSON payload. The UI is a compact React island on `/grow-logs/[id]` that renders structured response sections and retryable error states.

## Critical Implementation Details

### User Experience Spec

The diagnosis UI lives on the selected grow-log detail page and must visibly bind the question to the current log. It should show loading, retryable error, confidence, uncertainty, follow-up, possible causes, suggested actions, and concise source labels without saving the exchange as chat history.

### State Sequencing

The API must authenticate and load the owner-scoped grow log before embedding, retrieval, or generation. If the log is missing or not owned by the user, the route returns a controlled JSON error and does not call the model provider.

### Debug And Observability

The service should expose enough internal structure for local evaluation: source metadata, scope status, and validation errors. Do not log full grow-log bodies or user questions in production-oriented logs.

## Phase 1: AI Runtime Contract And Environment

### Overview

Add the minimal runtime dependency and type contract needed before any retrieval or UI work begins.

### Changes Required:

#### 1. Runtime dependencies

**File**: `package.json`

**Intent**: Add the packages needed for structured AI calls and runtime validation.

**Contract**: Add `ai`, `@openrouter/ai-sdk-provider`, and `zod` as dependencies. Keep the dependency surface smaller than LangChain, Mastra, or LlamaIndex for this MVP.

#### 2. Provider environment contract

**File**: `astro.config.mjs`

**File**: `src/lib/runtime-env.ts`

**File**: `.env.example`

**File**: `wrangler.jsonc`

**File**: `.dev.vars`

**Intent**: Make the AI provider secret available to server-only Astro/Cloudflare code while keeping production secret configuration dashboard-owned.

**Contract**: Add an `OPENROUTER_API_KEY` provider key surface that mirrors the current Supabase/AUTHORIZED_USER_ID pattern. Document the committed local example in `.env.example`, add the required Worker secret name to `wrangler.jsonc` `secrets.required`, and treat `.dev.vars` as the uncommitted local Worker secret file. The plan and implementation must state that the Cloudflare production secret is configured manually through the Cloudflare dashboard or Wrangler and cannot be proven by local code alone.

#### 3. Diagnosis request and response schemas

**File**: `src/lib/diagnosis/schema.ts`

**Intent**: Define stable JSON contracts for the API request, model output, service output, and UI rendering.

**Contract**: Include request fields for `growLogId` and `question`. The response schema must include `scopeStatus` with `in_scope`, `missing_context`, `mixed_scope`, and `out_of_scope`; possible causes; suggested actions; nullable confidence band; uncertainty; nullable follow-up question; and source labels. Use `z.infer` to derive TypeScript types.

#### 4. Diagnosis error contract

**File**: `src/lib/diagnosis/errors.ts`

**Intent**: Keep model/provider failures, validation failures, missing selected logs, and retrieval failures out of successful diagnosis responses.

**Contract**: Define controlled error categories that the API can serialize as retryable or non-retryable JSON errors. Provider errors, timeouts, and invalid model output should produce a controlled error without showing an unvalidated diagnosis.

### Success Criteria:

#### Automated Verification:

- Dependencies include `ai`, `@openrouter/ai-sdk-provider`, and `zod`.
- Provider secret is declared in server-only env config, runtime-env accessors, and `wrangler.jsonc` required secrets.
- `.env.example` documents the local provider secret name.
- Diagnosis response schema includes `mixed_scope`.
- Diagnosis schema rejects unsupported `scopeStatus` values.
- Diagnosis schema unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- Provider secret handling is documented as committed env alignment plus local `.dev.vars` and manual Cloudflare secret configuration.
- No production verification is claimed before the production secret is configured.
- The schema contract visibly matches F-03 outcome categories.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding progress checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Knowledge Corpus And Supabase Retrieval

### Overview

Create the controlled internal knowledge source, a deterministic ingestion path, and a narrow Supabase RPC retrieval surface.

### Changes Required:

#### 1. Canonical diagnosis knowledge files

**File**: `lib/diagnosis/knowledge/*.md`

**Intent**: Store the initial controlled agar/grain troubleshooting knowledge as Git-tracked product knowledge.

**Contract**: Add a small corpus covering agar contamination, agar healthy/slow growth, grain moisture/stall signs, and grain post-shake recovery. Content must stay text-only, stage-scoped, uncertainty-forward, and must not include smell checks, species identification, image analysis, fruiting advice, or sharing/social features.

#### 2. Knowledge chunking and ingestion script

**File**: `scripts/ingest-diagnosis-knowledge.ts`

**File**: `package.json`

**Intent**: Convert the canonical Markdown knowledge into deterministic Supabase rows with embeddings.

**Contract**: Read from `lib/diagnosis/knowledge/`, chunk by stable headings or bounded text sections, compute content hashes, generate embeddings with the selected embedding model, and upsert rows by `source_path`, `chunk_index`, and/or `content_hash`. The script should be rerunnable without duplicating chunks. Add `tsx` as the TypeScript script runner if it is not already installed, and add a project-owned custom npm script named `diagnosis:ingest` that runs `tsx scripts/ingest-diagnosis-knowledge.ts`.

#### 3. Diagnosis knowledge migration

**File**: `supabase/migrations/<timestamp>_create_diagnosis_knowledge_chunks.sql`

**Intent**: Add the pgvector-backed table and RPC needed for stage-scoped semantic retrieval.

**Contract**: Enable/use the `vector` extension according to the existing Supabase migration style, create `diagnosis_knowledge_chunks` with snake_case columns, constrain `stage` to `agar` or `grain`, store embedding model and content hash metadata, enable RLS, and prevent direct browser/client table reads. Create `match_diagnosis_knowledge_chunks` with `query_embedding`, `stage_filter`, `match_threshold`, and `match_count`; retrieval filtering by stage must happen inside the SQL function. The access model must expose runtime retrieval only through this RPC surface. If the RPC uses `security definer`, set a narrow `search_path` and document the required grants/revokes in the migration.

#### 4. Retrieval repository and mappers

**File**: `src/lib/diagnosis/retrieval.ts`

**Intent**: Keep RPC invocation and snake_case to camelCase mapping out of API route code.

**Contract**: Expose a function that calls only `match_diagnosis_knowledge_chunks`, maps `source_path`/`source_heading` to `sourcePath`/`sourceHeading`, and returns a bounded list of retrieved chunks with similarity. Do not expose direct table reads to UI code.

### Success Criteria:

#### Automated Verification:

- Knowledge Markdown files exist under `lib/diagnosis/knowledge/`.
- Search confirms knowledge files contain no smell-check instructions.
- `package.json` defines `diagnosis:ingest` for `scripts/ingest-diagnosis-knowledge.ts`.
- Migration creates `diagnosis_knowledge_chunks`, enables RLS/no direct client table reads, and exposes `match_diagnosis_knowledge_chunks`.
- RPC contract includes `stage_filter`, `match_threshold`, and `match_count`.
- Retrieval mapper converts snake_case source metadata to camelCase.
- Retrieval contract tests pass with a mocked Supabase client: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- Knowledge content is reviewable as product knowledge, not hidden only in database rows.
- Runtime retrieval is RPC-only, stage-scoped, and backed by explicit table/RPC grants or revokes.
- HNSW/performance indexing remains deferred unless corpus size or latency justifies it.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Diagnosis Service And JSON API

### Overview

Build the backend end-to-end diagnosis path while keeping it request-scoped and owner-scoped.

### Changes Required:

#### 1. Prompt and guardrail builder

**File**: `src/lib/diagnosis/prompt.ts`

**Intent**: Assemble the selected log, user question, retrieved chunks, and F-03 guardrails into a stable generation input.

**Contract**: The prompt contract must include selected log stage/title/body, user question, retrieved same-stage chunks, and explicit guardrails for uncertainty, selected-log dependency, missing context, mixed scope, out-of-scope redirects, no smell checks, no photos/image analysis, no species-specific advice, no saved chat history, and no multi-log comparison.

#### 2. AI provider service

**File**: `src/lib/diagnosis/provider.ts`

**Intent**: Isolate AI SDK calls from request handling and make provider behavior mockable.

**Contract**: Generate the query embedding from selected log stage/title/body plus question, and generate the structured response with the current AI SDK structured-output API for the installed major version. Return controlled errors for provider failures, timeouts, and invalid structured output.

#### 3. Diagnosis orchestration service

**File**: `src/lib/diagnosis/service.ts`

**Intent**: Own the full backend sequence from selected-log context to diagnosis response.

**Contract**: Validate input, load the selected owner grow log, confirm the stage is `agar` or `grain`, retrieve same-stage chunks, call structured generation, validate output, and return either a diagnosis response or controlled error. If no strong chunks are found, return `missing_context` or uncertainty-forward behavior rather than inventing a diagnosis.

#### 4. JSON diagnosis API route

**File**: `src/pages/api/diagnosis/selected-log.ts`

**Intent**: Expose the selected-log diagnosis flow to the React island through one final JSON response.

**Contract**: Export uppercase `POST`. Use `context.locals.user`, `createClient`, guarded `try/catch`, and the diagnosis request schema. Return JSON, not redirects. Do not call retrieval or generation before user and selected-log ownership are confirmed.

#### 5. Mocked service tests

**File**: `src/lib/diagnosis/*.test.ts`

**Intent**: Protect orchestration behavior without making unit tests depend on live OpenRouter or live Supabase.

**Contract**: Mock provider and retrieval boundaries. Cover owner-scoped missing log behavior, unsupported/missing request validation, no-match retrieval behavior, structured output validation, provider error handling, and prompt guardrail inclusion.

### Success Criteria:

#### Automated Verification:

- API route exports uppercase `POST` and returns JSON.
- API validates `growLogId` and `question` before service execution.
- Service loads selected log through the owner-scoped repository contract before embedding or generation.
- Prompt tests confirm guardrails for uncertainty, mixed scope, out-of-scope, no smell, no photo/image analysis, no species advice, and no saved chat history.
- No-match retrieval path returns `missing_context` or uncertainty-forward behavior instead of invented diagnosis.
- Provider failure path returns a controlled retryable error without unvalidated diagnosis content.
- Mocked full service-flow tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- API behavior is intentionally a new JSON convention, while still preserving local auth/client/error-handling patterns.
- Missing or non-owned grow log IDs do not trigger embedding, retrieval, or model calls.
- Response contract remains compatible with the F-03 prepared cases.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Selected-Log UI On Detail Page

### Overview

Add the user-visible selected-log diagnosis panel to the existing grow-log detail page.

### Changes Required:

#### 1. Diagnosis React island

**File**: `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx`

**Intent**: Provide a compact interactive question-and-answer panel bound to the selected grow log.

**Contract**: Accept the selected `growLogId` and enough display metadata to show the user which log is being diagnosed. Include textarea, submit button, loading state, controlled error state with retry, and structured rendering for scope status, possible causes, suggested actions, confidence band, uncertainty, follow-up question, and concise source labels.

#### 2. Detail page integration

**File**: `src/pages/grow-logs/[id].astro`

**Intent**: Place the diagnosis panel on the selected grow-log detail page without creating a separate diagnosis route.

**Contract**: Render the React island only when a log exists. Preserve the existing owner-scoped detail behavior, edit link, delete form, timestamps, and body rendering. The page should not persist chat history or add diagnosis fields to the grow-log record.

#### 3. UI state and accessibility tests

**File**: `src/components/diagnosis/*.test.tsx`

**Intent**: Protect the interaction state machine and prevent raw JSON/debug output from becoming the user-facing proof point.

**Contract**: Test empty-question behavior, loading state, successful structured rendering, retryable error rendering, and source label display using mocked fetch responses. Do not require a browser/E2E harness unless the existing test setup already supports it cleanly.

### Success Criteria:

#### Automated Verification:

- `/grow-logs/[id]` renders the diagnosis panel only for an existing owner-scoped log.
- UI submits one JSON request to the selected-log diagnosis endpoint.
- UI displays loading and retryable error states.
- UI renders possible causes, suggested actions, confidence, uncertainty, follow-up question, and source labels from structured JSON.
- UI tests pass with mocked API responses: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- Owner can ask a question from a selected grow-log detail page and see a readable diagnosis result.
- Source labels are concise and understandable.
- The UI does not show raw JSON/debug output.
- The UI does not create saved chat history or mutate the grow-log body/title/stage.
- Text and controls fit cleanly on desktop and mobile widths.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: F-03 Evaluation And Final Scope Audit

### Overview

Verify the runtime against the prepared diagnosis quality cases and audit the final implementation for MVP guardrails.

### Changes Required:

#### 1. Prepared-case evaluation runner

**File**: `scripts/evaluate-diagnosis-cases.ts`

**File**: `package.json`

**Intent**: Exercise the diagnosis contract against the 10 F-03 prepared cases.

**Contract**: Read `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`, execute each case through a local evaluation path, and report pass/fail signals for scope class, selected-log dependency, uncertainty, missing-context behavior, mixed-scope refusal, out-of-scope redirect, and no critical failures. The runner may use mocked/stubbed retrieval where needed to keep local verification deterministic, but it must clearly distinguish deterministic contract checks from live model quality checks. Add a project-owned custom npm script named `diagnosis:evaluate` that runs `tsx scripts/evaluate-diagnosis-cases.ts`.

#### 2. Runtime scope audit

**File**: `context/changes/selected-log-diagnosis/plan.md`

**Intent**: Keep final verification tied to the plan's mechanical Progress section and explicit scope guardrails.

**Contract**: During implementation, `/10x-implement` flips only Progress checkboxes and appends closing commit SHAs. Final verification searches must confirm no live web runtime, saved chat history persistence, image/photo upload, species advice, smell checks, sharing, export, or fruiting-stage support was introduced.

#### 3. Deployment handoff note

**File**: `.env.example`

**File**: `context/changes/selected-log-diagnosis/plan.md`

**Intent**: Preserve the boundary between local verification and production deployment readiness.

**Contract**: Document that Cloudflare production requires the AI provider secret to be configured manually through the Cloudflare dashboard or Wrangler before deployed smoke testing can pass. Do not mark production diagnosis as verified from local tests alone.

### Success Criteria:

#### Automated Verification:

- Evaluation runner reads all 10 F-03 prepared cases.
- Evaluation runner reports the four scope classes: `in_scope`, `missing_context`, `mixed_scope`, and `out_of_scope`.
- Evaluation runner distinguishes PRD accuracy cases from guardrail-only cases using `counts_toward_prd_accuracy`.
- `package.json` defines `diagnosis:evaluate` for `scripts/evaluate-diagnosis-cases.ts`.
- Search confirms no smell-check guidance exists in diagnosis prompts, knowledge files, or UI copy.
- Search confirms no live web search, saved chat history persistence, image/photo upload, species advice, sharing, export, or fruiting-stage support was added.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- Run a local smoke test with at least one agar and one grain selected log.
- Confirm missing-context behavior asks a narrow follow-up and does not diagnose.
- Confirm mixed-scope prompts answer only the supported agar/grain portion and decline the unsupported part.
- Confirm out-of-scope prompts redirect back to text-based agar/grain troubleshooting.
- Confirm production smoke testing remains pending until the Cloudflare provider secret is configured and deployed.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- Test diagnosis request and response Zod schemas, including `mixed_scope`.
- Test diagnosis source mappers from snake_case RPC rows to camelCase UI objects.
- Test retrieval repository calls the RPC contract rather than direct table reads.
- Test prompt builder includes selected-log facts and F-03 guardrails.
- Test provider/service orchestration with mocked embedding, retrieval, and structured generation.
- Test UI state rendering with mocked fetch responses.

### Integration Tests:

- Use local Supabase to apply the pgvector migration and ingest the small knowledge corpus.
- Exercise the JSON API locally with authenticated owner context once provider secrets are configured.
- Run the prepared-case evaluation runner and inspect failures by case ID and scope class.

### Manual Testing Steps:

1. Configure local Supabase and local AI provider secret.
2. Apply the new diagnosis knowledge migration.
3. Run the knowledge ingestion script with `npm run diagnosis:ingest`.
4. Run `npm run test:unit`, `npm run lint`, and `npm run build`.
5. Sign in as the authorized owner.
6. Open an agar grow log detail page and ask an in-scope troubleshooting question.
7. Confirm the answer uses selected-log details, uncertainty, confidence, actions, and source labels.
8. Open a grain grow log detail page and ask an in-scope troubleshooting question.
9. Confirm no smell-based advice appears.
10. Ask a missing-context question and confirm the system asks a narrow follow-up before diagnosing.
11. Ask a mixed-scope question and confirm unsupported scope is declined.
12. Ask a fully out-of-scope question and confirm the response redirects back to text-based agar/grain troubleshooting.
13. Confirm no chat history is saved and no grow-log fields are mutated by asking a diagnosis question.

## Performance Considerations

The MVP corpus is expected to be small, so the first implementation should keep retrieval simple: bounded chunk count, stage filtering inside the RPC, and no HNSW index unless local latency or corpus size proves it is needed. The UI should use one request per submitted question and avoid polling or background tasks. If provider latency is noticeable, the MVP should prefer a clear loading state over streaming complexity.

## Migration Notes

This change introduces a new Supabase migration for pgvector knowledge chunks and an RPC function. Existing grow-log migrations and owner-scoped CRUD behavior should remain unchanged. The knowledge rows are a reproducible index derived from `lib/diagnosis/knowledge/`; if ingestion goes wrong, truncate/reingest the knowledge table rather than editing generated rows as the source of truth.

## References

- Related research: `context/changes/selected-log-diagnosis/research.md`
- Technology research: `context/changes/selected-log-diagnosis/technology-research.md`
- Context7 notes: `context/changes/selected-log-diagnosis/context7-docs.md`
- Roadmap S-02: `context/foundation/roadmap.md:26`
- Change identity: `context/changes/selected-log-diagnosis/change.md:12`
- F-03 rubric: `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md`
- F-03 cases: `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`
- Owner-scoped selected-log repository: `src/lib/grow-logs/repository.ts:48`
- Selected-log detail page: `src/pages/grow-logs/[id].astro:7`
- Existing API pattern: `src/pages/api/grow-logs/create.ts:20`
- Runtime env pattern: `src/lib/runtime-env.ts:8`
- No smell lesson: `context/foundation/lessons.md:30`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: AI Runtime Contract And Environment

#### Automated

- [x] 1.1 Dependencies include `ai`, `@openrouter/ai-sdk-provider`, and `zod`. — a848810
- [x] 1.2 Provider secret is declared in server-only env config, runtime-env accessors, and `wrangler.jsonc` required secrets. — a848810
- [x] 1.3 `.env.example` documents the local provider secret name. — a848810
- [x] 1.4 Diagnosis response schema includes `mixed_scope`. — a848810
- [x] 1.5 Diagnosis schema rejects unsupported `scopeStatus` values. — a848810
- [x] 1.6 Diagnosis schema unit tests pass: `npm run test:unit`. — a848810
- [x] 1.7 Linting passes: `npm run lint`. — a848810
- [x] 1.8 Build passes: `npm run build`. — a848810

#### Manual

- [x] 1.9 Provider secret handling is documented as committed env alignment plus local `.dev.vars` and manual Cloudflare secret configuration. — a848810
- [x] 1.10 No production verification is claimed before the production secret is configured. — a848810
- [x] 1.11 The schema contract visibly matches F-03 outcome categories. — a848810

### Phase 2: Knowledge Corpus And Supabase Retrieval

#### Automated

- [x] 2.1 Knowledge Markdown files exist under `lib/diagnosis/knowledge/`. — a304cdb
- [x] 2.2 Search confirms knowledge files contain no smell-check instructions. — a304cdb
- [x] 2.3 `package.json` defines `diagnosis:ingest` for `scripts/ingest-diagnosis-knowledge.ts`. — a304cdb
- [x] 2.4 Migration creates `diagnosis_knowledge_chunks`, enables RLS/no direct client table reads, and exposes `match_diagnosis_knowledge_chunks`. — a304cdb
- [x] 2.5 RPC contract includes `stage_filter`, `match_threshold`, and `match_count`. — a304cdb
- [x] 2.6 Retrieval mapper converts snake_case source metadata to camelCase. — a304cdb
- [x] 2.7 Retrieval contract tests pass with a mocked Supabase client: `npm run test:unit`. — a304cdb
- [x] 2.8 Linting passes: `npm run lint`. — a304cdb
- [x] 2.9 Build passes: `npm run build`. — a304cdb

#### Manual

- [x] 2.10 Knowledge content is reviewable as product knowledge, not hidden only in database rows. — a304cdb
- [x] 2.11 Runtime retrieval is RPC-only, stage-scoped, and backed by explicit table/RPC grants or revokes. — a304cdb
- [x] 2.12 HNSW/performance indexing remains deferred unless corpus size or latency justifies it. — a304cdb

### Phase 3: Diagnosis Service And JSON API

#### Automated

- [x] 3.1 API route exports uppercase `POST` and returns JSON. — 5dc88cc
- [x] 3.2 API validates `growLogId` and `question` before service execution. — 5dc88cc
- [x] 3.3 Service loads selected log through the owner-scoped repository contract before embedding or generation. — 5dc88cc
- [x] 3.4 Prompt tests confirm guardrails for uncertainty, mixed scope, out-of-scope, no smell, no photo/image analysis, no species advice, and no saved chat history. — 5dc88cc
- [x] 3.5 No-match retrieval path returns `missing_context` or uncertainty-forward behavior instead of invented diagnosis. — 5dc88cc
- [x] 3.6 Provider failure path returns a controlled retryable error without unvalidated diagnosis content. — 5dc88cc
- [x] 3.7 Mocked full service-flow tests pass: `npm run test:unit`. — 5dc88cc
- [x] 3.8 Linting passes: `npm run lint`. — 5dc88cc
- [x] 3.9 Build passes: `npm run build`. — 5dc88cc

#### Manual

- [x] 3.10 API behavior is intentionally a new JSON convention, while still preserving local auth/client/error-handling patterns. — 5dc88cc
- [x] 3.11 Missing or non-owned grow log IDs do not trigger embedding, retrieval, or model calls. — 5dc88cc
- [x] 3.12 Response contract remains compatible with the F-03 prepared cases. — 5dc88cc

### Phase 4: Selected-Log UI On Detail Page

#### Automated

- [x] 4.1 `/grow-logs/[id]` renders the diagnosis panel only for an existing owner-scoped log. — 12a462c
- [x] 4.2 UI submits one JSON request to the selected-log diagnosis endpoint. — 12a462c
- [x] 4.3 UI displays loading and retryable error states. — 12a462c
- [x] 4.4 UI renders possible causes, suggested actions, confidence, uncertainty, follow-up question, and source labels from structured JSON. — 12a462c
- [x] 4.5 UI tests pass with mocked API responses: `npm run test:unit`. — 12a462c
- [x] 4.6 Linting passes: `npm run lint`. — 12a462c
- [x] 4.7 Build passes: `npm run build`. — 12a462c

#### Manual

- [x] 4.8 Owner can ask a question from a selected grow-log detail page and see a readable diagnosis result. — 12a462c
- [x] 4.9 Source labels are concise and understandable. — 12a462c
- [x] 4.10 The UI does not show raw JSON/debug output. — 12a462c
- [x] 4.11 The UI does not create saved chat history or mutate the grow-log body/title/stage. — 12a462c
- [x] 4.12 Text and controls fit cleanly on desktop and mobile widths. — 12a462c

### Phase 5: F-03 Evaluation And Final Scope Audit

#### Automated

- [ ] 5.1 Evaluation runner reads all 10 F-03 prepared cases.
- [ ] 5.2 Evaluation runner reports the four scope classes: `in_scope`, `missing_context`, `mixed_scope`, and `out_of_scope`.
- [ ] 5.3 Evaluation runner distinguishes PRD accuracy cases from guardrail-only cases using `counts_toward_prd_accuracy`.
- [ ] 5.4 `package.json` defines `diagnosis:evaluate` for `scripts/evaluate-diagnosis-cases.ts`.
- [ ] 5.5 Search confirms no smell-check guidance exists in diagnosis prompts, knowledge files, or UI copy.
- [ ] 5.6 Search confirms no live web search, saved chat history persistence, image/photo upload, species advice, sharing, export, or fruiting-stage support was added.
- [ ] 5.7 Unit tests pass: `npm run test:unit`.
- [ ] 5.8 Linting passes: `npm run lint`.
- [ ] 5.9 Build passes: `npm run build`.

#### Manual

- [ ] 5.10 Run a local smoke test with at least one agar and one grain selected log.
- [ ] 5.11 Confirm missing-context behavior asks a narrow follow-up and does not diagnose.
- [ ] 5.12 Confirm mixed-scope prompts answer only the supported agar/grain portion and decline the unsupported part.
- [ ] 5.13 Confirm out-of-scope prompts redirect back to text-based agar/grain troubleshooting.
- [ ] 5.14 Confirm production smoke testing remains pending until the Cloudflare provider secret is configured and deployed.
