---
date: 2026-06-17T15:44:13+02:00
researcher: Codex
git_commit: 60362aa742ff2555f5b5e6b912b645fdeafa3537
branch: master
repository: karol-bekieszczuk/Brave10XDevs
topic: "Phase 1 diagnosis contract hardening: risks #1, #2, and #3 from context/foundation/test-plan.md"
tags: [research, codebase, diagnosis, testing, provider-boundary, selected-log]
status: complete
last_updated: 2026-06-17
last_updated_by: Codex
---

# Research: Phase 1 Diagnosis Contract Hardening

**Date**: 2026-06-17T15:44:13+02:00
**Researcher**: Codex
**Git Commit**: 60362aa742ff2555f5b5e6b912b645fdeafa3537
**Branch**: master
**Repository**: karol-bekieszczuk/Brave10XDevs

## Research Question

Research Phase 1 from `context/foundation/test-plan.md`, covering risks #1, #2, and #3.

Find where the current code has risk surfaces for:

- wrong or overconfident diagnosis,
- malformed or partial provider responses,
- missing-context, mixed-scope, and out-of-scope prompts.

Check existing tests, missing safeguards, and the cheapest useful testing layers. Do not create `plan.md`; save `research.md` as input for a later `/10x-plan`.

## Summary

Phase 1 is centered on the existing selected-log diagnosis stack under `src/lib/diagnosis`, the JSON API route at `src/pages/api/diagnosis/selected-log.ts`, the React island at `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx`, and the deterministic evaluation runner at `scripts/evaluate-diagnosis-cases.ts`.

The strongest existing protections are deterministic and already live at the service/schema/prompt layer: selected-log owner loading happens before provider work, retrieval is stage-scoped, malformed provider output is schema-gated, and explicit prechecks short-circuit several missing-context, mixed-scope, out-of-scope, and no-smell cases.

The main live gaps are:

- structurally valid but semantically unsafe diagnoses can still pass because schema validation does not enforce selected-log evidence, source membership, confidence bounds, or banned certainty wording;
- provider and API error redaction is currently broken or regressed in the checkout;
- the selected-log API route and evaluation runner currently contain stray `runTestPlan` imports/calls, so Phase 1 cannot rely on green baseline checks until those are removed;
- the scope precheck order can classify a thin selected log plus a fully out-of-scope prompt as `missing_context` before it gets to the out-of-scope guardrail;
- the deterministic guardrail patterns do not cover every F-03 unsupported class, especially saved chat history, multi-log comparison, export/download, and social/multi-user wording.

Cheapest useful layers are focused Vitest service/provider/API/component tests plus the deterministic `diagnosis:evaluate` contract runner. Browser/e2e and live OpenRouter tests are not the right first layer for these Phase 1 risks.

## Detailed Findings

### Risk #1: Wrong Or Overconfident Diagnosis

Selected-log binding exists at multiple layers. The grow-log detail page loads the owner-scoped log before mounting the diagnosis island (`src/pages/grow-logs/[id].astro:9`, `src/pages/grow-logs/[id].astro:102`). The client submits only the selected `growLogId` and trimmed question to `/api/diagnosis/selected-log` (`src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:71`, `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:76`).

The service validates request shape, loads the owner-scoped grow log, rejects missing logs, rejects unsupported stages, and only then proceeds to guardrails, embedding, retrieval, and provider generation (`src/lib/diagnosis/service.ts:183`, `src/lib/diagnosis/service.ts:190`, `src/lib/diagnosis/service.ts:196`, `src/lib/diagnosis/service.ts:217`, `src/lib/diagnosis/service.ts:228`). This is the core selected-log binding surface for Phase 1.

Prompt construction includes the selected stage, title, body, user question, retrieved same-stage sources, and explicit guardrails for uncertainty, `missing_context`, `mixed_scope`, `out_of_scope`, no smell checks, no photos/images, no species advice, no saved chat history, and no multi-log comparison (`src/lib/diagnosis/prompt.ts:10`, `src/lib/diagnosis/prompt.ts:38`, `src/lib/diagnosis/prompt.ts:49`).

The schema requires a scope status, arrays of causes/actions, nullable `confidenceBand`, non-empty `uncertainty`, nullable follow-up, and source labels (`src/lib/diagnosis/schema.ts:17`). This catches shape drift, but it does not prove the diagnosis depends on the selected log or retrieved chunks. A provider can return a schema-valid but generic or overconfident answer, and `diagnoseSelectedLog` will currently accept it after `diagnosisResponseSchema.safeParse` (`src/lib/diagnosis/service.ts:234`).

Existing tests cover selected-log service ordering and owner-scoped load before provider creation (`src/lib/diagnosis/service.test.ts:72`), prompt guardrail inclusion (`src/lib/diagnosis/prompt.test.ts:35`), schema scope categories (`src/lib/diagnosis/schema.test.ts:20`), and deterministic runner checks for selected-log dependency and no guarantee wording (`scripts/evaluate-diagnosis-cases.ts:172`, `scripts/evaluate-diagnosis-cases.ts:179`).

Missing safeguards to consider in the later plan:

- a post-generation diagnosis contract validator for certainty wording, confidence bounds, selected-log/stage evidence, and retrieved-source membership;
- service-level tests with schema-valid but semantically bad provider output, such as high confidence plus guarantee wording, causes/actions unrelated to the selected log, or source labels not present in retrieved chunks;
- deterministic evaluation assertions that consume `expected_signals` more directly instead of only checking broad text signals.

### Risk #2: Malformed Or Partial Provider Responses

Provider output is schema-gated twice. `createDiagnosisProvider` uses AI SDK structured output via `generateText` with `Output.object({ schema: diagnosisResponseSchema })` and then validates `output` again with `diagnosisResponseSchema.safeParse` (`src/lib/diagnosis/provider.ts:75`, `src/lib/diagnosis/provider.ts:79`, `src/lib/diagnosis/provider.ts:86`). The service validates the provider result again before returning success (`src/lib/diagnosis/service.ts:234`).

The service already rejects invalid mocked provider output as `invalid_model_output` (`src/lib/diagnosis/service.test.ts:307`). The provider tests currently cover timeout abort signals and timeout mapping (`src/lib/diagnosis/provider.test.ts:65`, `src/lib/diagnosis/provider.test.ts:84`), but do not directly test partial `generateText` output such as `{ output: { scopeStatus: "in_scope" } }`.

The API route should translate service error codes to HTTP status codes (`src/pages/api/diagnosis/selected-log.ts:18`). In the current checkout, this route is not trustworthy because it imports `@/lib/test-plan` and has `await runTestPlan()` inserted inside the dependency object passed to `diagnoseSelectedLog` (`src/pages/api/diagnosis/selected-log.ts:4`, `src/pages/api/diagnosis/selected-log.ts:97`). `npm run test:unit` fails to transform this file with `Cannot use "await" as an identifier here`.

The API route also currently adds `[DEBUG] ${code}: ${message}` to user-visible error messages (`src/pages/api/diagnosis/selected-log.ts:122`). That weakens the controlled-error contract, especially if a lower layer leaks raw provider details.

Error redaction is actively failing. The test expects unknown provider failures to serialize as `Diagnosis generation failed.` without raw details (`src/lib/diagnosis/errors.test.ts:23`), but `toDiagnosisError` currently returns `Diagnosis generation failed: ${message}` (`src/lib/diagnosis/errors.ts:62`). `npm run test:unit` confirms the failure: the received API message includes `Error: raw provider stack`.

The UI has a stronger boundary than the current API route. `requestSelectedLogDiagnosis` parses every payload with `diagnosisApiResponseSchema.safeParse`; malformed success or error payloads become the generic retryable message `Diagnosis returned an unexpected response.` (`src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:87`, `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:91`). Existing UI tests cover controlled API errors without raw JSON (`src/components/diagnosis/SelectedLogDiagnosisPanel.test.tsx:84`), but not malformed success payloads.

Cheapest missing tests:

- provider unit test for partial/wrong `generateText` output mapping to `invalid_model_output`;
- service test for partial provider output and raw thrown provider errors after error redaction is fixed;
- API integration test that `invalid_model_output` returns HTTP 502 with a controlled message and no `[DEBUG]` or raw provider text;
- component test that malformed `{ ok: true, diagnosis: ... }` payload throws the generic unexpected-response error and renders no diagnosis fields.

### Risk #3: Missing Context, Mixed Scope, And Out Of Scope

Core guardrail logic is in `src/lib/diagnosis/service.ts`. Unsupported-scope patterns include fruiting/yield/photo/species/share wording (`src/lib/diagnosis/service.ts:12`). Supported-scope patterns include agar/grain/stall/colonization/mycelium/contamination wording (`src/lib/diagnosis/service.ts:39`). Smell patterns are separate (`src/lib/diagnosis/service.ts:57`). Thin-log patterns drive `missing_context` (`src/lib/diagnosis/service.ts:67`).

`missingContextResponse` returns a successful diagnosis envelope with `scopeStatus: "missing_context"`, no causes/actions, no confidence band, uncertainty, a narrow follow-up question, and no sources (`src/lib/diagnosis/service.ts:86`). `guardrailResponse` returns no-smell, `mixed_scope`, or `out_of_scope` responses without provider or retrieval calls (`src/lib/diagnosis/service.ts:112`, `src/lib/diagnosis/service.ts:145`, `src/lib/diagnosis/service.ts:163`).

The service currently checks thin selected-log context before question guardrails (`src/lib/diagnosis/service.ts:200`, `src/lib/diagnosis/service.ts:204`). This can misclassify a fully out-of-scope question against a thin log as `missing_context` instead of `out_of_scope`. Existing tests do not cover thin-log plus out-of-scope or thin-log plus mixed-scope combined cases.

Existing service tests cover retrieval-empty `missing_context` (`src/lib/diagnosis/service.test.ts:155`), thin selected logs (`src/lib/diagnosis/service.test.ts:172`), mixed grain+fruiting prompts (`src/lib/diagnosis/service.test.ts:192`), photo/species out-of-scope (`src/lib/diagnosis/service.test.ts:219`), contamination+photo/species out-of-scope handling (`src/lib/diagnosis/service.test.ts:238`), and the no-smell guardrail (`src/lib/diagnosis/service.test.ts:257`).

The F-03 rubric lists broader unsupported categories than the current deterministic regex precheck covers: saved chat history, sharing/social behavior, multi-user behavior, export/download, photos/images, species, and fruiting (`context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md:165`). Current patterns cover several of those, but not obvious saved-chat, history, export/download, or multi-log comparison wording; those depend on prompt compliance instead of deterministic precheck refusal.

Prepared evaluation cases are targeted to the Phase 1 risks. They include missing context (`context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:50`, `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:157`), mixed scope (`context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:72`, `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:180`), and out-of-scope photo/species (`context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:89`).

The deterministic runner validates scope class, selected-log dependency, uncertainty, missing-context behavior, mixed-scope refusal, out-of-scope redirect, and prohibited critical failures (`scripts/evaluate-diagnosis-cases.ts:165`). However, it is currently broken by `runTestPlan` import/call drift (`scripts/evaluate-diagnosis-cases.ts:5`, `scripts/evaluate-diagnosis-cases.ts:132`) and fails with `ERR_MODULE_NOT_FOUND: Cannot find module ... src/lib/test-plan`.

Cheapest missing tests:

- service table tests for thin log plus out-of-scope, thin log plus mixed scope, saved-chat/history, export/download, multi-log comparison, and social/multi-user prompts;
- restore `diagnosis:evaluate` so prepared F-03 cases run as a deterministic contract layer;
- strengthen the runner to use `expected_signals` and negative expectations more explicitly, without pretending to be a live model-quality benchmark.

## Current Verification Baseline

Commands run during this research:

- `npm run test:unit` - fails in the current checkout.
- `npm.cmd run diagnosis:evaluate` - fails in the current checkout.

`npm run test:unit` result:

- `src/pages/api/diagnosis/selected-log.test.ts` cannot run because `src/pages/api/diagnosis/selected-log.ts:98` has a transform error from inserted `await runTestPlan()`.
- `src/lib/diagnosis/errors.test.ts` fails because `toDiagnosisError` exposes raw provider error details.
- `src/lib/diagnosis/retrieval.test.ts` fails because the test expects default `match_threshold: 0`, while `matchDiagnosisKnowledgeChunks` now defaults to `matchThreshold = 20` (`src/lib/diagnosis/retrieval.ts:50`, `src/lib/diagnosis/retrieval.test.ts:86`).
- `src/pages/api/auth/signin.test.ts` also fails because of an unrelated stray `runTestPlan` call in the test.

`npm.cmd run diagnosis:evaluate` result:

- Fails before cases run because `scripts/evaluate-diagnosis-cases.ts` imports missing `../src/lib/test-plan` and calls `runTestPlan()`.

These failures should be treated as Phase 1 baseline blockers, not as evidence that the diagnosis contract is absent.

## Code References

- `src/lib/diagnosis/service.ts:183` - service entry validates the diagnosis request.
- `src/lib/diagnosis/service.ts:190` - loads the owner-scoped selected grow log before provider work.
- `src/lib/diagnosis/service.ts:200` - thin-log missing-context check currently runs before question-scope guardrails.
- `src/lib/diagnosis/service.ts:204` - question guardrail short-circuit.
- `src/lib/diagnosis/service.ts:217` - query embedding created from selected-log context and question.
- `src/lib/diagnosis/service.ts:218` - retrieval uses same-stage knowledge chunks.
- `src/lib/diagnosis/service.ts:234` - provider result is schema-validated before success response.
- `src/lib/diagnosis/provider.ts:75` - live provider generation boundary.
- `src/lib/diagnosis/provider.ts:79` - AI SDK structured output is configured with `diagnosisResponseSchema`.
- `src/lib/diagnosis/provider.ts:86` - provider output is parsed again with Zod.
- `src/lib/diagnosis/errors.ts:62` - current raw-error leak surface.
- `src/pages/api/diagnosis/selected-log.ts:97` - malformed dependency object with inserted `runTestPlan`.
- `src/pages/api/diagnosis/selected-log.ts:122` - debug prefix added to user-visible API errors.
- `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:87` - UI parses the full API response schema.
- `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:91` - UI converts malformed payloads to a generic retryable error.
- `scripts/evaluate-diagnosis-cases.ts:165` - deterministic contract checks begin.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:50` - prepared missing-context agar case.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:72` - prepared mixed-scope agar+fruiting case.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json:89` - prepared out-of-scope photo/species case.

## Architecture Insights

The existing architecture is suitable for Phase 1 because the main risk surfaces are already separated:

- `schema.ts` defines shape contracts.
- `prompt.ts` defines model-facing instructions.
- `provider.ts` isolates AI SDK/OpenRouter calls.
- `service.ts` is the orchestration and guardrail boundary.
- `selected-log.ts` is the HTTP translation boundary.
- `SelectedLogDiagnosisPanel.tsx` is the UI schema-consumption boundary.
- `scripts/evaluate-diagnosis-cases.ts` is the deterministic contract runner over prepared F-03 cases.

Phase 1 should preserve that separation. The highest-signal work is not broad browser coverage; it is making the service/provider/API/component contracts fail deterministically for malformed output, raw errors, unsupported scope, missing evidence, and overconfident wording.

The notable architectural weakness is that schema validation is necessary but not sufficient. It prevents malformed provider output from becoming a success response, but it cannot detect a polished, schema-valid diagnosis that ignores selected-log evidence or overstates certainty. If Phase 1 adds a semantic contract validator, keep it deterministic and small: banned certainty terms, required uncertainty, source membership, supported scope status, and selected-log/stage evidence checks.

## Historical Context

`context/foundation/test-plan.md` defines Phase 1 as `Diagnosis Contract Hardening`, covering risks #1, #2, and #3 with unit, integration, and contract/evaluation tests. It explicitly says research must ground the diagnosis entry point, prompt contract, selected-log binding, provider boundary, validation path, UI rendering contract, evaluation cases, and service routing before planning.

`context/changes/selected-log-diagnosis/plan.md` established the intended selected-log diagnosis contract: authenticate, load only the owner's selected log, retrieve same-stage knowledge, return `missing_context` instead of inventing a diagnosis, validate request/response shapes, and keep production provider secrets/manual smoke separate from local deterministic verification.

`context/changes/selected-log-diagnosis/reviews/impl-review.md` previously identified and fixed lazy provider creation after owner-scoped loading. This remains important because Phase 1 tests should keep proving provider setup cannot mask selected-log ownership failures.

Prior plan-review memory for `testing-diagnosis-contract-hardening` recorded a `REVISE` verdict with three concrete concerns: missing baseline fixes in `errors.ts` and `retrieval.ts`, incomplete `runTestPlan` cleanup, and a smell-audit rule that could false-positive intended negative guardrail tests. The current checkout confirms the same baseline class still matters.

## Related Research

- `context/changes/selected-log-diagnosis/research.md` - earlier compatibility and implementation research for selected-log diagnosis.
- `context/changes/selected-log-diagnosis/context7-docs.md` - captured technology documentation for AI SDK, OpenRouter provider, Zod, and Supabase pgvector.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md` - human-readable diagnosis quality contract.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json` - prepared 10-case diagnosis evaluation corpus.
- `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md` - registry of load-bearing diagnosis contract artifacts.

## Open Questions

- Should Phase 1 add a dedicated post-generation contract validator, or keep semantic checks only in tests/evaluation runner for now?
- Should `guardrailResponse(question)` run before `lacksCriticalSelectedLogContext(growLog)` so unsupported scope wins over thin-log fallback when both are true?
- Should the retrieval default be `matchThreshold = 0` as the existing test expects, or `20` as the current implementation uses?
- Which unsupported wording classes should become deterministic prechecks versus prompt-only guardrails: saved chat history, multi-log comparison, export/download, social sharing, and multi-user requests?
- Should API error messages always be generic for provider failures, with detailed provider errors logged only server-side?
