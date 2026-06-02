<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Selected Log Diagnosis Implementation Plan

- **Plan**: `context/changes/selected-log-diagnosis/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-02
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Existing paths 6/6 pass, symbols 9/9 pass, brief-plan consistency pass, Context7/research compatibility pass.

## Triage Summary

- **Fixed**: F1, F2, F3
- **Skipped**: None
- **Accepted**: None
- **Dismissed**: None
- **Verdict after fixes**: SOUND

## Findings

### F1 — Provider secret contract misses Wrangler required secrets

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Provider environment contract
- **Detail**: Plan adds `OPENAI_API_KEY` or an equivalent provider key to `astro.config.mjs`, `src/lib/runtime-env.ts`, `.env.example`, and `.dev.vars`, but omits `wrangler.jsonc`. Current `wrangler.jsonc` has `secrets.required`, and `context/foundation/infrastructure.md` explicitly says the AI diagnosis route must add the provider secret across `.env.example`, `astro.config.mjs`, `wrangler.jsonc` `secrets.required`, and Cloudflare Worker secrets. `.dev.vars` is also gitignored and absent, so it should be treated as local setup, not the only Worker-local contract.
- **Fix**: Add `wrangler.jsonc` to Phase 1 files and success criteria; clarify `.dev.vars` as a local manual secret file while `.env.example` and `wrangler.jsonc` are committed alignment surfaces.
- **Decision**: FIXED via Fix in plan on 2026-06-02. Phase 1 now includes `wrangler.jsonc` as a committed required-secret surface and clarifies `.dev.vars` as local manual setup.

### F2 — Knowledge table access control is underspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Diagnosis knowledge migration
- **Detail**: Plan says runtime retrieval is RPC-only and no direct browser/client reads are allowed, but the migration contract does not specify RLS, direct table grants/revokes, or whether `match_diagnosis_knowledge_chunks` should be `security definer`. Current Supabase pattern enables RLS on private tables, and Context7 confirms vector search should be wrapped in RPC. Without an explicit DB access rule, the implementation can satisfy UI code requirements while still leaving the table directly readable through Supabase APIs.
- **Fix**: Extend the migration contract with an explicit access model: enable RLS on `diagnosis_knowledge_chunks`, prevent direct client table reads, and expose only the stage-filtered RPC needed by the server diagnosis path. If using `security definer`, require a narrow `search_path` and documented grants.
- **Decision**: FIXED via Fix in plan on 2026-06-02. Phase 2 now requires RLS/no direct client table reads, RPC-only retrieval, and explicit grants/revokes including `security definer` safeguards when used.

### F3 — TypeScript scripts have no runnable execution contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 and Phase 5 — ingestion/evaluation scripts
- **Detail**: Plan adds `scripts/ingest-diagnosis-knowledge.ts` and `scripts/evaluate-diagnosis-cases.ts`, but the repo currently has no `scripts/` folder and `package.json` has no TypeScript script runner such as `tsx`, nor npm scripts for ingestion/evaluation. Manual testing says "Run the knowledge ingestion script" and the end state promises a runner against F-03 cases, but an implementer must guess how these `.ts` files are executed.
- **Fix**: Add explicit package scripts such as `diagnosis:ingest` and `diagnosis:evaluate`, plus the required runner dependency or a decision to write executable JS instead of TS. Add those commands to Phase 2/5 success criteria and manual testing.
- **Decision**: FIXED via Fix in plan on 2026-06-02. Phase 2/5 now define project-owned `diagnosis:ingest` and `diagnosis:evaluate` npm scripts backed by `tsx`, with matching success criteria and manual testing commands.
