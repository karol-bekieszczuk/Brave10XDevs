# Runtime Failure And Smoke Layer Implementation Plan

## Overview

Rollout Phase 3 protects the application-owned runtime failure contract and adds the smallest browser smoke that crosses authentication, Astro routes, Supabase persistence, redirects, and SSR rereads. The rollout deliberately separates deterministic provider/runtime checks from Playwright infrastructure and reserves one phase for `$10x-e2e` after the runner and built application are ready.

The plan uses only the existing local and CI environments. It does not simulate Supabase outages, introduce preview/staging infrastructure, call OpenRouter as a rollout gate, or predict HTTP codes returned by OpenRouter or Cloudflare.

## Current State Analysis

The checkout already classifies provider failures inside the application, releases diagnosis admission in `finally`, and has focused unit coverage for provider, service, route, and UI behavior. However, the route test mocks runtime env, provider construction, and service orchestration together, so no test protects the real missing-key path across those application boundaries (`src/pages/api/diagnosis/selected-log.test.ts:7-22`).

Runtime bindings are read Cloudflare-first with an Astro fallback, but the bridge has no direct test and currently treats whitespace-only strings as configured (`src/lib/runtime-env.ts:1-30`). Build and CI validate source and bundle generation, but CI does not start the Worker (`.github/workflows/ci.yml:18-27`). The Worker unit test mocks Astro's handler, so it does not execute the built adapter/runtime path (`src/worker.test.ts:7-15,44-52`).

No Playwright dependency, config, browser spec, auth state, runner script, or E2E CI job exists. The authenticated browser flow itself is already implemented: create routes persist grow logs, `/grow-logs` renders the owner list through SSR, cards expose accessible selection labels, and bulk delete redirects back with controlled feedback (`src/components/grow-logs/GrowLogForm.astro:29-74`, `src/components/grow-logs/GrowLogCard.astro:22-35`, `src/pages/grow-logs/index.astro:7-11,84-108`).

## Desired End State

A missing or whitespace-only provider key follows the real application orchestration path and produces a vendor-neutral, retryable, schema-valid, redacted failure without contacting OpenRouter. Against a running disposable local Supabase, the same failure consumes the intentionally admitted attempt/cooldown, clears the active claim, preserves the grow log, persists no provider/diagnosis content, and cleans up its exact fixture user.

The built Cloudflare-oriented application runs locally through workerd under a deterministic harness. Playwright receives an authenticated disposable owner via `storageState`, while the same generated owner ID is injected as `AUTHORIZED_USER_ID` before the server starts. One `$10x-e2e` phase then proves create-two, bulk-delete-one, and SSR-reload persistence with a reviewed, deliberate-break-verified browser spec.

### Key Discoveries:

- Cloudflare bindings take precedence over Astro server env, but no direct test protects precedence, missing values, or whitespace handling (`src/lib/runtime-env.ts:10-30`).
- Provider construction is lazy and happens only after validation, owner lookup, scope guards, and durable admission (`src/lib/diagnosis/service.ts:217-268`).
- Missing provider configuration is an application-owned `provider_failed` case and requires no OpenRouter request (`src/lib/diagnosis/provider.ts:71-77`).
- Admission release clears only `active_claim_id` and `active_expires_at`; attempt count and opaque cooldown remain intentionally (`supabase/migrations/20260804120000_create_diagnosis_admission.sql:94-119`).
- Middleware requires both a real Supabase session and an exact `AUTHORIZED_USER_ID` match, so generating `storageState` after server startup is insufficient (`src/middleware.ts:27-59`, `src/lib/access-control.ts:11-23`).
- Current Astro Cloudflare guidance supports `astro build` followed by `astro preview` for a local workerd approximation; that local execution is not proof of deployed Cloudflare secret values.

## What We're NOT Doing

- No Supabase outage, unavailability, timeout, retry, backoff, failover, or upstream status-code testing.
- No prediction or mapping of HTTP codes returned by OpenRouter or Cloudflare. Tests protect the application error schema and user-visible behavior, not upstream response tables.
- No assertion of a specific application HTTP status for the missing-provider response in this rollout.
- No preview, staging, pre-production, or other additional deployment environment.
- No removal, corruption, or rotation of production secrets to manufacture failures.
- No claim that a local workerd run proves deployed Cloudflare bindings or production readiness.
- No live OpenRouter happy-path or failure call as an automated or manual rollout gate.
- No release-RPC failure, stale-lease recovery, or Supabase failure characterization in this change.
- No zero-database-write oracle: admitted attempts and cooldown fingerprints remain by design.
- No broad CRUD E2E suite, screenshot/vision testing, pixel assertions, RLS proof, cross-owner proof, hostile-input proof, provider-cost proof, or redaction proof through the browser.
- No changes to product scope, diagnosis history, sharing, multi-user access, or production data.

## Implementation Approach

Use the cheapest honest layer for each claim. Vitest protects env resolution and the real missing-key orchestration while mocking only the Supabase edge. A separate loopback-only smoke uses real local Supabase sessions and persisted-state oracles for admission release. The Playwright harness then creates a disposable owner before starting the built workerd server, passes that owner's ID into the runtime, authenticates without driving the sign-in UI, and always cleans up exact generated resources.

Playwright infrastructure lands before the business-risk spec. Phase 4 is explicitly executed with `$10x-e2e`, which creates or adapts the seed and E2E rules, generates one risk-bound spec, reviews the five anti-patterns, runs the single spec green, proves it turns red under a deliberate break, and immediately reverts that break.

## Critical Implementation Details

### Timing & lifecycle

The E2E harness must create the disposable confirmed Supabase user first, then export that exact ID as `AUTHORIZED_USER_ID`, and only then start `astro build` plus the workerd-backed preview. Authentication state is generated after the server is listening. Cleanup runs in `finally` after success, test failure, setup failure, or browser failure; the harness never reuses a stale server whose authorization binding belongs to another fixture user.

### State sequencing

The provider-failure persistence oracle is intentionally not “no writes.” Acquisition happens before provider construction, so a valid missing-key request retains one attempt and opaque cooldown while release clears the active claim. The test must inspect these fields separately and verify the grow log remains unchanged.

### Debug & observability

Failure assertions use controlled sentinel values and the public schema. They must demonstrate that no provider brand, raw exception, secret, stack, grow-log body, or sentinel reaches the response. They do not assert an upstream or application HTTP status for the missing-key case.

## Phase 1: Protect The Deterministic Runtime Failure Contract

### Overview

Make missing runtime configuration explicit and protect the real application-owned provider failure path without network calls or a real database.

### Changes Required:

#### 1. Runtime environment resolution

**File**: `src/lib/runtime-env.ts`, `src/lib/runtime-env.test.ts`

**Intent**: Make the Cloudflare-first fallback behavior testable and ensure blank configuration cannot be mistaken for a usable secret.

**Contract**: Cloudflare binding wins when non-blank; Astro server env is the fallback; missing, empty, and whitespace-only values resolve to `undefined`. Tests isolate both virtual env sources and restore module state between cases.

#### 2. Vendor-neutral missing-provider failure

**File**: `src/lib/diagnosis/provider.ts`, `src/lib/diagnosis/provider.test.ts`

**Intent**: Preserve the typed `provider_failed` classification while removing OpenRouter-specific configuration detail from the public message.

**Contract**: `createDiagnosisProvider(undefined)` and blank-equivalent input throw a retryable `DiagnosisError` with code `provider_failed` and a vendor-neutral message. No SDK client, embedding, or generation call is created.

#### 3. Real application orchestration integration

**File**: `src/pages/api/diagnosis/selected-log.runtime-failure.test.ts`

**Intent**: Cover the current gap between runtime env, lazy provider creation, diagnosis service orchestration, admission release, and the route's public response schema.

**Contract**: Keep request parsing, the real diagnosis service, and the real provider factory in the test path. Mock only the Supabase/repository/admission edge needed to supply a valid owner log and observable release. Assert a schema-valid `provider_failed` response that is retryable and vendor-neutral; do not assert a specific HTTP status. Use raw-error, secret, provider-name, and grow-log sentinel values to prove response redaction and assert zero OpenRouter network work.

### Success Criteria:

#### Automated Verification:

- Focused runtime failure tests pass: `npm.cmd run test:unit -- src/lib/runtime-env.test.ts src/lib/diagnosis/provider.test.ts src/pages/api/diagnosis/selected-log.runtime-failure.test.ts`.
- Runtime env tests prove Cloudflare precedence, Astro fallback, and missing/empty/whitespace handling.
- Missing-provider integration proves a retryable, vendor-neutral, schema-valid failure with no raw sentinel or provider name in the response and no external provider call.
- The integration proves admission release is attempted after the lazy provider factory fails.
- Canonical typecheck passes: `npm.cmd run typecheck`.

#### Manual Verification:

- Review the authenticated missing-provider copy and confirm it is actionable without naming OpenRouter or exposing configuration details.

**Implementation Note**: Pause after all automated checks pass and wait for manual confirmation before closing the phase.

---

## Phase 2: Prove Persisted Admission State After Provider Failure

### Overview

Use a disposable local Supabase principal to prove the exact database state left by an admitted request whose provider cannot be configured. Supabase remains healthy throughout this phase.

### Changes Required:

#### 1. Loopback-only provider failure smoke

**File**: `scripts/smoke-runtime-provider-failure.ts`

**Intent**: Exercise the real diagnosis service and real admission RPCs against local Supabase while making provider construction fail locally before any network request.

**Contract**: Require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the process environment; refuse non-loopback URLs; create one uniquely named confirmed Auth user and a real JWT session; insert one in-scope grow log; invoke the real service with the real missing-key provider factory; and use the admin client only for exact fixtures, persisted-state oracles, and cleanup. The script never resets Supabase itself.

#### 2. Persisted-state oracle and cleanup

**File**: `scripts/smoke-runtime-provider-failure.ts`

**Intent**: Distinguish intentional abuse-accounting state from corrupted or leaked business/provider state.

**Contract**: Assert one attempt and one opaque cooldown remain; `active_claim_id` and `active_expires_at` are null; the grow-log row is unchanged; no raw question, grow-log body, provider output, error body, or diagnosis result is stored. Hard-delete only the generated fixture user in `finally`, surface cleanup failures, and demonstrate cleanup still runs when the smoke is deliberately failed.

#### 3. Focused package command

**File**: `package.json`, `package-lock.json`

**Intent**: Give agents and CI a stable command for the persisted provider-failure proof without broadening `test:rls`.

**Contract**: Add a dedicated script such as `test:runtime:provider-failure` that runs the new smoke and accepts credentials only from the invoking shell environment.

### Success Criteria:

#### Automated Verification:

- After an explicit manual reset of the disposable local Supabase stack, `npm.cmd run test:runtime:provider-failure` passes with credentials supplied through the process environment.
- The smoke proves attempt/cooldown retention, active-claim release, unchanged grow-log state, and absence of persisted provider/diagnosis content.
- A forced assertion failure demonstrates exact-user cleanup still runs and the temporary failure is reverted.
- A non-loopback URL is refused before user creation, mutation, or provider work.
- Canonical typecheck passes: `npm.cmd run typecheck`.

#### Manual Verification:

- Confirm the target Supabase URL is loopback-only, reset that disposable local stack before the smoke, and verify the reported generated user is absent after completion.

**Implementation Note**: The manual database reset is a prerequisite for running this phase's persisted smoke. The smoke itself must never reset the database. Pause for confirmation before committing.

---

## Phase 3: Build The Workerd And Playwright Harness

### Overview

Install and configure the browser runner, deterministic auth lifecycle, built-runtime startup, local HTTP smoke, and CI foundation without adding the create/delete business-risk spec yet. Drive this phase with `$10x-implement`.

### Changes Required:

#### 1. Playwright runner and commands

**File**: `package.json`, `package-lock.json`, `playwright.config.ts`

**Intent**: Establish one Chromium-based E2E project with a stable all-suite command and a command shape that forwards a single spec path.

**Contract**: Add `@playwright/test`, a project-level `testDir`, loopback `baseURL`, a setup project, a Chromium project dependent on setup, state-based timeouts, trace-on-retry diagnostics, and built-server orchestration. `npm.cmd run test:e2e -- tests/e2e/<spec>.spec.ts` must be a supported single-spec invocation. Do not add Firefox/WebKit or visual testing in this rollout.

#### 2. Disposable owner lifecycle and auth state

**File**: `scripts/run-e2e.ts`, `tests/e2e/auth.setup.ts`, `tests/e2e/fixtures.ts`

**Intent**: Create a fresh local owner before server startup, authenticate without the UI, and guarantee exact cleanup.

**Contract**: The harness refuses non-loopback Supabase, creates one uniquely named confirmed user with the service-role client, injects its ID as `AUTHORIZED_USER_ID` into the child build/preview and Playwright processes, and starts no server before that ID exists. The setup project signs in through the application request contract and saves `storageState`; tests consume it without driving the sign-in page. Cleanup deletes only the generated user and temporary auth state in `finally`, including setup/test failure paths.

#### 3. Built Worker runtime smoke

**File**: `scripts/smoke-worker-runtime.ts`, `scripts/run-e2e.ts`

**Intent**: Prove the built Astro Cloudflare output boots under local workerd and executes application routing before browser tests begin.

**Contract**: Build first, then start `astro preview` or the equivalent adapter-backed workerd command. Probe the public sign-in render and the application-owned redirect destination for one protected unauthenticated request. Assert page markers and redirect behavior, not Cloudflare error codes. The smoke is explicitly local evidence only.

#### 4. Generated-artifact hygiene

**File**: `.gitignore`

**Intent**: Prevent session cookies, temporary user metadata, browser output, traces, and reports from entering version control.

**Contract**: Ignore the chosen `playwright/.auth/`, `test-results/`, `playwright-report/`, and harness metadata paths while keeping test source and seed/rules files trackable.

#### 5. CI infrastructure gate

**File**: `.github/workflows/ci.yml`

**Intent**: Prove the runner and auth/setup harness in the existing CI environment before the business-risk spec lands.

**Contract**: Add an isolated browser job that installs Chromium, starts and explicitly resets the local Supabase stack, derives only local credentials, runs the built-runtime smoke plus Playwright setup project, and performs cleanup. It must not consume hosted/production Supabase credentials and must stop local services even on failure.

### Success Criteria:

#### Automated Verification:

- Playwright config exposes `testDir`, loopback `baseURL`, setup-to-Chromium dependency, and built-runtime startup; the package command forwards a single spec path.
- The local harness creates the owner before server startup, loads `/grow-logs` from saved auth state without UI login, and removes the user/auth state after success.
- A forced setup or test failure proves the harness cleanup path still runs, after which the temporary failure is reverted.
- Built-runtime smoke passes against `astro build` plus workerd-backed preview and checks application render/redirect outcomes without asserting Cloudflare error codes.
- CI installs Chromium, uses only disposable local Supabase, runs the setup/runtime gate, and contains no hosted or production mutation target.
- Unit tests pass: `npm.cmd run test:unit`.
- Lint passes: `npm.cmd run lint`.
- Build passes: `npm.cmd run build`.
- Canonical typecheck passes: `npm.cmd run typecheck`.

#### Manual Verification:

- Inspect ignored artifacts and confirm no storage state, cookie, password, service-role value, or fixture metadata is tracked.
- Run the harness once headed and confirm the browser starts already authenticated against the built local runtime, with no stale server reuse.

**Implementation Note**: Do not add the create-two/bulk-delete-one/reload spec in this phase. After this phase is committed, Phase 4 becomes eligible for `$10x-e2e`.

---

## Phase 4: Protect Grow-Log Mutation And SSR Persistence In The Browser

### Overview

Generate and harden exactly one browser spec for the cross-boundary runtime/SSR risk. Drive this phase with `$10x-e2e testing-runtime-failure-smoke-layer phase 4`.

### Changes Required:

#### 1. E2E quality levers

**File**: `tests/e2e/seed.spec.ts`, `tests/e2e/e2e-quality-rules.md`

**Intent**: Give `$10x-e2e` a project-specific exemplar and explicit rules before it generates the business-risk spec.

**Contract**: Adapt the skill references to this app's routes, roles, isolation model, built-runtime harness, and cleanup strategy. The seed and rules require role/label/text locators, unique data, state-based waits, auth without UI, no `waitForTimeout`, and one independently runnable test per risk.

#### 2. Create-two, delete-one, reload risk spec

**File**: `tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts`

**Intent**: Protect the user-visible integration of form fields, cookie-backed auth, middleware, Astro routes, bulk mutation, redirect feedback, Supabase persistence, and SSR reread.

**Contract**: One authenticated disposable owner creates two uniquely titled grow logs through the UI, selects exactly one by accessible label, accepts the real confirmation dialog, submits bulk delete, sees controlled success feedback, sees the selected title absent and survivor present, reloads, and repeats both persisted-state assertions. Cleanup removes only data created by the run, with harness user deletion as the final safety net.

#### 3. Browser risk in CI

**File**: `.github/workflows/ci.yml`

**Intent**: Promote the existing setup/runtime job from infrastructure-only validation to execution of the single reviewed business-risk spec.

**Contract**: Run the normal `test:e2e` command against disposable local services. Keep Chromium-only scope, exact cleanup, and no production credentials or mutation target.

### Success Criteria:

#### Automated Verification:

- `$10x-e2e` creates or adapts the seed and E2E rules, then adds exactly one risk-bound spec file.
- The spec uses only role, label, and visible-text locators; unique data; state waits; and deterministic cleanup, with no CSS/XPath, `waitForTimeout`, skip/fixme, screenshot, or pixel oracle.
- Single-spec execution passes: `npm.cmd run test:e2e -- tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts`.
- Assertions prove success feedback, selected-log absence, survivor presence, and the same absence/presence after `page.reload()`.
- Review against hallucinated assertion, brittle selector, shared state, wait-for-time, and no-cleanup anti-patterns finds no unresolved violation.
- A temporary deliberate break of the protected bulk-mutation or SSR-reread behavior makes this exact spec fail; the break is immediately reverted and the spec returns green.
- CI runs the reviewed spec against disposable local services and leaves no generated principal or auth artifact.
- Canonical typecheck passes: `npm.cmd run typecheck`.

#### Manual Verification:

- Watch one headed run and confirm the real delete dialog appears, only the selected grow log disappears, and the survivor remains after a visible reload.

**Implementation Note**: This phase proves browser/form/redirect/persistence/SSR wiring only. It is not evidence for RLS, cross-owner access, hostile input, provider behavior, Cloudflare deployment configuration, or Supabase outage handling.

---

## Phase 5: Lock Risk #5 And The E2E Cookbook

### Overview

Run the complete delivered gate and update the frozen strategy's permitted Risk #5 guidance plus the E2E cookbook to describe only the evidence that actually shipped.

### Changes Required:

#### 1. Precise Risk #5 response guidance

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the ambiguous “do not persist bad state” wording with the verified application and persisted-state contract.

**Contract**: Risk #5 states that provider failure returns a controlled, retryable, vendor-neutral, redacted schema; no provider/diagnosis content or grow-log mutation persists; active admission is released; attempt/cooldown remains intentionally. It names focused Vitest, local persisted Supabase, local built workerd smoke, and one browser SSR flow as the delivered layers. It explicitly excludes additional deployment environments, local-as-production claims, Supabase outage testing, and upstream status prediction.

#### 2. Shipped E2E cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the Phase 3 E2E placeholder with the actual file layout, commands, fixture lifecycle, locator/wait rules, and proof boundary.

**Contract**: Document the seed/rules/spec references, all-suite and single-spec commands, loopback/reset prerequisite, generated owner plus `AUTHORIZED_USER_ID` ordering, storage-state hygiene, cleanup behavior, CI scope, deliberate-break requirement, and the narrow create-two/delete-one/reload oracle.

#### 3. Final scope and quality gate

**File**: `context/changes/testing-runtime-failure-smoke-layer/plan.md`, `context/changes/testing-runtime-failure-smoke-layer/change.md`

**Intent**: Verify the rollout contains only the approved local/CI layers and record completion through the canonical Progress workflow.

**Contract**: Search confirms no preview/staging/pre-production environment, Supabase outage scenario, upstream status prediction, live provider gate, broad browser suite, or production mutation was introduced. Change status remains workflow-controlled until every Progress row and manual gate is complete.

### Success Criteria:

#### Automated Verification:

- Focused runtime tests pass: `npm.cmd run test:unit -- src/lib/runtime-env.test.ts src/lib/diagnosis/provider.test.ts src/pages/api/diagnosis/selected-log.runtime-failure.test.ts`.
- Full unit suite passes: `npm.cmd run test:unit`.
- After the explicit local reset, persisted provider-failure smoke passes: `npm.cmd run test:runtime:provider-failure`.
- Reviewed browser smoke passes: `npm.cmd run test:e2e -- tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts`.
- Canonical typecheck passes: `npm.cmd run typecheck`.
- Lint passes: `npm.cmd run lint`.
- Build passes: `npm.cmd run build`.
- Search confirms Risk #5 and the E2E cookbook describe only delivered local/CI evidence and contain no additional environment or upstream-status prediction.

#### Manual Verification:

- Confirm the final Risk #5 wording clearly distinguishes local workerd evidence from deployed Cloudflare configuration and introduces no additional environment.
- Confirm the cookbook is sufficient to run one future E2E spec without reading secret files or mutating production.

**Implementation Note**: Pause for the final manual confirmation before the phase commit and plan epilogue.

---

## Testing Strategy

### Unit Tests:

- Test Cloudflare-first runtime env precedence, Astro fallback, and blank/whitespace handling in isolation.
- Preserve provider classification and prove the missing-key branch constructs no SDK/network work.
- Exercise the real route/service/provider orchestration with only database/admission edges mocked and assert schema, retryability, release, and redaction without an HTTP-status oracle.

### Integration Tests:

- Use a loopback-only disposable Supabase user and JWT session to prove the persisted admission oracle after missing provider configuration.
- Use the built workerd-backed runtime for public render, protected redirect, auth state, middleware, and SSR execution.
- Use one browser spec for the cross-boundary grow-log mutation/reload outcome; keep provider and outage scenarios below the browser.

### Manual Testing Steps:

1. In the repository terminal, explicitly reset the disposable local Supabase stack before running persisted or browser smoke commands.
2. Run the Phase 2 smoke with credentials supplied through process environment and confirm exact fixture cleanup.
3. Run the E2E harness headed and confirm it starts authenticated against a fresh built runtime without UI login or stale server reuse.
4. Observe the real bulk-delete confirmation and verify only the selected unique title disappears while the survivor remains after reload.
5. Review the final Risk #5/cookbook wording and confirm it introduces no additional environment or production-readiness claim.

## Performance Considerations

Keep one Chromium project and one browser risk spec. Build the app once per E2E run, reuse the server only within that fixture-bound run, and avoid OpenRouter calls. CI cost is bounded by one local Supabase stack, one built runtime, one auth setup, and one browser scenario.

## Migration Notes

No database migration is required. The only dependency migration is the reviewed `@playwright/test` lockfile change. Generated auth state, traces, reports, and fixture metadata remain ignored and disposable. Existing local Supabase data is not migrated; the smoke requires an explicit reset of the disposable local stack.

## References

- Related research: `context/changes/testing-runtime-failure-smoke-layer/research.md`
- Rollout strategy: `context/foundation/test-plan.md`
- Browser readiness/runbook: `context/foundation/e2e-readiness.md`
- Prior persisted fixture pattern: `scripts/smoke-ownership-rls.ts:25-100,528-570`
- Runtime env bridge: `src/lib/runtime-env.ts:1-30`
- Provider/service path: `src/lib/diagnosis/provider.ts:48-120`, `src/lib/diagnosis/service.ts:217-315`
- Browser flow: `src/components/grow-logs/GrowLogForm.astro:29-74`, `src/components/grow-logs/GrowLogCard.astro:22-35`, `src/pages/grow-logs/index.astro:7-11,84-108`
- Playwright authentication and web server guidance: `https://playwright.dev/docs/auth`, `https://playwright.dev/docs/test-webserver`
- Astro Cloudflare local preview guidance: `https://docs.astro.build/en/guides/integrations-guide/cloudflare/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Protect The Deterministic Runtime Failure Contract

#### Automated

- [ ] 1.1 Focused runtime failure tests pass: `npm.cmd run test:unit -- src/lib/runtime-env.test.ts src/lib/diagnosis/provider.test.ts src/pages/api/diagnosis/selected-log.runtime-failure.test.ts`.
- [ ] 1.2 Runtime env tests prove Cloudflare precedence, Astro fallback, and missing/empty/whitespace handling.
- [ ] 1.3 Missing-provider integration proves a retryable, vendor-neutral, schema-valid failure with no raw sentinel or provider name in the response and no external provider call.
- [ ] 1.4 The integration proves admission release is attempted after the lazy provider factory fails.
- [ ] 1.5 Canonical typecheck passes: `npm.cmd run typecheck`.

#### Manual

- [ ] 1.6 Review the authenticated missing-provider copy and confirm it is actionable without naming OpenRouter or exposing configuration details.

### Phase 2: Prove Persisted Admission State After Provider Failure

#### Automated

- [ ] 2.1 After an explicit manual reset of the disposable local Supabase stack, `npm.cmd run test:runtime:provider-failure` passes with credentials supplied through the process environment.
- [ ] 2.2 The smoke proves attempt/cooldown retention, active-claim release, unchanged grow-log state, and absence of persisted provider/diagnosis content.
- [ ] 2.3 A forced assertion failure demonstrates exact-user cleanup still runs and the temporary failure is reverted.
- [ ] 2.4 A non-loopback URL is refused before user creation, mutation, or provider work.
- [ ] 2.5 Canonical typecheck passes: `npm.cmd run typecheck`.

#### Manual

- [ ] 2.6 Confirm the target Supabase URL is loopback-only, reset that disposable local stack before the smoke, and verify the reported generated user is absent after completion.

### Phase 3: Build The Workerd And Playwright Harness

#### Automated

- [ ] 3.1 Playwright config exposes `testDir`, loopback `baseURL`, setup-to-Chromium dependency, and built-runtime startup; the package command forwards a single spec path.
- [ ] 3.2 The local harness creates the owner before server startup, loads `/grow-logs` from saved auth state without UI login, and removes the user/auth state after success.
- [ ] 3.3 A forced setup or test failure proves the harness cleanup path still runs, after which the temporary failure is reverted.
- [ ] 3.4 Built-runtime smoke passes against `astro build` plus workerd-backed preview and checks application render/redirect outcomes without asserting Cloudflare error codes.
- [ ] 3.5 CI installs Chromium, uses only disposable local Supabase, runs the setup/runtime gate, and contains no hosted or production mutation target.
- [ ] 3.6 Unit tests pass: `npm.cmd run test:unit`.
- [ ] 3.7 Lint passes: `npm.cmd run lint`.
- [ ] 3.8 Build passes: `npm.cmd run build`.
- [ ] 3.9 Canonical typecheck passes: `npm.cmd run typecheck`.

#### Manual

- [ ] 3.10 Inspect ignored artifacts and confirm no storage state, cookie, password, service-role value, or fixture metadata is tracked.
- [ ] 3.11 Run the harness once headed and confirm the browser starts already authenticated against the built local runtime, with no stale server reuse.

### Phase 4: Protect Grow-Log Mutation And SSR Persistence In The Browser

#### Automated

- [ ] 4.1 `$10x-e2e` creates or adapts the seed and E2E rules, then adds exactly one risk-bound spec file.
- [ ] 4.2 The spec uses only role, label, and visible-text locators; unique data; state waits; and deterministic cleanup, with no CSS/XPath, `waitForTimeout`, skip/fixme, screenshot, or pixel oracle.
- [ ] 4.3 Single-spec execution passes: `npm.cmd run test:e2e -- tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts`.
- [ ] 4.4 Assertions prove success feedback, selected-log absence, survivor presence, and the same absence/presence after `page.reload()`.
- [ ] 4.5 Review against hallucinated assertion, brittle selector, shared state, wait-for-time, and no-cleanup anti-patterns finds no unresolved violation.
- [ ] 4.6 A temporary deliberate break of the protected bulk-mutation or SSR-reread behavior makes this exact spec fail; the break is immediately reverted and the spec returns green.
- [ ] 4.7 CI runs the reviewed spec against disposable local services and leaves no generated principal or auth artifact.
- [ ] 4.8 Canonical typecheck passes: `npm.cmd run typecheck`.

#### Manual

- [ ] 4.9 Watch one headed run and confirm the real delete dialog appears, only the selected grow log disappears, and the survivor remains after a visible reload.

### Phase 5: Lock Risk #5 And The E2E Cookbook

#### Automated

- [ ] 5.1 Focused runtime tests pass: `npm.cmd run test:unit -- src/lib/runtime-env.test.ts src/lib/diagnosis/provider.test.ts src/pages/api/diagnosis/selected-log.runtime-failure.test.ts`.
- [ ] 5.2 Full unit suite passes: `npm.cmd run test:unit`.
- [ ] 5.3 After the explicit local reset, persisted provider-failure smoke passes: `npm.cmd run test:runtime:provider-failure`.
- [ ] 5.4 Reviewed browser smoke passes: `npm.cmd run test:e2e -- tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts`.
- [ ] 5.5 Canonical typecheck passes: `npm.cmd run typecheck`.
- [ ] 5.6 Lint passes: `npm.cmd run lint`.
- [ ] 5.7 Build passes: `npm.cmd run build`.
- [ ] 5.8 Search confirms Risk #5 and the E2E cookbook describe only delivered local/CI evidence and contain no additional environment or upstream-status prediction.

#### Manual

- [ ] 5.9 Confirm the final Risk #5 wording clearly distinguishes local workerd evidence from deployed Cloudflare configuration and introduces no additional environment.
- [ ] 5.10 Confirm the cookbook is sufficient to run one future E2E spec without reading secret files or mutating production.
