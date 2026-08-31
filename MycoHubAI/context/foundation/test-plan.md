# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-31

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. Cost × signal. The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. User concerns are first-class evidence. Risks anchored in "the team is
   worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. Risks are scenarios, not code locations. This plan documents what
   could fail and why we believe it's likely - drawn from documents,
   interview, and codebase signal (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `MycoHubAI/src`,
`MycoHubAI/lib`, `MycoHubAI/scripts`, `MycoHubAI/supabase`,
`MycoHubAI/public`.

## 2. Risk Map

Because this product has authentication, private grow-log data, user-provided
questions, server-side provider calls, and secrets, the risk map includes an
abuse/security scenario. This is not a separate framework; it is scored and
phased like the other product risks.

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the evidence that surfaced
this risk - never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                             | Impact | Likelihood | Source (evidence - not anchor)                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Diagnosis sounds confident while wrong or unsupported by the selected grow log.                                                                                                                     | High   | High       | PRD US-01/FR-003; AGENTS hard rules; interview Q1/Q3; hot-spot dir `MycoHubAI/src/lib/diagnosis`                                                                                                                                                                                             |
| 2   | Malformed or partial OpenRouter/provider responses leak through API/service/UI and produce nonsense output.                                                                                         | High   | High       | interview Q1/Q2/Q4; active selected-log diagnosis surface; hot-spot dirs `MycoHubAI/src/lib/diagnosis`, `MycoHubAI/src/pages/api`                                                                                                                                                            |
| 3   | Missing-context, mixed-scope, or out-of-scope prompts are diagnosed instead of narrowed/refused.                                                                                                    | High   | Medium     | PRD acceptance criteria and guardrails; F-03 rubric surface; interview Q3                                                                                                                                                                                                                    |
| 4   | Owner/privacy boundaries regress across grow-log or diagnosis resources, bulk mutations, or privileged account deletion, including authenticated-target derivation and pending-deletion visibility. | High   | Medium     | PRD Access Control/FR-005; AGENTS privacy rule; roadmap S-03/S-04; hot-spot dirs `MycoHubAI/src/pages/api`, `MycoHubAI/src/lib/account-deletion`, `MycoHubAI/supabase/migrations`                                                                                                            |
| 5   | Runtime/env/provider failure works in tests but fails locally or on Cloudflare.                                                                                                                     | Medium | High       | roadmap observability partial; stack Cloudflare/OpenRouter; hot-spot runtime/config/auth areas                                                                                                                                                                                               |
| 6   | Defined stage/body/resource-ID validation or RLS-policy parity drifts across grow-log, diagnosis, and account-deletion surfaces.                                                                    | High   | Medium     | PRD FR-001/FR-005; roadmap grow-log/account/bulk surfaces; hot-spot dirs `MycoHubAI/src/pages/api`, `MycoHubAI/src/lib/grow-logs`, `MycoHubAI/supabase/migrations`                                                                                                                           |
| 7   | Abuse of authenticated/API/provider surfaces bypasses ownership, trusts hostile input, leaks secrets/private data, or triggers costly provider work repeatedly.                                     | High   | Medium     | mandatory abuse lens for auth + user input + server-side provider calls; AGENTS privacy rule; PRD Access Control/FR-005; stack Cloudflare/OpenRouter; hot-spot dirs `MycoHubAI/src/pages/api`, `MycoHubAI/src/lib/diagnosis`, `MycoHubAI/src/lib/grow-logs`, `MycoHubAI/src/lib/runtime-env` |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                                                                                                                                                                                   | Must challenge                                                                                                                                                                                          | Context `/10x-research` must ground                                                                                                                                      | Likely cheapest layer                        | Anti-pattern to avoid                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| #1   | Answer evidence visibly depends on selected log/stage and uncertainty stays bounded.                                                                                                                                                                                                                                                                                                          | Passing schema means answer quality is safe.                                                                                                                                                            | diagnosis entry point, prompt contract, selected-log binding, rubric oracle                                                                                              | integration + contract tests                 | implementation mirror                                                                                                                |
| #2   | Bad provider shapes are rejected or translated into controlled errors before UI render.                                                                                                                                                                                                                                                                                                       | Provider SDK always returns valid structured data.                                                                                                                                                      | provider boundary, validation path, error translation, UI rendering contract                                                                                             | unit + integration                           | happy-path-only mocks                                                                                                                |
| #3   | Unsupported/missing/mixed cases follow rubric outcomes without invented diagnosis.                                                                                                                                                                                                                                                                                                            | In-scope happy path proves guardrails.                                                                                                                                                                  | evaluation cases, scope classes, service routing                                                                                                                         | contract/evaluation tests                    | copied production expected values                                                                                                    |
| #4   | Non-owner/missing resource IDs cannot cause reads, diagnosis/provider work, or mutations; account deletion targets only the authenticated user; pending-deletion state is owner-readable without becoming cross-owner mutable.                                                                                                                                                                | Authentication implies resource ownership, or privileged admin access implies the target ID is safe.                                                                                                    | owner filters and RLS, persisted state, authenticated target derivation, admin boundary, pending-deletion policy                                                         | integration + RLS smoke                      | over-mocking internals or treating query shape as persisted-state proof                                                              |
| #5   | Missing provider configuration/failure returns a controlled, retryable, vendor-neutral, redacted schema; no provider/diagnosis content or grow-log mutation persists; active admission is released while opaque attempt/cooldown accounting remains intentionally. Delivered proof is focused Vitest, persisted loopback Supabase smoke, built local workerd smoke, and one browser SSR flow. | Build/typecheck or local workerd proves deployed Cloudflare configuration; provider failure means zero DB writes; another environment, Supabase outage test, or upstream-status prediction is required. | env precedence, lazy provider construction, public error schema/redaction, persisted admission lifecycle, built local Worker boundary, and the narrow browser SSR oracle | unit + local persisted/runtime/browser smoke | claiming local-as-production, predicting provider/Cloudflare statuses, adding deployment environments, or broad provider/browser E2E |
| #6   | Defined stage/body invariants are enforced server-side and by the DB; malformed resource IDs are classified before DB/provider work; spoofed owners are ignored and direct cross-owner operations are denied; account-deletion policy matches middleware visibility.                                                                                                                          | UI validation or a generic database failure equals the product contract.                                                                                                                                | server validation and ID schema, migration constraints/RLS policies, authenticated owner derivation, API side effects                                                    | integration + migration/RLS smoke            | testing only client forms or static SQL text                                                                                         |
| #7   | Invalid, non-owner, and unsupported requests fail before private-data access or provider cost and return redacted errors; after an explicit cost policy exists, repeated valid requests and oversized inputs/outputs remain bounded.                                                                                                                                                          | "Signed in" means safe, client validation is sufficient, or per-call timeout bounds request volume and provider spend.                                                                                  | auth/resource boundary, input and stored-text bounds, error/log redaction, provider-call ordering, rate/concurrency/deduplication control surface                        | integration + abuse/security contract tests  | happy-path auth tests, one benign request, assuming missing controls pass, or asserting debug details                                |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                | Goal (one line)                                                                                                                                                                                   | Risks covered     | Test types                                    | Status      | Change folder                                                |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------- | ----------- | ------------------------------------------------------------ |
| 1   | Diagnosis Contract Hardening              | Prove diagnosis confidence, selected-log binding, malformed provider handling, and scope outcomes at the cheapest deterministic layers.                                                           | #1, #2, #3        | unit, integration, contract/evaluation        | complete    | context/changes/testing-diagnosis-contract-hardening/        |
| 2   | Ownership, Abuse, And Mutation Boundaries | Prove owner-scoped access, hostile-input rejection, secret/private-data redaction, side-effect boundaries, and costly-operation controls for diagnosis, account deletion, and bulk/grow-log APIs. | #4, #6, #7        | integration, abuse/security, RLS/manual smoke | complete    | context/changes/testing-ownership-abuse-mutation-boundaries/ |
| 3   | Runtime Failure And Smoke Layer           | Prove env/provider/runtime failures are visible, controlled, and covered by focused smoke checks.                                                                                                 | #5, cross-cutting | targeted smoke, limited browser/manual        | complete    | context/changes/testing-runtime-failure-smoke-layer/         |
| 4   | Quality Gates And Cookbook                | Lock the current floor in CI/docs and write cookbook patterns for future tests.                                                                                                                   | cross-cutting     | gates, documentation                          | not started | —                                                            |

Status vocabulary (fixed - parser literals):

| Value           | Meaning                                                             |
| --------------- | ------------------------------------------------------------------- |
| `not started`   | No change folder for this rollout phase yet.                        |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched`    | `research.md` exists in the change folder.                          |
| `planned`       | `plan.md` exists with a `## Progress` section.                      |
| `implementing`  | Progress section has at least one `[x]` and at least one `[ ]`.     |
| `complete`      | Progress section is fully `[x]`.                                    |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

| Layer                | Tool                                       | Version | Notes                                                                                                                     |
| -------------------- | ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| unit + integration   | Vitest                                     | 4.1.7   | Meaningful existing suite; use for deterministic API, service, and component coverage.                                    |
| API mocking          | custom mocks / direct dependency injection | n/a     | Prefer boundary mocks for provider, Supabase, and fetch edges already present in the codebase.                            |
| e2e                  | Playwright                                 | 1.61.0  | One Chromium project and one reviewed runtime/SSR risk spec; reserve browser coverage for uniquely cross-boundary signal. |
| accessibility        | none yet                                   | n/a     | See Phase 4 if accessibility checks become necessary.                                                                     |
| (optional) AI-native | Browser plugin - checked: 2026-06-15       | n/a     | Use only for runtime/manual verification where deterministic tests miss the signal.                                       |

**Stack grounding tools (current session):**

- Docs: Context7 - Astro 6.3.1 and Vitest 4.1.6 docs checked for current testing guidance; checked: 2026-06-15
- Search: Exa.ai - available in current session, not needed after Context7 grounding; checked: 2026-06-15
- Runtime/browser: Browser tool - available as a local verification layer, not used during plan write; checked: 2026-06-15
- Provider/platform: GitHub CLI - locally available for workflow/CI awareness, not used as a provider MCP; checked: 2026-06-15

Use docs MCPs for current framework/library APIs and setup details. Use
search MCPs for discovery or current status only, then prefer official docs
as the evidence. Do not use MCP docs/search to infer code failure anchors;
those belong in per-phase `/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                        | Where                 | Required?                                      | Catches                                                                            |
| --------------------------- | --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| lint + canonical typecheck  | local pre-commit + CI | required                                       | lint failures, generated Worker declaration drift, Astro/TypeScript errors         |
| unit + integration          | local + CI            | required after §3 Phase 1                      | logic regressions                                                                  |
| e2e on critical flows       | CI on PR              | required after §3 Phase 2 only if still needed | broken critical user paths                                                         |
| abuse/security contracts    | local + CI            | required after §3 Phase 2                      | owner bypass, hostile input, secret/private-data leak, unbounded costly operations |
| post-edit hook              | local (agent loop)    | recommended after §3 Phase 3                   | regressions at edit time                                                           |
| visual diff (deterministic) | CI on PR              | optional                                       | rendering regressions                                                              |
| multimodal visual review    | CI on PR              | optional                                       | visual issues classic diff misses                                                  |
| built-runtime smoke         | local + CI            | required after §3 Phase 3                      | Worker-shaped boot, bindings bridge, middleware, redirects, and SSR execution      |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section names the smallest
local proof for the risk and the boundary it does not prove.

### 6.1 Adding a unit test

- **Location**: `src/lib/**` or `src/components/**` next to the unit under test.
- **Naming**: `<module>.test.ts` or `<module>.test.tsx`.
- **Reference test**: `src/lib/diagnosis/prompt.test.ts`.
- **Run locally**: `npm run test:unit`.

### 6.2 Adding an integration test

- **Location**: `src/pages/api/**` or the boundary-adjacent module under test.
- **Boundary-mocking policy**: keep validation and orchestration real; mock only provider, network, or Supabase edges when the asserted oracle does not require persisted state. Do not mock an internal service merely to restate its return value.
- **Persisted-state policy**: when the claim is a database constraint, RLS decision, atomic admission, or selected-row/survivor outcome, use the loopback-only local Supabase smoke. Static SQL text and fluent query mocks are drift signals, not persisted-state/RLS proof.
- **Reference tests**: `src/pages/api/diagnosis/selected-log.test.ts` for request/response ordering and `scripts/smoke-ownership-rls.ts` for persisted database behavior.
- **Run locally**: `npm run test:unit`; after an explicit disposable local reset, provide the smoke's required credentials through its process environment and use `npm run test:rls` for database claims. Standard Astro/Cloudflare commands may load `.dev.vars` normally.
- **Current guidance checked**: 2026-08-31 (`package.json`, `package-lock.json`, and local Supabase smoke scripts).

### 6.3 Adding an e2e test

- **Layout**: start from `tests/e2e/seed.ts` and `tests/e2e/e2e-quality-rules.md`; keep the reviewed business-risk spec beside them under `tests/e2e/`, with its generation brief under `tests/e2e/prompts/`. Use `tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts` as the shipped reference.
- **Run locally**: start/reset only disposable loopback Supabase with `npx supabase start` and `npx supabase db reset --local`. Run the full reviewed suite with `npm run test:e2e`, or the single reference spec with `npm run test:e2e -- tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts`. Use `npm run test:worker-runtime` for the built-runtime-only smoke and append `-- --headed` to an E2E command when observing the browser.
- **Credentials and ordering**: supply local Supabase values through the invoking process environment, or let the harness obtain them from the local Supabase CLI. Do not inspect secret files. `scripts/run-e2e.ts` refuses a non-loopback URL, creates one confirmed disposable owner first, injects that exact ID as `AUTHORIZED_USER_ID`, then builds and starts the workerd-backed preview. The setup project signs in through the application contract and saves `playwright/.auth/owner.json`; no UI login or stale server is reused.
- **Fixture lifecycle and hygiene**: use unique timestamp/UUID data in every spec and clean only rows owned by the generated principal and identified by that run's titles. The harness always stops the server, removes the exact generated owner, auth state, and temporary binding metadata in `finally`. `playwright/.auth/`, `playwright/.fixture/`, `test-results/`, and `playwright-report/` are ignored and disposable. `npm run test:e2e:cleanup` is the forced-failure cleanup oracle.
- **Locators and waits**: prefer `getByRole`, `getByLabel`, and visible text; use `getByTestId` only when accessible attributes are genuinely ambiguous. Never use CSS/XPath/DOM-structure selectors or `page.waitForTimeout()`. Wait for visible state, URL, response, or event changes.
- **Acceptance**: each risk spec must run independently, pass as a single-spec command, be reviewed against hallucinated assertions, brittle selectors, shared state, wait-for-time, and missing cleanup, then visibly fail against a temporary deliberate break of the protected behavior. Revert the break immediately and require the exact spec to return green.
- **CI scope**: `.github/workflows/ci.yml` installs Chromium, starts and explicitly resets disposable local Supabase, exports only its local credentials, runs `npm run test:e2e`, and stops the stack in an `always()` step. It contains no hosted or production mutation target.
- **Proof boundary**: the shipped create-two/delete-one/reload oracle proves cookie-backed auth, middleware, real form/dialog/redirect wiring, selected-row deletion, survivor preservation, persistence, and SSR reread. It is not evidence for RLS/cross-owner denial, hostile input, provider behavior or cost, Supabase outages, deployed Cloudflare configuration, or production readiness.

### 6.4 Adding a test for a new API endpoint

- **Test type**: integration (preferred).
- **Pattern**: exercise the handler through its real request contract and table-drive unauthenticated, malformed, oversized, missing, non-owner, unsupported, and thin-context cases that apply to the endpoint.
- **Fail-before-work oracle**: assert rejected requests make zero owner-private reads, mutations, privileged Admin calls, or provider work. For provider-bearing endpoints, this is the fail-before-cost pattern: admission is reached only after every no-cost refusal.
- **HTTP redaction oracle**: put sentinel grow-log, secret, provider-error, and stack values into controlled failures, then assert none appear in the production-shaped response. Keep missing and non-owner resources publicly indistinguishable where required.
- **Reference tests**: `src/pages/api/grow-logs/[id]/delete.test.ts`, `src/pages/api/account/delete.test.ts`, and `src/pages/api/diagnosis/selected-log.test.ts`.
- **When to add e2e instead**: only if the endpoint's failure mode requires the full deployed shape and integration cannot catch the risk cheaply.
- **Current guidance checked**: 2026-08-31 (`package.json`, `package-lock.json`, and API test fixtures).

### 6.5 Adding an abuse/security test

- **Test type**: integration or contract test at the smallest boundary that proves the abuse scenario.
- **Fail-before-cost matrix**: assert invalid, missing, non-owner, unsupported, and thin-context requests consume no admission quota and start no provider work. Assert provider failures consume an admitted rate slot but release the active lease.
- **Durable-admission pattern**: prove sequential limits, concurrent one-in-flight behavior, exact-duplicate cooldown, stale-lease recovery, and controlled generic 429 responses against the database-backed boundary; an isolate-local map or a per-call timeout is not a volume-control proof.
- **Two-principal RLS pattern**: create two temporary confirmed Auth users, sign both in through the anon-key client to obtain distinct JWT sessions, and reserve the service-role client for exact fixtures, persisted-state oracles, and cleanup. Assert selected-row deletion plus unselected/cross-owner survivors after mutation.
- **Local safety**: require a loopback Supabase URL, reset the disposable database explicitly before the smoke, pass the smoke's credentials through its process environment, and clean up only the generated fixture users in `finally`. Do not directly inspect or modify `.dev.vars`; normal loading by Astro/Cloudflare tooling is expected and allowed.
- **Required checks**: ownership/resource ID, application and database input bounds, persisted survivor state, owner-only pending-deletion visibility without authenticated mutation, HTTP redaction, provider-call ordering, durable rate/concurrency/deduplication, and privileged-work idempotency.
- **Anti-patterns**: do not use a happy-path authenticated request, static migration text, repository query shape, or a browser-only CRUD flow as proof of ownership/RLS or bounded provider cost.
- **Run locally**: `npm run test:unit`; for persisted RLS/admission proof, use `npm run test:rls` after the explicit local reset.
- **Current guidance checked**: 2026-08-31 (Vitest 4.1.7, Supabase CLI 2.23.4, and AI SDK output bounds).

### 6.6 Adding a test for a new content-build rule

- **Scope**: test deterministic application-owned content and build contracts only: generated routes/assets, Astro/TypeScript diagnostics, and repository formatting. Do not turn a content-build check into a visual, provider, hosted, or production smoke test.
- **Pattern**: assert stable output or command status from committed inputs; keep timestamps, network calls, secrets, and machine-specific paths out of the oracle. When a generated artifact is framework-owned, prefer the framework's check over snapshotting implementation details.
- **Run locally**: `npm run format:check`, `npm run typecheck`, and `npm run build`.
- **Proof boundary**: these commands prove reproducible local build/static contracts only. They do not prove deployed Cloudflare bindings, hosted Supabase behavior, RLS, provider availability, or browser/runtime wiring.

### 6.7 Per-rollout-phase notes

- **Phase 2 - Ownership, Abuse, And Mutation Boundaries (2026-07-30)**: query construction and static SQL inspection cannot prove persisted RLS. Use two JWT principals and selected-row/survivor assertions against the explicitly reset local stack.
- Valid diagnosis cost is bounded only after fail-before-cost exits by durable database admission; provider timeouts alone do not bound request volume. Keep the create-two/bulk-delete-one/reload browser smoke in Phase 3 for runtime/SSR wiring.

### 6.8 Running the static quality gate

- **Canonical commands**: `npm run format:check`, `npm run typecheck`, `npm run test:unit`, `npm run lint`, and `npm run build`.
- **Contract**: all five commands are non-mutating validation gates. `format:check` runs Prettier in check mode; `typecheck` runs `astro check`; unit tests, ESLint, and the build validate their existing contracts. The lint warning policy remains unchanged.
- **Enforcement**: CI runs `npx astro sync` followed by the five static commands. Run the same sequence locally before a phase closes. The Husky pre-commit hook invokes lint-staged and the canonical typecheck; it may apply its existing fixes to staged files.
- **Separate proof layers**: use `npm run test:rls`, `npm run test:runtime:provider-failure`, `npm run test:worker-runtime`, and `npm run test:e2e` for their documented persisted, runtime, and browser risks. These are not promoted into the static gate. Worker declaration generation remains separate: use `npm run types:generate`, review any diff, and rerun the gate.
- **Current guidance checked**: 2026-08-31 (`package.json`, `package-lock.json`, Husky, CI workflow, and smoke/E2E assets). Checked versions include Astro 7.0.2, Vitest 4.1.7, Prettier 3.8.3, Playwright 1.61.0, Supabase CLI 2.23.4, and Node 24.15.0.
- **Rollout status**: Quality Gates And Cookbook documentation is complete. Static CI remains validation-only; it does not prove RLS, hosted/production behavior, provider availability, deployed Cloudflare configuration, or production readiness.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- Broad e2e coverage for every CRUD path - focused integration tests catch the risk more cheaply.
- Pixel-perfect UI tests - they are too brittle for the signal they return.
- Generated or framework-owned boilerplate - the generator is the test.
- Purely cosmetic screenshot churn on ordinary forms - it does not prove product behavior.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-31
- Stack versions last verified: 2026-08-31 (`package.json`, `package-lock.json`, `.nvmrc`)
- AI-native tool references last verified: 2026-08-31 (repository-local commands and checked-in E2E assets)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
