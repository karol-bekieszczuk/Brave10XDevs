---
date: 2026-08-06T17:18:00+02:00
researcher: OpenAI Codex
git_commit: 2a0d5643440c1c937646995404acea54bbd4633e
branch: master
repository: karol-bekieszczuk/Brave10XDevs (MycoHubAI)
topic: "Ground rollout Phase 3: runtime failure and focused smoke layer"
tags: [research, codebase, runtime-env, cloudflare-workers, openrouter, astro-ssr, vitest, smoke]
status: complete
last_updated: 2026-08-06
last_updated_by: OpenAI Codex
---

# Research: Runtime Failure And Smoke Layer

**Date**: 2026-08-06T17:18:00+02:00
**Researcher**: OpenAI Codex
**Git Commit**: `2a0d5643440c1c937646995404acea54bbd4633e`
**Branch**: `master`
**Repository**: `karol-bekieszczuk/Brave10XDevs`, application in `MycoHubAI/`

## Research Question

Ground rollout Phase 3 of `context/foundation/test-plan.md` for Risk #5 and cross-cutting runtime coverage. Trace the real missing-secret, provider-failure, Cloudflare runtime, auth, and SSR paths; verify or correct the proposed response; locate existing tests; choose the cheapest useful test layer; and identify speculative risks or misleading hot-spot evidence without expanding into broad E2E.

## Summary

Risk #5 is real, but its response guidance needs two corrections.

First, `astro build` and `astro check` do not prove deployed runtime secrets. The checkout declares five server secrets, but Astro secret validation is not enabled, CI supplies only three values to the build, CI never deploys or starts the Worker, and the values consumed by SSR are request-runtime bindings. A successful build therefore proves bundle generation and static correctness, not that Cloudflare exposes the required bindings or that an authenticated request can traverse middleware, Supabase, OpenRouter, and SSR.

Second, “do not persist bad state” cannot mean “provider failure causes no database write.” The diagnosis flow intentionally claims durable admission before provider construction. A missing key or provider failure consumes one attempt and duplicate cooldown, but must release the active claim. No diagnosis result/history or grow-log mutation exists in this path. The precise invariant is: **no provider/diagnosis content or business record is persisted; the active lease is cleared; opaque attempt/cooldown accounting remains by design**.

Most failure translation is already covered cheaply by Vitest, and the focused verification run passed 6 files / 71 tests. The largest deterministic gap is that the API test mocks runtime env, provider, and service at once, so no test proves the real `runtime-env -> lazy provider factory -> service -> HTTP 502` chain. The largest runtime gap is that no test executes the built Worker, adapter bindings, real middleware/cookies, Astro SSR pages, or a deployed Cloudflare environment.

The minimum honest rollout is layered:

1. Add focused Vitest coverage for the real missing-key/provider failure orchestration and active-claim release.
2. Add one Worker-shaped built-runtime smoke using `astro build` + `astro preview`/workerd (or equivalent Wrangler local runtime) for adapter loading, bindings, middleware, SSR, and controlled HTTP failure.
3. Add exactly one browser spec: authenticated owner creates two unique logs, bulk-deletes one, reloads the SSR list, and sees the deleted row absent and survivor present. This proves browser/form/redirect/persistence/SSR wiring only.
4. Keep runtime assurance local: exercise the built Worker through workerd and state explicitly that this does not prove deployed Cloudflare secret configuration. Do not add another environment or remove/corrupt a production secret to manufacture failure.

## Detailed Findings

### 1. Checkout And Documentation Drift

The request and test plan describe Astro 6, but the live manifest installs Astro `^7.0.2`, `@astrojs/cloudflare` `^14.0.0`, Wrangler `^4.118.0`, and Vitest `^4.1.7` ([package.json:25](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/package.json#L25), [package.json:68](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/package.json#L68)). `npm ls --depth=0` resolved Astro 7.0.2, Cloudflare adapter 14.0.0, and Wrangler 4.118.0. The checkout is the planning source of truth; Astro 6 notes are historical context only.

Current official Astro documentation, fetched through Context7 on 2026-08-06, says secret validation at dev startup/build requires `env.validateSecrets: true`; secret server variables are otherwise read at SSR runtime through adapter-specific access. Current Cloudflare documentation says Worker requests receive runtime bindings and local bindings are simulated separately. These docs support the code-derived conclusion but do not replace code anchors.

### 2. Environment Contract And Why Build Success Is Insufficient

The application is a server-rendered Cloudflare Worker ([astro.config.mjs:10](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/astro.config.mjs#L10)). Its Astro schema declares `SUPABASE_URL`, `SUPABASE_KEY`, `AUTHORIZED_USER_ID`, and `OPENROUTER_API_KEY` as server secrets, with `SUPABASE_ADMIN_KEY` optional ([astro.config.mjs:18](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/astro.config.mjs#L18)). It does not enable `validateSecrets`.

Wrangler separately lists all five names as required secrets ([wrangler.jsonc:20](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/wrangler.jsonc#L20)). The installed Wrangler schema describes this list as type-generation input and local-dev missing-secret warnings; it does not make `astro build` a deployed-secret probe.

CI runs sync, typecheck, Vitest, lint, and build, but gives the build only Supabase URL/key and authorized user ID; it omits OpenRouter and admin keys and performs no deploy/runtime request ([.github/workflows/ci.yml:18](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/.github/workflows/ci.yml#L18)). Therefore the current green build is direct evidence that build success is not the runtime-readiness oracle proposed by Risk #5.

The runtime bridge prefers Cloudflare bindings and then falls back to Astro server env ([src/lib/runtime-env.ts:1](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/runtime-env.ts#L1), [src/lib/runtime-env.ts:14](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/runtime-env.ts#L14)):

```ts
url: readOptionalString(env.SUPABASE_URL) ?? readOptionalString(ASTRO_SUPABASE_URL),
key: readOptionalString(env.SUPABASE_KEY) ?? readOptionalString(ASTRO_SUPABASE_KEY),
```

No direct test exercises this bridge. Existing auth, middleware, account deletion, and diagnosis tests mock `runtime-env` or both virtual env modules. Generated `worker-configuration.d.ts` proves declared names/types, not values available to a deployed request.

There is also setup drift: `.env.example:1-4` documents `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `LIVE_EVALUATION_OWNER_ID`, but omits runtime-required `SUPABASE_KEY`, `AUTHORIZED_USER_ID`, and `SUPABASE_ADMIN_KEY`. The last two documented names are script-only rather than the full app runtime contract.

### 3. Missing Supabase And Auth Configuration

Missing Supabase URL/key is intentionally converted into `null` before SDK construction ([src/lib/supabase.ts:8](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/supabase.ts#L8)). Middleware creates that client per request, catches `auth.getUser()` failures, redirects missing `AUTHORIZED_USER_ID` with a controlled configuration error, and redirects missing client/user to sign-in ([src/middleware.ts:27](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/middleware.ts#L27), [src/middleware.ts:46](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/middleware.ts#L46)). The public sign-in page remains renderable, and sign-in POST redirects missing Supabase/access configuration to a controlled message ([src/pages/api/auth/signin.ts:13](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/api/auth/signin.ts#L13)).

Vitest currently proves mocked missing-client and rejected-`getUser` redirects ([src/middleware.test.ts:97](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/middleware.test.ts#L97)), but not real binding resolution, missing authorized-user config, cookies, or built Worker execution.

### 4. OpenRouter Failure Path

The route reads the runtime key but deliberately passes a lazy provider factory ([src/pages/api/diagnosis/selected-log.ts:125](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/api/diagnosis/selected-log.ts#L125)):

```ts
const apiKey = getOpenRouterApiKey();
createProvider: () => createDiagnosisProvider(apiKey, { debugErrors: import.meta.env.DEV }),
```

The service first validates the request, loads the owner-scoped log, rejects unsupported scope, and rejects thin context ([src/lib/diagnosis/service.ts:217](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/service.ts#L217)). Only a valid provider-bearing request acquires durable admission and constructs the provider ([src/lib/diagnosis/service.ts:244](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/service.ts#L244)). This preserves fail-before-cost behavior for malformed, missing, non-owner, unsupported, and thin-context cases.

Missing `OPENROUTER_API_KEY` throws a typed `provider_failed` error before SDK construction ([src/lib/diagnosis/provider.ts:71](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/provider.ts#L71)). Embedding and generation have 15-second and 90-second abort signals; provider exceptions become `provider_timeout` or `provider_failed`, while malformed structured output becomes `invalid_model_output` ([src/lib/diagnosis/provider.ts:48](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/provider.ts#L48), [src/lib/diagnosis/provider.ts:85](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/provider.ts#L85)).

The service always calls admission release in `finally`, then serializes known diagnosis errors or redacts unknown exceptions ([src/lib/diagnosis/service.ts:264](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/service.ts#L264)). The API maps provider/retrieval/model failures to HTTP 502 ([src/pages/api/diagnosis/selected-log.ts:23](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/api/diagnosis/selected-log.ts#L23)). The React island schema-validates the response, exposes retry for retryable errors, and renders diagnosis content only in success state ([src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:71](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/components/diagnosis/SelectedLogDiagnosisPanel.tsx#L71), [src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:226](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/components/diagnosis/SelectedLogDiagnosisPanel.tsx#L226)).

The missing-key message currently names the vendor and configuration problem: `OpenRouter API key is not configured.` It is controlled and contains no secret value, but is less generic than other production provider failures. Planning should make an explicit product/observability choice: retain that authenticated operational detail or normalize it to a generic public message while logging only safe diagnostics.

### 5. Persistence Semantics: Corrected Risk Oracle

There is no diagnosis response/history write. The provider path performs an owner-log read, admission RPC, knowledge retrieval, provider work, and response serialization. Grow-log mutation is not part of this flow.

Admission state is intentionally written before provider construction. The SQL increments `attempt_count`, records an active claim, and inserts the opaque fingerprint cooldown ([supabase/migrations/20260804120000_create_diagnosis_admission.sql:94](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/supabase/migrations/20260804120000_create_diagnosis_admission.sql#L94)). Release clears the active claim and expiry but retains attempt count and cooldown ([supabase/migrations/20260804120000_create_diagnosis_admission.sql:109](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/supabase/migrations/20260804120000_create_diagnosis_admission.sql#L109)):

```sql
set active_claim_id = null,
    active_expires_at = null
```

Therefore the correct provider-failure persisted-state oracle is:

- one admitted attempt/cooldown remains;
- `active_claim_id` and `active_expires_at` are cleared;
- no raw question, grow-log text, provider output, error body, or diagnosis result is stored;
- no grow-log row is changed;
- subsequent behavior follows the defined cooldown/rate policy rather than being permanently wedged.

If the release RPC itself fails, its exception can mask the original provider error and the active lease remains until stale-lease recovery. SQL has a two-minute stale lease path, and the local RLS smoke proves stale recovery generally, but no test combines provider failure with release failure. This is a bounded residual behavior worth characterizing, not evidence of persisted diagnosis corruption.

### 6. Existing Coverage And Gaps

The repository has 24 test files across API, services, repositories, middleware, Worker entrypoint, and the React diagnosis island. Focused verification on 2026-08-06 passed:

```text
Test Files  6 passed (6)
Tests       71 passed (71)
```

Existing signal:

- Provider unit tests cover absent key, timeout mapping, invalid/oversized structured output, output token cap, and debug/non-debug logging ([src/lib/diagnosis/provider.test.ts:65](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/provider.test.ts#L65), [src/lib/diagnosis/provider.test.ts:156](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/provider.test.ts#L156)).
- Service tests cover controlled provider errors, raw-exception redaction, and timeout admission release ([src/lib/diagnosis/service.test.ts:525](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/service.test.ts#L525), [src/lib/diagnosis/service.test.ts:697](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/diagnosis/service.test.ts#L697)).
- Route tests cover request bounds, redaction, auth refusal, and status mapping ([src/pages/api/diagnosis/selected-log.test.ts:79](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/api/diagnosis/selected-log.test.ts#L79), [src/pages/api/diagnosis/selected-log.test.ts:156](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/api/diagnosis/selected-log.test.ts#L156)).
- UI tests cover retryable provider error presentation and Retry control ([src/components/diagnosis/SelectedLogDiagnosisPanel.test.tsx:84](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/components/diagnosis/SelectedLogDiagnosisPanel.test.tsx#L84)).
- The local two-principal smoke proves durable admission, cooldown, concurrency, and stale recovery against Supabase, but not a real provider failure through the HTTP/Worker boundary (`scripts/smoke-ownership-rls.ts:370-485`).
- Worker unit tests mock Astro's handler and prove only delegation plus configured scheduled purge ([src/worker.test.ts:44](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/worker.test.ts#L44)).

Concrete gaps:

1. No direct `runtime-env` precedence/missing/whitespace test.
2. No test carries an absent runtime key through the real provider factory and service into the route's 502 response; the route test mocks all three boundaries at once ([src/pages/api/diagnosis/selected-log.test.ts:3](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/api/diagnosis/selected-log.test.ts#L3)).
3. No provider-failure test asserts the durable admission oracle against persisted state.
4. No release-failure characterization test.
5. No built Worker/workerd request smoke.
6. No test renders Astro pages or exercises real middleware cookies, redirects, form confirmation, persistence, and SSR reread.
7. No CI/deploy or post-deploy runtime smoke; CI is validation-only.

### 7. Cheapest Useful Test Layer For Risk #5

| Claim                                                          | Cheapest honest layer                                                                            | Required oracle                                                                                                                     | What it does not prove                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Missing OpenRouter key/provider exception is controlled        | Vitest service/API integration with real orchestration and mocked provider network/Supabase edge | Redacted retryable 502, no diagnosis content, one admission, active claim released                                                  | Cloudflare supplied the binding or Worker can boot |
| Runtime env precedence and missing values                      | Focused Vitest module test                                                                       | Cloudflare binding wins, Astro fallback works, empty/whitespace policy is explicit                                                  | Deployed binding exists                            |
| Astro adapter and middleware/SSR can execute in Worker runtime | Built local workerd/Wrangler HTTP smoke                                                          | Public sign-in renders; protected route redirects predictably; optional authenticated missing-key diagnosis returns controlled JSON | Actual deployed Cloudflare secret configuration    |
| Provider failure leaves correct durable state                  | Local disposable Supabase integration smoke                                                      | attempt/cooldown retained, active claim cleared, no content/business mutation                                                       | Deployed Worker/provider network                   |

The browser is not the cheapest layer for provider JSON/error translation. It is justified only for the cross-cutting DOM/form/redirect/SSR persistence scenario below.

### 8. Focused Runtime/SSR Browser Smoke

One browser spec adds signal beyond current Vitest mocks:

> An authenticated owner creates two uniquely named grow logs, bulk-deletes exactly one, reloads the SSR list, and sees the selected log remain absent while the survivor remains visible.

The real path is:

- plain POST create form ([src/components/grow-logs/GrowLogForm.astro:18](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/components/grow-logs/GrowLogForm.astro#L18));
- authenticated create route with validation, insert, and redirect ([src/pages/api/grow-logs/create.ts:20](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/api/grow-logs/create.ts#L20));
- SSR owner list query ([src/pages/grow-logs/index.astro:7](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/grow-logs/index.astro#L7));
- accessible selection plus real confirmation and bulk POST ([src/pages/grow-logs/index.astro:84](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/grow-logs/index.astro#L84), [src/components/grow-logs/GrowLogCard.astro:22](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/components/grow-logs/GrowLogCard.astro#L22));
- owner-scoped delete and controlled redirect ([src/pages/api/grow-logs/bulk-delete.ts:10](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/pages/api/grow-logs/bulk-delete.ts#L10));
- live owner-filtered reread ([src/lib/grow-logs/repository.ts:89](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/lib/grow-logs/repository.ts#L89)).

The spec uniquely proves form field/name/value wiring, browser confirmation, cookie-backed auth, middleware, redirect handling, real persistence, and SSR reread. It does **not** prove hostile input, cross-owner denial, RLS, provider-cost control, redaction, or deployed Cloudflare bindings. Those already belong to cheaper Phase 1/2 layers.

Keep the scope to one spec with unique test data, role/label/text locators, state-based waits, exact survivor assertions after reload, and cleanup of only generated rows. Do not add every CRUD path, screenshot assertions, vision, `waitForTimeout`, or production mutation.

No Playwright infrastructure exists: there is no dependency, config, script, spec, storage state, browser install, local-service CI job, or auth fixture. The plan must separate runner/auth/fixture infrastructure (`/10x-implement`) from generating and verifying this browser risk (`/10x-e2e`).

The existing local Supabase smoke provides the safe fixture pattern: loopback refusal, temporary confirmed Auth users, real password sessions, unique IDs, and cleanup (`scripts/smoke-ownership-rls.ts:46-89`, `scripts/smoke-ownership-rls.ts:529-567`). Browser infrastructure must additionally coordinate the generated owner's ID with runtime `AUTHORIZED_USER_ID` **before** starting the preview server; saving `storageState` alone cannot pass middleware's exact-owner gate.

Prefer `astro build` followed by `astro preview`/workerd for this smoke rather than only `astro dev`, so the test exercises the built Cloudflare-oriented artifact. This is still local runtime evidence, not deployed readiness.

### 9. Deployment Boundary

This rollout uses only the existing local and CI environments. The built Worker smoke runs locally through workerd and verifies the application-owned runtime shape; it does not claim to prove values configured on the deployed Cloudflare Worker. Adding a preview, staging, or other deployment environment is explicitly out of scope, and production secrets must never be removed or corrupted to manufacture a failure.

### 10. Hot-Spot Evidence Assessment

| Hot-spot                | Grounded relevance                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`                   | Relevant but too broad. Actual anchors are `runtime-env`, Supabase client/admin, middleware, diagnosis route/service/provider, Worker entrypoint, and SSR pages. |
| `supabase`              | Relevant specifically for admission-state semantics and disposable fixture support. It is not the owner of Cloudflare binding resolution.                        |
| `scripts`               | Supplementary: local RLS/live-provider evaluators provide reusable fixture and persisted-state patterns, not deployed runtime proof.                             |
| `lib` (repository root) | Diagnosis knowledge content, not runtime/config/auth code. Misleading as a Risk #5 anchor.                                                                       |
| `public`                | Static assets only. No code evidence connects it to missing secrets, provider failure, auth, or SSR readiness; misleading beyond likelihood metadata.            |

The hot-spot list is valid only as the test plan's likelihood evidence. It should not drive Phase 3 file scope.

## Corrected Risk Response Guidance

Risk #5 should be planned as follows:

- **Prove**: required runtime bindings are exercised in a local Worker-shaped request path; missing OpenRouter configuration and provider failures return a controlled, redacted, retryable response; no diagnosis/provider content or grow-log mutation is persisted; the active admission lease is cleared while attempt/cooldown state remains intentionally.
- **Challenge**: build/typecheck/generated bindings prove runtime readiness; a mocked route status table proves env-to-provider wiring; a local-only preview proves deployed Cloudflare configuration; zero database writes is the correct provider-failure invariant.
- **Cheapest layers**: focused Vitest first, local persisted Supabase only for admission state, built workerd HTTP smoke for adapter/runtime shape, and browser only for the single SSR mutation flow.
- **Avoid**: broad CRUD E2E, production secret removal, production mutation, happy-path provider calls as the only runtime proof, duplicating RLS/abuse tests in a browser, or asserting implementation text instead of public/persisted outcomes.

Cross-cutting guidance should be:

- one authenticated create-two/bulk-delete-one/reload browser spec is justified for form/redirect/persistence/SSR wiring;
- it remains explicitly non-evidence for ownership/RLS, hostile-input, redaction, provider cost, or deployed secret readiness;
- Playwright infrastructure and the `/10x-e2e` risk phase must be separate plan sub-phases.

## Architecture Insights

The runtime uses a deliberate two-source env adapter: Cloudflare bindings first and Astro server env second. This keeps the same application modules usable in Worker and Astro tooling, but it creates a boundary that static declarations and mocked tests cannot verify.

Provider construction is correctly lazy and admission-aware. This ordering prevents missing secrets or provider setup from leaking into invalid/non-owner/scope-refused paths. It also means a missing provider key is a **post-admission runtime failure**, not a no-cost configuration refusal.

The diagnosis feature is response-only by product design. “Bad persisted diagnosis” is currently impossible because there is no diagnosis-history table. Durable state belongs to abuse control, so persistence assertions must distinguish business content from cost-accounting metadata.

The custom Worker entrypoint delegates fetch directly to Astro and adds scheduled purge behavior ([src/worker.ts:23](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/2a0d5643440c1c937646995404acea54bbd4633e/MycoHubAI/src/worker.ts#L23)). A built-runtime request is therefore the smallest test that crosses generated bundle, Cloudflare handler, runtime env bridge, middleware, and SSR without requiring a browser.

## Historical Context (from prior changes)

- `context/changes/testing-ownership-abuse-mutation-boundaries/research.md:174-193` already assigned the one-owner create/delete/reload scenario to Phase 3 because it proves UI/runtime wiring rather than ownership or abuse.
- `context/changes/testing-ownership-abuse-mutation-boundaries/plan.md:58` established the intended admission sequence and provider-failure rate-slot semantics.
- `context/changes/deployment/deployment-plan.md:26-31` distinguished Workers Builds values from Worker runtime secrets, but its statement that Astro necessarily validates them during build is stale under the current opt-in `validateSecrets` contract.
- `context/changes/deployment/phase-0-verification.md` proved an older local build/dry-run shape only. It loaded local env and explicitly deferred real production runtime behavior, so it is not current Risk #5 proof.
- `context/foundation/e2e-readiness.md:95-109` records the exact browser scenario and its narrow oracle. That file is currently unrelated/untracked work and was read but not modified.

## Related Research

- `context/changes/testing-diagnosis-contract-hardening/research.md` — deterministic provider/contract failure protection.
- `context/changes/testing-ownership-abuse-mutation-boundaries/research.md` — persisted RLS/admission proof and browser-layer boundary.
- `context/changes/selected-log-diagnosis/research.md` — original OpenRouter/Supabase diagnosis architecture.

## Test-Plan Corrections To Backport Or Defer

Research found material corrections that should be decided before planning:

1. Replace “do not persist bad state” with the precise admission invariant: no diagnosis/provider content or business mutation, active lease released, opaque attempt/cooldown retained.
2. Replace “unit + manual smoke” with layered guidance: Vitest + Worker-shaped local runtime + isolated deployed/manual smoke; browser only for the cross-cutting SSR mutation scenario.
3. Refresh the stack label from Astro 6.3.1 to the live Astro 7.0.2 / Cloudflare adapter 14.0.0 checkout and fix the stale docs date.
4. Treat `public`, root `lib`, and most `scripts` evidence as misleading for Risk #5 anchors.

Per the test-plan workflow, these findings must not be silently written back into frozen strategy/risk guidance. The user must choose an in-place permitted Risk Response Guidance correction or defer the strategy/stack refresh.

## Resolved Planning Decisions

1. Missing provider configuration uses a vendor-neutral public error; tests assert the application error schema, retryability, and redaction without binding to a specific HTTP status.
2. Runtime assurance stays in the existing local and CI environments. No preview, staging, or other deployment environment is introduced.

## Code References

- `astro.config.mjs:10-25` — SSR Cloudflare adapter and server-secret schema.
- `wrangler.jsonc:3-22` — Worker entrypoint/assets and required-secret names.
- `.github/workflows/ci.yml:18-27` — validation-only build with partial env.
- `src/lib/runtime-env.ts:1-30` — Cloudflare-first env bridge.
- `src/middleware.ts:27-65` — per-request auth/config and pending-deletion lookup.
- `src/pages/api/diagnosis/selected-log.ts:23-45,125-166` — provider failure HTTP translation.
- `src/lib/diagnosis/provider.ts:48-120` — missing-key, timeout, provider, and model-output classification.
- `src/lib/diagnosis/service.ts:217-315` — fail-before-cost, admission, provider, release, and error serialization.
- `supabase/migrations/20260804120000_create_diagnosis_admission.sql:94-120` — persisted attempt/cooldown and active-lease release.
- `src/pages/grow-logs/index.astro:7-108` — SSR list and browser bulk-delete form.
- `scripts/smoke-ownership-rls.ts:46-89,529-567` — safe disposable local principal pattern.
