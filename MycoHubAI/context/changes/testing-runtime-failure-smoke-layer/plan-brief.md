# Runtime Failure And Smoke Layer — Plan Brief

> Full plan: `context/changes/testing-runtime-failure-smoke-layer/plan.md`
> Research: `context/changes/testing-runtime-failure-smoke-layer/research.md`

## What & Why

Rollout Phase 3 proves that missing provider configuration and runtime wiring fail in a controlled, redacted way, then adds one focused browser check for the real grow-log mutation and SSR reread path. It closes the gap between mocked unit tests and the built local Cloudflare-shaped application without introducing another deployment environment.

## Starting Point

Provider, service, route, middleware, and UI tests already cover many isolated failure cases, while local Supabase smoke proves ownership and admission separately. There is no test for the real runtime-env-to-lazy-provider failure chain, no built Worker request smoke, and no Playwright dependency, auth harness, browser spec, or E2E CI job.

## Desired End State

Missing provider configuration produces a vendor-neutral, retryable, schema-valid response without OpenRouter traffic or leaked details. Local persisted proof shows the admitted attempt/cooldown remains while the active claim clears and the grow log stays unchanged. A built workerd harness and one reviewed browser spec protect create-two, delete-one, and SSR-reload persistence.

## Key Decisions Made

| Decision                 | Choice                                                           | Why                                                                                | Source   |
| ------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Public provider error    | Vendor-neutral message                                           | Avoid exposing OpenRouter or configuration details.                                | Plan     |
| HTTP assertion           | Assert schema/retryability/redaction, not a specific status      | Protect the stable product contract without coupling to a status choice.           | Plan     |
| Runtime environments     | Existing local and CI only                                       | No additional preview, staging, or pre-production environment exists or is needed. | Plan     |
| Supabase failures        | Explicitly excluded                                              | Healthy local Supabase is a fixture/oracle, not an outage target.                  | Plan     |
| Upstream statuses        | Never predict OpenRouter or Cloudflare codes                     | Tests protect application-owned normalization and visible behavior.                | Plan     |
| Persisted failure oracle | Retain attempt/cooldown; clear active claim; preserve grow log   | Matches the real admission lifecycle instead of demanding zero writes.             | Research |
| Runtime execution        | `astro build` plus workerd-backed local preview                  | Exercises built Cloudflare-oriented output without claiming deployed readiness.    | Research |
| E2E scope                | One create-two/delete-one/reload spec                            | This is the only browser flow with unique cross-boundary signal.                   | Research |
| Skill boundary           | Infrastructure via `$10x-implement`; browser risk via `$10x-e2e` | Playwright must exist before the E2E skill can generate and verify the spec.       | Research |
| Strategy update          | Correct Risk #5 and fill the E2E cookbook after delivery         | Document only behavior and commands that actually shipped.                         | Plan     |

## Scope

**In scope:**

- Runtime-env precedence and blank-value tests.
- Vendor-neutral missing-provider orchestration with no external request.
- Loopback-only persisted admission proof against healthy local Supabase.
- Built workerd runtime smoke, deterministic Playwright auth, cleanup, and CI.
- One `$10x-e2e` create-two/bulk-delete-one/reload spec with deliberate-break verification.
- Risk #5 and E2E cookbook correction after the implementation exists.

**Out of scope:**

- Supabase outage/timeout/retry/failover behavior.
- OpenRouter or Cloudflare upstream status prediction.
- Any additional deployment environment or production-secret manipulation.
- Live provider calls, deployed-readiness claims, broad CRUD E2E, RLS/browser security proof, visual regression, or production mutation.

## Architecture / Approach

Vitest protects the deterministic env/provider chain with mocked database edges. A separate local smoke uses a real disposable Supabase JWT session and admin-only persisted oracle. The E2E harness creates that disposable owner before starting the built workerd server, injects the owner as `AUTHORIZED_USER_ID`, saves auth state without UI login, and cleans up in `finally`. Only then does `$10x-e2e` generate and harden the one browser risk spec.

## Phases at a Glance

| Phase                             | What it delivers                                           | Key risk                                                  |
| --------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| 1. Deterministic Runtime Failure  | Env precedence and real missing-key orchestration          | Over-mocking hides integration and leaks vendor details   |
| 2. Persisted Admission State      | Real local admission/release and unchanged grow log        | Incorrectly treating intentional accounting as corruption |
| 3. Workerd And Playwright Harness | Built runtime, disposable auth, storage state, cleanup, CI | Server must start after generated owner ID exists         |
| 4. Browser Runtime/SSR Smoke      | One reviewed and deliberate-break-verified E2E spec        | Browser test becomes broad, brittle, or decorative        |
| 5. Risk #5 And Cookbook           | Final gates and accurate reusable guidance                 | Documentation overclaims local or browser evidence        |

**Prerequisites:** Node 24.15.x, Docker/local Supabase CLI, explicit reset of the disposable local stack before persisted/browser smokes, and local credentials supplied through process environment.
**Estimated effort:** Approximately five gated sessions; Phase 3 carries most infrastructure work and Phase 4 is executed with `$10x-e2e`.

## Open Risks & Assumptions

- Local workerd approximates the Worker runtime but cannot prove deployed Cloudflare secret values; the plan makes no such claim.
- E2E auth depends on generating the owner before server startup because middleware exact-matches `AUTHORIZED_USER_ID`.
- CI browser cost depends on local Supabase and Chromium startup, so the suite remains one browser and one business-risk spec.
- Persisted smokes require a human-confirmed local reset; scripts refuse non-loopback URLs and never reset the database themselves.

## Success Criteria (Summary)

- Missing provider configuration is controlled, neutral, retryable, redacted, and starts no OpenRouter work.
- Persisted state retains only intentional admission accounting, clears the active lease, preserves the grow log, and cleans exact fixtures.
- The built local runtime and one independent browser spec prove authenticated create/delete/reload wiring, including deliberate-break failure, with no additional environment or production mutation.
