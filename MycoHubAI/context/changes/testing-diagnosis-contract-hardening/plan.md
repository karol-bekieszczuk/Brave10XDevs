# Testing Diagnosis Contract Hardening Implementation Plan

## Overview

Harden rollout Phase 1 from `context/foundation/test-plan.md`: diagnosis contract coverage for the already-built selected-log diagnosis system. This change restores the currently red test baseline, then adds deterministic protection for selected-log grounding, malformed provider/API/UI responses, and missing/mixed/out-of-scope diagnosis outcomes.

## Current State Analysis

`context/foundation/test-plan.md` identifies this rollout as "Diagnosis Contract Hardening" and assigns risks #1, #2, and #3 to the cheapest deterministic layers: unit, integration, and contract/evaluation tests. The selected-log diagnosis runtime already exists across `src/lib/diagnosis/**`, `src/pages/api/diagnosis/selected-log.ts`, `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx`, and `scripts/evaluate-diagnosis-cases.ts`.

The current checkout is not a clean baseline. `npm run test:unit` fails because `src/pages/api/diagnosis/selected-log.ts` contains an accidental `runTestPlan()` insertion that breaks parsing, and another accidental `runTestPlan()` call exists in `src/pages/api/auth/signin.test.ts`. `npm run lint` is also red, with the diagnosis evaluator and affected files showing formatting/type fallout. The hardening plan must therefore start by removing this test-plan contamination before adding more coverage.

## Desired End State

The diagnosis contract hardening rollout is complete when the repo has a green deterministic baseline and explicit tests proving:

- diagnosis runtime/API files do not import or execute test-plan/evaluator code;
- malformed or partial provider/API responses become controlled errors or safe UI states, not rendered nonsense;
- selected-log diagnosis outcomes visibly depend on the selected log and stage where enough context exists;
- missing-context, mixed-scope, out-of-scope, and no-smell paths follow the F-03 rubric without live provider calls;
- `diagnosis:evaluate` remains a deterministic contract oracle that can run without OpenRouter secrets.

### Key Discoveries:

- `context/foundation/test-plan.md:55` defines Risk #1: answer evidence must visibly depend on selected log/stage and uncertainty must stay bounded.
- `context/foundation/test-plan.md:56` defines Risk #2: bad provider shapes must be rejected or translated before UI render.
- `context/foundation/test-plan.md:57` defines Risk #3: missing-context, mixed-scope, and out-of-scope prompts must follow rubric outcomes.
- `context/foundation/test-plan.md:70` opens this rollout as `context/changes/testing-diagnosis-contract-hardening/`.
- `src/pages/api/diagnosis/selected-log.ts:4` imports `runTestPlan` into the runtime diagnosis API route.
- `src/pages/api/diagnosis/selected-log.ts:98` currently calls `await runTestPlan()` inside the route's service dependency object, causing a parse error.
- `src/pages/api/diagnosis/selected-log.ts:122` prefixes returned API error messages with `[DEBUG]`.
- `scripts/evaluate-diagnosis-cases.ts:5` and `scripts/evaluate-diagnosis-cases.ts:132` import and call `runTestPlan` in the evaluator.
- `src/pages/api/auth/signin.test.ts:50` contains another accidental `runTestPlan()` call outside the diagnosis surface.
- `src/lib/diagnosis/service.test.ts` already covers missing selected logs, empty retrieval, thin logs, mixed scope, out-of-scope requests, smell prompts, provider failure, and invalid structured output.
- `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:88` validates API payloads with `diagnosisApiResponseSchema.safeParse`.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md` is the canonical rubric for selected-log dependency, uncertainty, missing context, mixed scope, and out-of-scope redirects.
- `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json` contains the 10 prepared cases and the four scope classes.
- `context/foundation/lessons.md` requires no smell checks for agar or grain and keeps agent-written Markdown under `context/`.

## What We're NOT Doing

- No new diagnosis product behavior, UI features, knowledge content, database migrations, or provider model changes.
- No live OpenRouter calls in required verification for this rollout.
- No saved chat history, image analysis, photo upload, sharing, export, species advice, fruiting advice, or broader cultivation scope.
- No e2e/browser automation unless a later rollout phase proves deterministic tests cannot catch the risk cheaply.
- No production smoke-test claim. Runtime/provider smoke belongs to the later runtime failure and smoke layer.
- No review triage decisions on behalf of the user.

## Implementation Approach

Treat this as a test-hardening and decontamination change. Phase 1 restores a trustworthy baseline and blocks test-plan code from runtime paths. Phase 2 hardens Risk #2 across provider, API, and UI contracts. Phase 3 hardens selected-log grounding and scope behavior with deterministic service fixtures. Phase 4 tightens `diagnosis:evaluate` as the contract oracle over the prepared cases. Phase 5 updates rollout documentation and runs a no-live-provider manual gate.

## Critical Implementation Details

### State Sequencing

Baseline repair must land before new contract tests. Adding coverage while the route does not parse would blur whether failures come from old contamination or the new hardening assertions.

### Debug And Observability

Debug detail may be available only in a deliberate local/dev-only path, never as unconditional response text. API responses must not expose raw provider details, stack traces, selected-log body, or user question text.

## Phase 1: Baseline Decontamination And Green Gates

### Overview

Remove accidental test-plan execution from runtime, scripts, and tests, restore the diagnosis API route to a parseable request path, and establish a regression check that prevents test-plan code from entering runtime/API files again.

### Changes Required:

#### 1. Diagnosis API route decontamination

**File**: `src/pages/api/diagnosis/selected-log.ts`

**Intent**: Remove accidental test-plan imports/execution and restore the selected-log API route to a normal runtime handler.

**Contract**: The route must not import `runTestPlan` or any test-plan/evaluator module. It must call `diagnoseSelectedLog` with a valid dependency object and preserve uppercase `POST`, JSON responses, `context.locals.user`, `createClient`, request validation, provider construction, and `statusFor` mapping.

#### 2. Evaluator decontamination

**File**: `scripts/evaluate-diagnosis-cases.ts`

**Intent**: Keep the evaluator as a deterministic contract script, not a caller of unrelated test-plan code.

**Contract**: Remove `runTestPlan` import/call. The script should read the prepared cases, run deterministic service cases, and report results without invoking test-plan orchestration or live provider behavior.

#### 3. Stray test contamination cleanup

**File**: `src/pages/api/auth/signin.test.ts`

**Intent**: Remove the same accidental test-plan invocation even though the file is outside diagnosis.

**Contract**: Delete the stray `runTestPlan()` call and keep the sign-in route assertions behaviorally unchanged.

#### 4. Runtime/test-plan separation regression

**File**: `package.json`

**File**: `src/**/*.test.ts`

**Intent**: Make this class of accidental contamination visible in automated verification.

**Contract**: Add either a focused test or a documented verification command that fails when `runTestPlan`, `test-plan`, `diagnosis:evaluate`, or evaluation-only modules are imported from runtime API paths. The check must cover at least `src/pages/api/**` and can be implemented as a unit test or a simple `rg`-based automated criterion.

### Success Criteria:

#### Automated Verification:

- `rg -n "runTestPlan" src scripts` returns no runtime or script hits except an intentional regression test fixture if one exists.
- `src/pages/api/diagnosis/selected-log.ts` parses and exports uppercase `POST`.
- `npm run test:unit` passes.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Confirm no runtime/API file imports test-plan or evaluator code.
- Confirm this phase does not change diagnosis product behavior beyond removing accidental debug/test contamination.

**Implementation Note**: After completing this phase and automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Provider/API/UI Malformed Response Contract

### Overview

Harden Risk #2 by proving malformed provider output, provider failures, bad API payloads, and debug/error details do not leak into successful diagnosis responses or UI rendering.

### Changes Required:

#### 1. Provider malformed output tests

**File**: `src/lib/diagnosis/provider.test.ts`

**File**: `src/lib/diagnosis/service.test.ts`

**Intent**: Prove malformed or partial provider responses cannot pass as successful diagnosis output.

**Contract**: Cover missing required fields, unsupported `scopeStatus`, invalid confidence values, invalid source objects, provider timeouts, and provider failures. Invalid structured output must produce `invalid_model_output` or another controlled retryable error without diagnosis content.

#### 2. API error response contract

**File**: `src/pages/api/diagnosis/selected-log.ts`

**File**: `src/pages/api/diagnosis/selected-log.test.ts`

**Intent**: Ensure the API translates controlled service/provider failures into stable JSON and status codes.

**Contract**: Test `invalid_request`, `unauthorized`, `grow_log_not_found`, `retrieval_failed`, `provider_failed`, `provider_timeout`, and `invalid_model_output` status mappings. Response bodies must remain schema-valid. Debug detail, if retained, must be explicitly gated to local/dev mode and tested so production-shaped responses do not include `[DEBUG]`, stack traces, raw provider messages, selected-log body, or user question text.

#### 3. UI malformed payload handling

**File**: `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx`

**File**: `src/components/diagnosis/SelectedLogDiagnosisPanel.test.tsx`

**Intent**: Prove the React island does not render malformed API payloads, raw JSON, or debug details as diagnosis content.

**Contract**: Tests should cover malformed success payloads, malformed error payloads, non-retryable controlled errors, retryable controlled errors, and network/parse failures. UI output must show a controlled error state and never render raw schema fields such as `scopeStatus` as debug JSON.

#### 4. Controlled error serialization

**File**: `src/lib/diagnosis/errors.ts`

**File**: `src/lib/diagnosis/errors.test.ts`

**Intent**: Keep raw provider exceptions and stack traces out of serialized API errors.

**Contract**: `toDiagnosisError` must serialize unknown failures to a stable public message while preserving retryability. Any diagnostic logging must avoid full grow-log/question content and must not affect response bodies.

### Success Criteria:

#### Automated Verification:

- Provider tests reject partial or malformed structured output.
- Service tests confirm invalid provider output returns a controlled retryable error with no diagnosis payload.
- API tests cover error status mappings and schema-valid error bodies.
- API tests confirm production-shaped responses do not include `[DEBUG]`, stack traces, raw provider text, selected-log body, or user question text.
- UI tests confirm malformed payloads render a controlled error state.
- `npm run test:unit` passes.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Inspect API/UI error copy and confirm dev-only debug behavior, if any, is explicit and not unconditional.
- Confirm Risk #2 is covered across provider, API, and UI boundaries rather than by provider happy-path mocks only.

**Implementation Note**: After completing this phase and automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Selected-Log Grounding And Scope Contract Tests

### Overview

Harden Risks #1 and #3 with deterministic service/prompt fixtures that prove answers depend on selected log evidence and scope outcomes match the rubric.

### Changes Required:

#### 1. Selected-log grounding fixtures

**File**: `src/lib/diagnosis/service.test.ts`

**Intent**: Prove sufficiently detailed in-scope logs do not collapse into generic fallback behavior.

**Contract**: Add agar and grain fixtures where the selected log contains enough relevant detail. The assertions should prove the service uses selected `stage`, log text, and same-stage retrieved chunks before generation, and that a generic `missing_context` fallback is not accepted for these in-scope cases.

#### 2. Prompt selected-log dependency assertions

**File**: `src/lib/diagnosis/prompt.test.ts`

**Intent**: Keep selected log facts and rubric guardrails in the generation input.

**Contract**: Assert the prompt includes stage/title/body/question, same-stage source labels, uncertainty requirements, selected-log dependency, no guaranteed diagnosis language, missing-context handling, mixed-scope handling, out-of-scope redirect, no smell checks, no image/photo analysis, and no saved chat history.

#### 3. Scope and smell guardrail matrix

**File**: `src/lib/diagnosis/service.test.ts`

**Intent**: Make the rubric outcomes explicit at the service boundary.

**Contract**: Add or consolidate cases for `missing_context`, `mixed_scope`, `out_of_scope`, and no-smell behavior using the same scope labels as `diagnosisResponseSchema`. Guardrail shortcuts must not call embedding, retrieval, or generation when they can be resolved deterministically.

#### 4. Retrieval fallback interpretation

**File**: `src/lib/diagnosis/retrieval.test.ts`

**File**: `src/lib/diagnosis/service.test.ts`

**Intent**: Protect the existing lesson that generic `missing_context` for meaningful in-scope A/G cases is a retrieval/setup failure signal, not proof of good diagnosis quality.

**Contract**: Keep default retrieval thresholds aligned with the intended small-corpus behavior, and test that no same-stage chunks produce `missing_context` only in the explicit no-match path.

### Success Criteria:

#### Automated Verification:

- Agar and grain in-scope service fixtures reach provider generation and do not return generic `missing_context`.
- Prompt tests confirm selected log facts and all F-03 guardrails are included.
- Scope matrix tests cover `in_scope`, `missing_context`, `mixed_scope`, and `out_of_scope`.
- No-smell guardrail tests confirm smell questions do not call embedding, retrieval, or generation.
- Retrieval fallback tests preserve the intended default threshold behavior.
- `npm run test:unit` passes.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Confirm new tests are contract-oriented and do not merely duplicate implementation internals.
- Confirm no smell-based agar/grain guidance was introduced in prompts, tests, or fixtures.

**Implementation Note**: After completing this phase and automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: Deterministic Evaluator Hardening

### Overview

Keep `diagnosis:evaluate` as a no-live-provider contract oracle over the 10 prepared F-03 cases, with stricter failure reporting and selected-log dependency checks.

### Changes Required:

#### 1. Evaluator schema and case validation

**File**: `scripts/evaluate-diagnosis-cases.ts`

**Intent**: Fail early when the prepared case artifact no longer matches the expected contract.

**Contract**: Validate exactly 10 cases, stage values limited to `agar` or `grain`, scope classes limited to `in_scope`, `missing_context`, `mixed_scope`, and `out_of_scope`, and `counts_toward_prd_accuracy` present for each case.

#### 2. Evaluator outcome checks

**File**: `scripts/evaluate-diagnosis-cases.ts`

**Intent**: Make deterministic failures explain which rubric contract broke.

**Contract**: Checks must cover scope class, selected-log dependency for in-scope cases, uncertainty/non-guarantee language, missing-context follow-up behavior, mixed-scope refusal, out-of-scope redirect, no smell/photo/chat/share/fruiting leakage, and PRD denominator separation.

#### 3. Evaluator tests or smoke wrapper

**File**: `scripts/*.test.ts`

**File**: `package.json`

**Intent**: Make evaluator regressions visible in ordinary automated verification.

**Contract**: Add focused tests for evaluator helpers if practical, or ensure `npm run diagnosis:evaluate` is a required automated success criterion for this phase. The script must not require `OPENROUTER_API_KEY`, local Supabase, or live network access.

#### 4. Failure output readability

**File**: `scripts/evaluate-diagnosis-cases.ts`

**Intent**: Make failed contract checks actionable for future implementers.

**Contract**: Failure output must include case ID, expected scope, actual scope or error, PRD accuracy bucket, and failed check names.

### Success Criteria:

#### Automated Verification:

- `npm run diagnosis:evaluate` reads exactly 10 prepared cases.
- `npm run diagnosis:evaluate` reports all four scope classes.
- `npm run diagnosis:evaluate` separates PRD accuracy cases from guardrail-only cases.
- `npm run diagnosis:evaluate` fails on missing observed scope classes or failed case checks.
- Evaluator does not import or call `runTestPlan`.
- Evaluator does not require OpenRouter secrets, Supabase, or live network access.
- `npm run test:unit` passes.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Review one sample evaluator pass output and confirm failures would be actionable.
- Confirm evaluator remains deterministic and no-live-provider by design.

**Implementation Note**: After completing this phase and automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 5: Rollout Documentation And Manual Gate

### Overview

Close the rollout by documenting the new testing floor and running a manual gate that avoids mandatory live provider smoke.

### Changes Required:

#### 1. Test plan cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Capture the hardening patterns that future diagnosis tests should follow.

**Contract**: Update only the relevant cookbook or per-rollout notes. Keep the strategy and risk map stable unless implementation teaches a concrete correction.

#### 2. Change-local verification note

**File**: `context/changes/testing-diagnosis-contract-hardening/plan.md`

**Intent**: Keep final verification tied to the plan's `## Progress` section and this rollout's no-live-provider boundary.

**Contract**: `/10x-implement` should flip progress rows and append commit SHAs only after phase verification. Do not claim production or live model readiness from this rollout.

#### 3. Final scope audit

**File**: `src/lib/diagnosis/**`

**File**: `src/pages/api/diagnosis/**`

**File**: `src/components/diagnosis/**`

**File**: `scripts/evaluate-diagnosis-cases.ts`

**Intent**: Confirm hardening did not expand product scope.

**Contract**: Search and inspect for no live web search, saved chat history persistence, image/photo upload, species advice, smell-check guidance, sharing, export, or fruiting-stage support.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `npm run diagnosis:evaluate` passes.
- Search confirms no `runTestPlan` imports/calls remain in runtime, scripts, or tests unless intentionally isolated in a regression fixture.
- Search confirms no smell-check guidance exists in diagnosis prompts, knowledge files, UI copy, tests, or evaluator fixtures.
- Search confirms no live web search, saved chat history persistence, image/photo upload, species advice, sharing, export, or fruiting-stage support was added.

#### Manual Verification:

- Review `diagnosis:evaluate` output and confirm it is deterministic contract output, not live provider quality output.
- Review API/UI error copy and confirm dev-only debug behavior is not unconditional.
- Confirm live OpenRouter smoke is not required for this rollout and remains in the later runtime smoke layer.

**Implementation Note**: After completing this phase and automated verification passes, pause for manual confirmation before closing the change.

---

## Testing Strategy

### Unit Tests:

- Diagnosis API route status/body contract for controlled service failures.
- Provider/service malformed structured output handling.
- UI malformed payload and controlled error rendering.
- Selected-log grounding fixtures for agar and grain.
- Scope outcome matrix for `in_scope`, `missing_context`, `mixed_scope`, and `out_of_scope`.
- Prompt guardrail assertions for uncertainty, selected-log dependency, no smell, no photo/image analysis, no saved chat history, and unsupported-scope redirects.

### Integration Tests:

- Treat API route tests as integration-style boundary tests over the request handler with mocked service/provider/Supabase edges.
- Treat `diagnosis:evaluate` as a contract/evaluation integration over the prepared F-03 case file and deterministic service dependencies.

### Manual Testing Steps:

1. Run `npm run test:unit`.
2. Run `npm run lint`.
3. Run `npm run build`.
4. Run `npm run diagnosis:evaluate`.
5. Inspect the evaluator output for all 10 cases, four scope classes, and PRD/guardrail bucket separation.
6. Inspect API/UI error copy for no unconditional `[DEBUG]`, raw provider details, stack traces, selected-log body, or user question text.
7. Confirm no live provider secret or OpenRouter call was required for this rollout.

## Performance Considerations

This rollout should not add runtime work. New tests and evaluator checks must remain deterministic and bounded. Do not introduce live provider calls, local Supabase requirements, browser automation, or long-running smoke tests into the mandatory verification path.

## Migration Notes

No database migration is required. The plan may touch `context/foundation/test-plan.md` documentation, diagnosis runtime/tests, API/UI tests, and evaluator script behavior only.

## References

- Test rollout source: `context/foundation/test-plan.md:55`
- Phase row: `context/foundation/test-plan.md:70`
- F-03 rubric: `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md`
- F-03 prepared cases: `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`
- Selected-log diagnosis plan: `context/changes/selected-log-diagnosis/plan.md`
- Selected-log manual cases: `context/changes/selected-log-diagnosis/test-cases/manual-diagnosis-questions.md`
- Runtime diagnosis service: `src/lib/diagnosis/service.ts`
- Diagnosis API route: `src/pages/api/diagnosis/selected-log.ts`
- Diagnosis UI island: `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx`
- Deterministic evaluator: `scripts/evaluate-diagnosis-cases.ts`
- No-smell lesson: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baseline Decontamination And Green Gates

#### Automated

- [ ] 1.1 `rg -n "runTestPlan" src scripts` returns no runtime or script hits except an intentional regression test fixture if one exists.
- [ ] 1.2 `src/pages/api/diagnosis/selected-log.ts` parses and exports uppercase `POST`.
- [ ] 1.3 `npm run test:unit` passes.
- [ ] 1.4 `npm run lint` passes.
- [ ] 1.5 `npm run build` passes.

#### Manual

- [ ] 1.6 Confirm no runtime/API file imports test-plan or evaluator code.
- [ ] 1.7 Confirm this phase does not change diagnosis product behavior beyond removing accidental debug/test contamination.

### Phase 2: Provider/API/UI Malformed Response Contract

#### Automated

- [ ] 2.1 Provider tests reject partial or malformed structured output.
- [ ] 2.2 Service tests confirm invalid provider output returns a controlled retryable error with no diagnosis payload.
- [ ] 2.3 API tests cover error status mappings and schema-valid error bodies.
- [ ] 2.4 API tests confirm production-shaped responses do not include `[DEBUG]`, stack traces, raw provider text, selected-log body, or user question text.
- [ ] 2.5 UI tests confirm malformed payloads render a controlled error state.
- [ ] 2.6 `npm run test:unit` passes.
- [ ] 2.7 `npm run lint` passes.
- [ ] 2.8 `npm run build` passes.

#### Manual

- [ ] 2.9 Inspect API/UI error copy and confirm dev-only debug behavior, if any, is explicit and not unconditional.
- [ ] 2.10 Confirm Risk #2 is covered across provider, API, and UI boundaries rather than by provider happy-path mocks only.

### Phase 3: Selected-Log Grounding And Scope Contract Tests

#### Automated

- [ ] 3.1 Agar and grain in-scope service fixtures reach provider generation and do not return generic `missing_context`.
- [ ] 3.2 Prompt tests confirm selected log facts and all F-03 guardrails are included.
- [ ] 3.3 Scope matrix tests cover `in_scope`, `missing_context`, `mixed_scope`, and `out_of_scope`.
- [ ] 3.4 No-smell guardrail tests confirm smell questions do not call embedding, retrieval, or generation.
- [ ] 3.5 Retrieval fallback tests preserve the intended default threshold behavior.
- [ ] 3.6 `npm run test:unit` passes.
- [ ] 3.7 `npm run lint` passes.
- [ ] 3.8 `npm run build` passes.

#### Manual

- [ ] 3.9 Confirm new tests are contract-oriented and do not merely duplicate implementation internals.
- [ ] 3.10 Confirm no smell-based agar/grain guidance was introduced in prompts, tests, or fixtures.

### Phase 4: Deterministic Evaluator Hardening

#### Automated

- [ ] 4.1 `npm run diagnosis:evaluate` reads exactly 10 prepared cases.
- [ ] 4.2 `npm run diagnosis:evaluate` reports all four scope classes.
- [ ] 4.3 `npm run diagnosis:evaluate` separates PRD accuracy cases from guardrail-only cases.
- [ ] 4.4 `npm run diagnosis:evaluate` fails on missing observed scope classes or failed case checks.
- [ ] 4.5 Evaluator does not import or call `runTestPlan`.
- [ ] 4.6 Evaluator does not require OpenRouter secrets, Supabase, or live network access.
- [ ] 4.7 `npm run test:unit` passes.
- [ ] 4.8 `npm run lint` passes.
- [ ] 4.9 `npm run build` passes.

#### Manual

- [ ] 4.10 Review one sample evaluator pass output and confirm failures would be actionable.
- [ ] 4.11 Confirm evaluator remains deterministic and no-live-provider by design.

### Phase 5: Rollout Documentation And Manual Gate

#### Automated

- [ ] 5.1 `npm run test:unit` passes.
- [ ] 5.2 `npm run lint` passes.
- [ ] 5.3 `npm run build` passes.
- [ ] 5.4 `npm run diagnosis:evaluate` passes.
- [ ] 5.5 Search confirms no `runTestPlan` imports/calls remain in runtime, scripts, or tests unless intentionally isolated in a regression fixture.
- [ ] 5.6 Search confirms no smell-check guidance exists in diagnosis prompts, knowledge files, UI copy, tests, or evaluator fixtures.
- [ ] 5.7 Search confirms no live web search, saved chat history persistence, image/photo upload, species advice, sharing, export, or fruiting-stage support was added.

#### Manual

- [ ] 5.8 Review `diagnosis:evaluate` output and confirm it is deterministic contract output, not live provider quality output.
- [ ] 5.9 Review API/UI error copy and confirm dev-only debug behavior is not unconditional.
- [ ] 5.10 Confirm live OpenRouter smoke is not required for this rollout and remains in the later runtime smoke layer.
