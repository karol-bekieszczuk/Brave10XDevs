# Testing Diagnosis Contract Hardening - Plan Brief

> Full plan: `context/changes/testing-diagnosis-contract-hardening/plan.md`
> Research: `context/changes/testing-diagnosis-contract-hardening/research.md`

## What & Why

This plan hardens the selected-log diagnosis contract for rollout Phase 1: wrong or overconfident diagnosis, malformed provider output, and missing-context / mixed-scope / out-of-scope prompts. The goal is to keep deterministic test gates stable while adding a required manual live-provider checkpoint that exercises the real OpenRouter-backed AI path.

## Starting Point

The diagnosis stack already has separated schema, prompt, provider, service, API, UI, and evaluation surfaces. The current checkout still has red baseline drift: stray `runTestPlan` calls, API debug leakage, raw provider error exposure, and a retrieval default/test mismatch.

## Desired End State

The deterministic gate passes through `npm run test:unit`, `npm run lint`, `npm run build`, and `npm run diagnosis:evaluate`. Runtime diagnosis output is checked beyond shape-only Zod parsing, unsupported F-03 non-goals are refused or narrowed before provider calls, and a separate `diagnosis:evaluate:live` command must pass manually with a real `OPENROUTER_API_KEY` before this phase closes.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Baseline cleanup | Remove all stray `runTestPlan` drift under `src` and `scripts` | The full unit gate cannot be trusted while unrelated transform/runtime failures remain | Plan |
| Runtime validator | Add a minimal post-generation contract validator | Zod catches shape, but not guarantee language, source mismatch, high-confidence misuse, or smell advice | Plan |
| Guardrail ordering | Scope guardrails run before thin-log `missing_context` | Unsupported prompts should not be reclassified as missing context because the selected log is thin | Plan |
| Retrieval default | Keep `matchThreshold = 0` for now | The SQL RPC threshold is a `0..1` similarity cutoff; the earlier `20` assumption blocked all live matches and caused false `missing_context` outcomes | Plan / live gate |
| Test strategy | Keep deterministic tests plus required live-provider checkpoint | Stable gates prove technical contracts; real AI verifies production-like behavior manually | Plan |
| Live-provider gate | Manual required gate, not CI | Real provider calls need secrets, network, cost control, and failure triage | Plan |
| Unsupported non-goals | Add deterministic refusals for full F-03 non-goals | This avoids paying provider calls for known unsupported product scope | Plan |
| API error detail | Detailed response messages only in local/dev; production stays controlled | Debug remains possible without making raw provider details public | Plan |

## Scope

**In scope:**

- Restore baseline testability and remove `runTestPlan` drift.
- Add minimal semantic runtime validation after provider output parsing.
- Route unsupported/mixed/no-smell prompts before provider calls.
- Expand service, provider, API, UI, and deterministic evaluator tests.
- Add a manual live-provider evaluation command and checkpoint instructions.
- Add placeholder env documentation if `.env.example` remains absent.

**Out of scope:**

- Expanding diagnosis beyond agar/grain text troubleshooting.
- Supporting photos, image analysis, saved chat history, sharing, multi-user behavior, export/download, or multi-log comparison.
- Making live-provider checks part of CI.
- Replacing deterministic contract tests with live AI tests.
- Calibrating retrieval threshold beyond keeping `0` as the current recall-first default.

## Architecture / Approach

The plan keeps the existing diagnosis separation: `service.ts` owns orchestration and guardrails, `provider.ts` owns AI SDK/OpenRouter calls, `schema.ts` owns shape contracts, the API route owns HTTP translation, the React island owns response parsing/rendering, and evaluation scripts own prepared-case contract checks. The new runtime validator sits between parsed provider output and successful service response, while live evaluation is isolated in a new command so CI-friendly checks stay deterministic.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Restore Diagnosis Test Baseline | Clean transform/runtime drift and align existing tests | Hidden unrelated failures mask diagnosis regressions |
| 2. Add Runtime Contract Guardrails | Validator plus pre-provider scope/non-goal routing | Over-broad rules could false-positive valid answers |
| 3. Expand Deterministic Contract Coverage | Stable tests across provider, service, API, UI, and evaluator | Tests could overfit exact prose instead of behavior |
| 4. Add Live Provider Evaluation Gate | Real OpenRouter manual evaluation command and docs | Live model output can be variable and needs triage |
| 5. Final Verification And Handoff | Full gate run and rollout artifact sync | Status/docs could claim more than verification proves |

**Prerequisites:** Local dependencies installed, prepared F-03 cases available, and a real `OPENROUTER_API_KEY` for the live-provider checkpoint.

**Estimated effort:** About 3-5 focused implementation sessions across 5 phases, with the live-provider checkpoint requiring human review.

## Open Risks & Assumptions

- `matchThreshold = 0` is preserved as the current recall-first default, not treated as calibrated retrieval quality. The threshold should only move upward after measuring real same-stage retrieval quality on the MVP corpus.
- The validator must stay narrow enough to catch hard contract violations without blocking reasonable natural language.
- Live-provider evaluation may fail due to provider/runtime conditions; failures need classification before code changes.
- CI remains deterministic in this phase; live CI is a future decision.

## Success Criteria (Summary)

- Deterministic gates pass: `npm run test:unit`, `npm run lint`, `npm run build`, and `npm run diagnosis:evaluate`.
- Runtime diagnosis blocks or narrows unsupported, malformed, overconfident, source-invalid, and smell-advice outputs before UI render.
- Manual `npm run diagnosis:evaluate:live` passes with a real provider key before Phase 1 is closed.
