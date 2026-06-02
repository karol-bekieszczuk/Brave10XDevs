# Selected Log Diagnosis - Plan Brief

> Full plan: `context/changes/selected-log-diagnosis/plan.md`
> Research: `context/changes/selected-log-diagnosis/research.md`

## What & Why

This plan builds S-02: selected-log diagnosis for one private agar or grain grow log. It proves the core product value by letting the owner ask one troubleshooting question against one selected text log and receive a scoped, uncertain, structured answer grounded in the selected log and controlled internal knowledge.

## Starting Point

S-01 already provides `/grow-logs/[id]` and owner-scoped selected-log loading. F-03 already provides the diagnosis quality rubric and 10 prepared cases, but the app has no AI SDK dependencies, provider secret surface, knowledge corpus, pgvector retrieval, diagnosis API, UI panel, or evaluator.

## Desired End State

The grow-log detail page contains a compact diagnosis panel. Submitting a question sends one JSON request, loads only the authenticated owner's selected log, retrieves same-stage internal knowledge, and renders possible causes, actions, confidence, uncertainty, follow-up, and source labels. Missing context, mixed scope, and out-of-scope requests follow the F-03 contract instead of producing generic or overconfident advice.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Runtime scope | Full request path with small corpus | S-02 is the product proof point, so the first implementation must prove the real selected-log loop. | Plan |
| Knowledge location | `lib/diagnosis/knowledge/` | User selected a repo-level knowledge path outside `src/`. | Plan |
| Retrieval access | RPC-only | Keeps retrieval narrow and stage-filtered inside Supabase. | Research / Plan |
| Source display | Show concise source labels | Makes grounding inspectable in UI and manual review. | Plan |
| API response | One final JSON response | Keeps validation and F-03 evaluation simpler than streaming or polling. | Plan |
| No-match retrieval | Return `missing_context` or uncertainty | Prevents invented diagnosis when context is weak. | Research / Plan |
| Evaluation | Add local F-03 runner | Makes the S-02 acceptance contract measurable. | Plan |
| Secrets | Local env contract plus manual Cloudflare secret step | Separates local verification from dashboard-owned production configuration. | Plan |
| Provider errors | Controlled error plus retry | Avoids showing unvalidated diagnosis content. | Plan |
| Test depth | Mocked full service-flow tests | Protects orchestration without relying on live AI in unit tests. | Plan |
| UI surface | React island on `/grow-logs/[id]` | Keeps diagnosis bound to the selected log. | Plan |

## Scope

**In scope:**

- AI SDK, OpenAI provider, and Zod dependency setup.
- Provider env surfaces for local and Cloudflare runtime configuration.
- Diagnosis schemas with `mixed_scope`.
- Canonical Markdown knowledge under `lib/diagnosis/knowledge/`.
- Supabase pgvector knowledge chunks and stage-filtered RPC.
- Deterministic ingestion script.
- Request-scoped diagnosis service and JSON API.
- React diagnosis panel on `/grow-logs/[id]`.
- Mocked service-flow tests and F-03 prepared-case evaluation runner.

**Out of scope:**

- Live web search, Exa runtime calls, broad agent frameworks, streaming, polling, background jobs, or saved chat history.
- Photo upload, image analysis, species identification, fruiting advice, sharing, export, or multi-user product features.
- Direct client reads of the knowledge table.
- Production smoke-test claims before Cloudflare provider secret configuration.

## Architecture / Approach

The flow is: selected grow-log detail page -> React diagnosis panel -> JSON Astro API -> owner-scoped `getOwnerGrowLog` -> embedding from stage/title/body/question -> Supabase RPC retrieval over same-stage chunks -> AI SDK structured output -> Zod-validated response -> structured UI rendering. Markdown files are the source of truth for knowledge; Supabase rows are a reproducible vector index.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. AI Runtime Contract And Environment | Dependencies, env contract, schemas, controlled errors | Provider setup can blur local verification with production readiness. |
| 2. Knowledge Corpus And Supabase Retrieval | Knowledge files, ingestion, pgvector table, RPC retrieval | Knowledge/RPC design can expose too much surface or drift from stage scope. |
| 3. Diagnosis Service And JSON API | Owner-scoped backend diagnosis path | Model calls must not happen before ownership and validation checks. |
| 4. Selected-Log UI On Detail Page | User-facing diagnosis panel and structured result rendering | UI can become raw debug output or accidentally imply saved chat. |
| 5. F-03 Evaluation And Final Scope Audit | Prepared-case runner and guardrail verification | Model-dependent quality must be separated from deterministic contract checks. |

**Prerequisites:** Completed S-01 grow-log CRUD, completed F-03 rubric/cases, local Supabase, local AI provider secret for runtime smoke tests.
**Estimated effort:** ~4-6 implementation sessions across 5 phases.

## Open Risks & Assumptions

- AI SDK structured-output API must match the installed major version.
- Cloudflare production diagnosis cannot be verified until the provider secret is configured outside local code.
- The first knowledge corpus is intentionally small, so answer quality depends on careful corpus review and F-03 evaluation.
- The evaluator can prove contract behavior, but live model quality may still need manual review.

## Success Criteria (Summary)

- Owner can ask about one selected agar or grain log and receive a scoped structured diagnosis response.
- Missing-context, mixed-scope, and out-of-scope prompts follow F-03 guardrails.
- Local tests, mocked service flow, and prepared-case evaluation run without introducing smell checks, photos, species advice, live web search, saved chat history, or sharing.
