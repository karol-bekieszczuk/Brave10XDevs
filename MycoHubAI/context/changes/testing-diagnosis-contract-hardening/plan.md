# Testing Diagnosis Contract Hardening Implementation Plan

## Overview

This plan hardens the selected-log diagnosis contract for rollout Phase 1 from `context/foundation/test-plan.md`. The work protects against overconfident or unsupported diagnoses, malformed provider output, and missing-context / mixed-scope / out-of-scope prompts by combining deterministic contract tests with a required manual live-provider checkpoint against the real OpenRouter-backed AI path.

## Current State Analysis

The selected-log diagnosis stack already has useful separation between schema, prompt, provider, service orchestration, API translation, UI parsing, and deterministic evaluation. The current checkout is not a reliable baseline yet: several stray `runTestPlan` imports/calls break scripts or tests, API error responses add local debug text to public payloads, unknown provider errors leak raw details, and retrieval defaults drifted from existing tests.

The main contract gap is semantic, not structural. `diagnosisResponseSchema` catches malformed JSON-like shapes, but a schema-valid answer can still be unsafe if it uses guarantee language, cites sources that were not retrieved, gives high confidence without sufficient support, or ignores the selected log.

## Desired End State

After this plan lands, the diagnosis path has a clean deterministic gate and a real-provider manual gate. `npm run test:unit`, `npm run lint`, `npm run build`, and `npm run diagnosis:evaluate` are stable local/CI-friendly checks, while a separate live-provider command exercises the production-like OpenRouter path and must be run manually before closing this phase.

The runtime behavior should reject or narrow unsupported prompts before calling the provider, validate model output beyond shape-only parsing, keep production API/UI errors controlled, and preserve local development detail only behind an explicit dev-only boundary.

### Key Discoveries:

- Phase 1 is defined as "Diagnosis Contract Hardening" for risks #1, #2, and #3 with unit, integration, and contract/evaluation tests in `context/foundation/test-plan.md:77`.
- The service currently checks thin selected-log context before question scope guardrails, so an unsupported prompt can be classified as `missing_context` first in `src/lib/diagnosis/service.ts:200` and `src/lib/diagnosis/service.ts:204`.
- Provider and service output are shape-validated through `diagnosisResponseSchema.safeParse`, but shape validation alone cannot prove selected-log evidence, source membership, or uncertainty discipline in `src/lib/diagnosis/provider.ts:86` and `src/lib/diagnosis/service.ts:234`.
- Public API errors currently add `[DEBUG]` to response messages in `src/pages/api/diagnosis/selected-log.ts:122`.
- Unknown provider errors currently include raw details in the serialized message in `src/lib/diagnosis/errors.ts:62`, despite the test expecting `Diagnosis generation failed.` in `src/lib/diagnosis/errors.test.ts:30`.
- `runTestPlan` drift appears in diagnosis scripts/routes and unrelated auth surfaces, including `scripts/evaluate-diagnosis-cases.ts:5`, `scripts/evaluate-diagnosis-cases.ts:132`, `src/pages/api/diagnosis/selected-log.ts:4`, `src/pages/api/diagnosis/selected-log.ts:98`, `src/components/auth/SignInForm.tsx:6`, `src/components/auth/SignInForm.tsx:43`, and `src/pages/api/auth/signin.test.ts:50`.
- Retrieval currently defaults to `matchThreshold = 0` in `src/lib/diagnosis/retrieval.ts:50`. Earlier Phase 1 planning temporarily preserved `20`, but the live-provider gate proved that value was wrong for this RPC because `match_threshold` is a similarity value on the `0..1` scale; `20` blocked all matches and caused in-scope cases to fall through to `missing_context`.
- The F-03 rubric names unsupported non-goals such as saved chat history, sharing/social features, multi-user behavior, export/download, and image/photo scope in `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md:152`, `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md:175`, and `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md:177`.
- The UI already schema-parses API payloads and converts malformed responses into a generic retryable error in `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:88`.

## What We're NOT Doing

- Not expanding diagnosis beyond text-based agar and grain troubleshooting.
- Not adding support for photos, image analysis, saved chat history, sharing/social features, multi-user workflows, local export/download behavior, or cross-log comparison.
- Not making live-provider checks part of CI in this phase.
- Not replacing deterministic unit/integration tests with live AI calls.
- Not calibrating retrieval quality beyond preserving the current recall-first `matchThreshold = 0` default.
- Not adding a broad browser/e2e suite for this risk slice.
- Not reading or committing real local secrets.

## Implementation Approach

Restore the baseline first, then harden runtime contracts, then expand deterministic test coverage, then add a live-provider evaluation path. Deterministic tests should keep proving technical contracts cheaply: malformed provider shapes, redaction, scope routing, source membership, and UI schema handling. The live-provider checkpoint should prove that the same prepared F-03 cases produce acceptable behavior with the real OpenRouter-backed provider before the phase is closed.

## Critical Implementation Details

### Debug & Observability

Public production responses must stay controlled even when local development needs more detail. Implement the `8A-dev` decision by keeping provider/runtime details in server logs and allowing detailed response messages only under an explicit development-only condition, not as the default API contract.

### State Sequencing

Scope guardrails must run before thin-log missing-context handling. Unsupported, mixed-scope, and no-smell prompts should be refused or narrowed without embedding, retrieval, or provider generation; in-scope prompts against thin logs should still return `missing_context`.

### Live Provider Boundary

The live-provider evaluator must use the real provider path, real retrieval/RPC path, real `OPENROUTER_API_KEY`, and explicit Supabase live-evaluation setup, but it should remain outside CI and outside `npm run diagnosis:evaluate`. Use a separate command so the deterministic gate stays stable while the manual gate still exercises production-like AI behavior and retrieval setup.

## Phase 1: Restore Diagnosis Test Baseline

### Overview

This phase makes the current checkout testable again and removes accidental scaffolding drift before adding new behavior.

### Changes Required:

#### 1. Stray Test-Plan Injection Cleanup

**File**: `src/**`, `scripts/**`

**Intent**: Remove all accidental `runTestPlan` imports and calls from runtime, script, and test files. This is a full cleanup of the drift class, not only the diagnosis route, because the selected test gate cannot be trusted while unrelated parser/runtime failures remain.

**Contract**: `rg -n "runTestPlan" src scripts` returns no matches unless a real `src/lib/test-plan` module exists and is intentionally used by a future change.

#### 2. Diagnosis API Route Baseline

**File**: `src/pages/api/diagnosis/selected-log.ts`

**Intent**: Restore the selected-log API route so it compiles and delegates to `diagnoseSelectedLog` with a valid dependency object. Remove debug response mutation from the default public path.

**Contract**: The route exports uppercase `POST`, validates request shape before service execution, passes `{ createProvider: () => createDiagnosisProvider(apiKey) }`, and maps service responses through `statusFor(response)`.

#### 3. Provider Error Redaction

**File**: `src/lib/diagnosis/errors.ts`

**Intent**: Keep raw provider/runtime details in server logs while returning controlled public messages. Preserve retryability and error codes.

**Contract**: Unknown failures serialize as `provider_failed` with message `Diagnosis generation failed.` unless a development-only API layer intentionally exposes more detail locally.

#### 4. Retrieval Default Contract

**File**: `src/lib/diagnosis/retrieval.ts`

**Intent**: Keep the current `matchThreshold = 0` default and make the test contract match that decision. Do not treat this value as final quality calibration.

**Contract**: Default RPC args include `match_threshold: 0` and `match_count: 5`; explicit overrides still pass through unchanged. The threshold is a SQL similarity cutoff computed as `1 - (embedding <=> query_embedding)`, so valid values are similarity-scale values, not counts or scores like `20`.

#### 5. Existing Test Alignment

**File**: `src/lib/diagnosis/errors.test.ts`, `src/lib/diagnosis/retrieval.test.ts`, `src/pages/api/diagnosis/selected-log.test.ts`, `src/pages/api/auth/signin.test.ts`

**Intent**: Update existing tests so they assert the restored contracts instead of failing on stale drift.

**Contract**: Existing route, redaction, retrieval, and auth route tests run under `npm run test:unit` without transform errors from `runTestPlan`.

### Success Criteria:

#### Automated Verification:

- `rg -n "runTestPlan" src scripts` returns no matches.
- `npm run test:unit` reaches actual test execution without transform errors from `runTestPlan`.
- `npm run diagnosis:evaluate` starts without `src/lib/test-plan` module resolution errors.
- `src/lib/diagnosis/errors.test.ts` passes the controlled redaction expectation.
- `src/lib/diagnosis/retrieval.test.ts` expects the current `match_threshold: 0` default.

#### Manual Verification:

- Review the API route response contract and confirm production responses no longer include `[DEBUG]` by default.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets - the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Add Runtime Contract Guardrails

### Overview

This phase adds the minimal runtime behavior needed to prevent the most important unsafe schema-valid diagnosis outputs and to route unsupported prompts before provider calls.

### Changes Required:

#### 1. Post-Generation Contract Validator

**File**: `src/lib/diagnosis/contract.ts`

**Intent**: Add a small deterministic validator for the model's structured diagnosis after Zod parsing. This validator protects the real runtime from schema-valid but semantically unsafe responses.

**Contract**: The validator accepts the selected grow log, retrieved chunks, and parsed diagnosis. It returns either a valid diagnosis or a controlled `DiagnosisError("invalid_model_output", ...)` for hard violations: guarantee/certainty wording, smell-based advice, source labels not present in retrieved chunks, high-confidence responses without sources, or unsupported source/stage mismatch.

#### 2. Service Integration

**File**: `src/lib/diagnosis/service.ts`

**Intent**: Run the contract validator after `diagnosisResponseSchema.safeParse` and before returning `{ ok: true, diagnosis }`. Preserve existing missing-log, unsupported-stage, retrieval, and provider failure behavior.

**Contract**: `diagnoseSelectedLog` never returns a provider diagnosis that fails the new contract validator.

#### 3. Scope Guardrail Ordering

**File**: `src/lib/diagnosis/service.ts`

**Intent**: Evaluate question scope guardrails before thin-log missing-context handling. Unsupported prompts should not reach embedding, retrieval, or provider generation just because the selected log is thin.

**Contract**: `guardrailResponse(request.data.question)` runs after selected-log ownership/stage checks and before `lacksCriticalSelectedLogContext(growLog)`.

#### 4. Full F-03 Non-Goal Prechecks

**File**: `src/lib/diagnosis/service.ts`

**Intent**: Extend deterministic refusal/narrowing patterns for F-03 non-goals without adding support for those features.

**Contract**: Saved chat/history, export/download, multi-log comparison, social/sharing, and multi-user prompts are classified as `out_of_scope` or `mixed_scope` before provider work, depending on whether the question also includes supported agar/grain troubleshooting.

#### 5. Development-Only Error Detail Boundary

**File**: `src/pages/api/diagnosis/selected-log.ts`

**Intent**: Keep the user's `8A-dev` decision: local development can expose additional debug detail, but production/public API and UI messages remain controlled.

**Contract**: Any debug detail is gated by an explicit development-only condition and never appears by default in production response bodies.

### Success Criteria:

#### Automated Verification:

- Service tests prove schema-valid guarantee/certainty wording returns `invalid_model_output`.
- Service tests prove source labels not present in retrieved chunks return `invalid_model_output`.
- Service tests prove high-confidence responses without supporting sources return `invalid_model_output`.
- Service tests prove smell-based advice is rejected by the validator.
- Service tests prove out-of-scope and mixed-scope prompts beat thin-log `missing_context`.
- Service tests prove F-03 non-goal prompts short-circuit before embedding, retrieval, or provider generation.

#### Manual Verification:

- Review validator patterns for false positives against the prepared F-03 in-scope cases.
- Confirm no validator rule asks the user to check agar or grain by smell.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Expand Deterministic Contract Coverage

### Overview

This phase broadens stable tests around service, provider, API, UI, and deterministic evaluation without using live AI for unit/integration assertions.

### Changes Required:

#### 1. Provider Boundary Tests

**File**: `src/lib/diagnosis/provider.test.ts`

**Intent**: Prove malformed or partial AI SDK structured output is mapped into a controlled diagnosis error.

**Contract**: Partial `generateText` output and wrong output shape reject with `invalid_model_output`; timeout behavior remains mapped to `provider_timeout`.

#### 2. Service Contract Tests

**File**: `src/lib/diagnosis/service.test.ts`

**Intent**: Cover the highest-risk service behaviors with mocked provider boundaries where the risk is technical contract handling, not live model quality.

**Contract**: Tests include malformed provider output, raw provider throws after redaction, validator rejection, thin-log plus unsupported prompt ordering, F-03 non-goal prechecks, and no provider call for deterministic refusals.

#### 3. API Integration Tests

**File**: `src/pages/api/diagnosis/selected-log.test.ts`

**Intent**: Prove service errors translate to correct HTTP statuses and controlled response payloads.

**Contract**: `invalid_model_output`, `provider_failed`, and `provider_timeout` return 502; production/default messages contain no `[DEBUG]`, raw stack, provider model name, or unredacted provider text; development-only detail is covered separately if implemented.

#### 4. UI Schema Boundary Tests

**File**: `src/components/diagnosis/SelectedLogDiagnosisPanel.test.tsx`

**Intent**: Prove the React island refuses malformed API payloads instead of rendering partial diagnosis fields.

**Contract**: Malformed success payloads throw `Diagnosis returned an unexpected response.`, render no diagnosis fields, and keep retryability true.

#### 5. Deterministic Evaluation Runner

**File**: `scripts/evaluate-diagnosis-cases.ts`

**Intent**: Restore and strengthen the deterministic runner over prepared F-03 cases. This remains a contract oracle, not a live model quality benchmark.

**Contract**: The runner reads all 10 cases, observes all expected scope classes, consumes `expected_signals` and negative expectations more directly, and exits non-zero on missing case coverage or failed deterministic contract checks.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` passes.
- `npm run diagnosis:evaluate` passes deterministically without network/provider calls.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Review deterministic tests and confirm they do not assert copied production prose as exact expected answers.
- Review negative guardrail tests and confirm they test refusal behavior without endorsing unsupported features.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Add Live Provider Evaluation Gate

### Overview

This phase adds the required manual live-provider checkpoint. It uses real OpenRouter-backed AI behavior plus the real Supabase retrieval/RPC boundary while staying separate from CI and deterministic unit/integration gates.

### Changes Required:

#### 1. Live Evaluation Script

**File**: `scripts/evaluate-diagnosis-cases-live.ts`

**Intent**: Add a live-provider evaluator that runs prepared F-03 cases through the real service path with a real provider and real retrieval. It should use the same rubric expectations as the deterministic runner where possible, but tolerate natural wording variation.

**Contract**: The script uses a Node-safe Supabase client plus `createDiagnosisProvider(process.env.OPENROUTER_API_KEY ?? "")` or equivalent Node-safe secret reads. It does not import `astro:env/server` or `cloudflare:workers`. It requires `OPENROUTER_API_KEY`, `SUPABASE_URL`, a service-role Supabase key, and a configured live-evaluation owner ID before running. It verifies that diagnosis knowledge chunks are available, creates or maps temporary owner-scoped grow-log fixtures for the prepared F-03 cases, lets `diagnoseSelectedLog` use the real retrieval/RPC path, prints clear pass/fail detail per case, cleans up temporary rows where it creates them, and exits non-zero on setup errors or hard contract failures.

#### 2. Live Evaluation Package Script

**File**: `package.json`

**Intent**: Add a separate script for manual live-provider checks.

**Contract**: Add `diagnosis:evaluate:live` mapped to the live evaluator. Do not change `diagnosis:evaluate`; it remains deterministic and CI-friendly.

#### 3. Live Evaluation Documentation

**File**: `context/changes/testing-diagnosis-contract-hardening/live-provider-checkpoint.md`

**Intent**: Document how the human runs the live-provider checkpoint, what environment variables are required, and how to interpret failures.

**Contract**: The document states that the checkpoint requires a real `OPENROUTER_API_KEY`, Supabase URL, service-role key, live-evaluation owner ID, and ingested diagnosis knowledge. It explains that the run may cost money, uses network calls, touches local or configured Supabase data through temporary fixtures, is not part of CI in this phase, and must pass before closing Phase 4.

#### 4. Environment Example

**File**: `.env.example`

**Intent**: Provide committed variable names for local setup without secrets. The repository currently declares server secrets in `astro.config.mjs`, but the example file is absent.

**Contract**: The file contains placeholder names only, including `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `LIVE_EVALUATION_OWNER_ID`, and does not include real key material.

### Success Criteria:

#### Automated Verification:

- `npm run diagnosis:evaluate` still uses deterministic evaluation and does not require `OPENROUTER_API_KEY`.
- `npm run test:unit` passes after adding the live script and docs.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- With a real local `OPENROUTER_API_KEY`, Supabase service-role credentials, a live-evaluation owner ID, and ingested diagnosis knowledge, run `npm run diagnosis:evaluate:live`.
- Confirm the live run exercises the real provider path, real retrieval/RPC path, and all prepared F-03 cases.
- Confirm any live-provider or live-retrieval failures are classified as model/contract failures, provider/runtime failures, Supabase/RPC setup failures, fixture setup failures, or case-threshold ambiguity before deciding whether to adjust code, prompt, validator, environment setup, or documentation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the live-provider checkpoint passed before proceeding to the next phase.

---

## Phase 5: Final Verification And Handoff

### Overview

This phase closes the rollout plan with full verification, artifact sync, and a clear handoff for review.

### Changes Required:

#### 1. Verification Sweep

**File**: `package.json`, test outputs, local command results

**Intent**: Run the full deterministic and manual verification set after all implementation phases.

**Contract**: Final verification includes `npm run test:unit`, `npm run lint`, `npm run build`, `npm run diagnosis:evaluate`, and manual `npm run diagnosis:evaluate:live` with real provider credentials.

#### 2. Rollout State Sync

**File**: `context/foundation/test-plan.md`

**Intent**: Update rollout Phase 1 status only after `plan.md` exists and implementation progress justifies the status change. This phase should not claim completion until all Progress rows are done.

**Contract**: Phase 1 state follows the vocabulary in `context/foundation/test-plan.md`; after planning, it can be `planned`, during implementation `implementing`, and after all Progress rows are complete `complete`.

#### 3. Change Artifact Review

**File**: `context/changes/testing-diagnosis-contract-hardening/plan.md`, `context/changes/testing-diagnosis-contract-hardening/plan-brief.md`, `context/changes/testing-diagnosis-contract-hardening/live-provider-checkpoint.md`

**Intent**: Ensure the plan, brief, and live-checkpoint instructions match the implemented behavior and do not contain stale assumptions.

**Contract**: Artifacts accurately distinguish deterministic CI-friendly checks from manual live-provider checks.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `npm run diagnosis:evaluate` passes.
- `rg -n "runTestPlan" src scripts` returns no matches.

#### Manual Verification:

- `npm run diagnosis:evaluate:live` passes with a real `OPENROUTER_API_KEY`, Supabase service-role credentials, live-evaluation owner ID, and ingested diagnosis knowledge.
- Human confirms production/public API errors remain controlled while local development detail is available only behind the dev-only boundary.
- Human confirms the Phase 1 rollout status in `context/foundation/test-plan.md` matches the actual Progress state.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- Provider mapping for partial and malformed AI SDK output.
- Service validator failures for guarantee wording, invalid source membership, high-confidence unsupported output, and smell advice.
- Service guardrail ordering for out-of-scope/mixed-scope prompts against thin selected logs.
- F-03 non-goal prechecks for saved chat/history, export/download, multi-log comparison, social/sharing, and multi-user prompts.
- Retrieval default and explicit override behavior.

### Integration Tests:

- API route status mapping and response redaction for provider/service errors.
- UI request parser behavior for malformed success and error payloads.
- Deterministic evaluation runner over all prepared F-03 cases.

### Manual Testing Steps:

1. Run `npm run diagnosis:evaluate:live` with a real `OPENROUTER_API_KEY`, Supabase service-role credentials, live-evaluation owner ID, and ingested diagnosis knowledge.
2. Review live output for prepared F-03 cases and classify any failure before changing code.
3. Confirm public/prod API responses do not include `[DEBUG]`, raw stack details, provider internals, or unredacted model errors.
4. Confirm local/dev debug detail, if present, is clearly gated and not the production default.

## Performance Considerations

Deterministic prechecks should run before provider calls to avoid unnecessary embedding/generation cost for unsupported prompts. The runtime validator should remain simple string/source checks over one response and a small retrieved chunk list. Live-provider evaluation is intentionally manual because it uses network calls, secrets, provider rate limits, and billable model execution.

## Migration Notes

No database migrations are expected. This change may add `.env.example` if it is still absent, but only with placeholder variable names. No real secrets should be read or committed.

## References

- Related research: `context/changes/testing-diagnosis-contract-hardening/research.md`
- Rollout source: `context/foundation/test-plan.md:77`
- F-03 rubric: `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md`
- Prepared cases: `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`
- Contract surfaces: `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md`
- Diagnosis service: `src/lib/diagnosis/service.ts:177`
- Diagnosis provider: `src/lib/diagnosis/provider.ts:49`
- Diagnosis API route: `src/pages/api/diagnosis/selected-log.ts:41`
- Diagnosis UI parser: `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:88`
- Deterministic evaluator: `scripts/evaluate-diagnosis-cases.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Restore Diagnosis Test Baseline

#### Automated

- [x] 1.1 `rg -n "runTestPlan" src scripts` returns no matches. — a7ce5ce
- [x] 1.2 `npm run test:unit` reaches actual test execution without transform errors from `runTestPlan`. — a7ce5ce
- [x] 1.3 `npm run diagnosis:evaluate` starts without `src/lib/test-plan` module resolution errors. — a7ce5ce
- [x] 1.4 `src/lib/diagnosis/errors.test.ts` passes the controlled redaction expectation. — a7ce5ce
- [x] 1.5 `src/lib/diagnosis/retrieval.test.ts` expects the current `match_threshold: 0` default. supersedes the earlier Phase 1 `20` assumption after the Phase 4 live retrieval gate — a7ce5ce

#### Manual

- [x] 1.6 Review the API route response contract and confirm production responses no longer include `[DEBUG]` by default. — a7ce5ce

### Phase 2: Add Runtime Contract Guardrails

#### Automated

- [x] 2.1 Service tests prove schema-valid guarantee/certainty wording returns `invalid_model_output`. — c7a2386
- [x] 2.2 Service tests prove source labels not present in retrieved chunks return `invalid_model_output`. — c7a2386
- [x] 2.3 Service tests prove high-confidence responses without supporting sources return `invalid_model_output`. — c7a2386
- [x] 2.4 Service tests prove smell-based advice is rejected by the validator. — c7a2386
- [x] 2.5 Service tests prove out-of-scope and mixed-scope prompts beat thin-log `missing_context`. — c7a2386
- [x] 2.6 Service tests prove F-03 non-goal prompts short-circuit before embedding, retrieval, or provider generation. — c7a2386

#### Manual

- [x] 2.7 Review validator patterns for false positives against the prepared F-03 in-scope cases. — c7a2386
- [x] 2.8 Confirm no validator rule asks the user to check agar or grain by smell. — c7a2386

### Phase 3: Expand Deterministic Contract Coverage

#### Automated

- [x] 3.1 `npm run test:unit` passes. — 1838f67
- [x] 3.2 `npm run diagnosis:evaluate` passes deterministically without network/provider calls. — 1838f67
- [x] 3.3 `npm run lint` passes. — 1838f67
- [x] 3.4 `npm run build` passes. — 1838f67

#### Manual

- [x] 3.5 Review deterministic tests and confirm they do not assert copied production prose as exact expected answers. — 1838f67
- [x] 3.6 Review negative guardrail tests and confirm they test refusal behavior without endorsing unsupported features. — 1838f67

### Phase 4: Add Live Provider Evaluation Gate

#### Automated

- [x] 4.1 `npm run diagnosis:evaluate` still uses deterministic evaluation and does not require `OPENROUTER_API_KEY`. — a969c47
- [x] 4.2 `npm run test:unit` passes after adding the live script and docs. — a969c47
- [x] 4.3 `npm run lint` passes. — a969c47
- [x] 4.4 `npm run build` passes. — a969c47

#### Manual

- [x] 4.5 With a real local `OPENROUTER_API_KEY`, Supabase service-role credentials, a live-evaluation owner ID, and ingested diagnosis knowledge, run `npm run diagnosis:evaluate:live`. — a969c47
- [x] 4.6 Confirm the live run exercises the real provider path, real retrieval/RPC path, and all prepared F-03 cases. — a969c47
- [x] 4.7 Confirm any live-provider or live-retrieval failures are classified as model/contract failures, provider/runtime failures, Supabase/RPC setup failures, fixture setup failures, or case-threshold ambiguity before deciding whether to adjust code, prompt, validator, environment setup, or documentation. — a969c47

### Phase 5: Final Verification And Handoff

#### Automated

- [x] 5.1 `npm run test:unit` passes.
- [x] 5.2 `npm run lint` passes.
- [x] 5.3 `npm run build` passes.
- [x] 5.4 `npm run diagnosis:evaluate` passes.
- [x] 5.5 `rg -n "runTestPlan" src scripts` returns no matches.

#### Manual

- [x] 5.6 `npm run diagnosis:evaluate:live` passes with a real `OPENROUTER_API_KEY`, Supabase service-role credentials, live-evaluation owner ID, and ingested diagnosis knowledge.
- [x] 5.7 Human confirms production/public API errors remain controlled while local development detail is available only behind the dev-only boundary.
- [x] 5.8 Human confirms the Phase 1 rollout status in `context/foundation/test-plan.md` matches the actual Progress state.
