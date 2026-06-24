# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-15

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

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence - not anchor) |
|---|---|---|---|---|
| 1 | Diagnosis sounds confident while wrong or unsupported by the selected grow log. | High | High | PRD US-01/FR-003; AGENTS hard rules; interview Q1/Q3; hot-spot dir `MycoHubAI/src/lib/diagnosis` |
| 2 | Malformed or partial OpenRouter/provider responses leak through API/service/UI and produce nonsense output. | High | High | interview Q1/Q2/Q4; active selected-log diagnosis surface; hot-spot dirs `MycoHubAI/src/lib/diagnosis`, `MycoHubAI/src/pages/api` |
| 3 | Missing-context, mixed-scope, or out-of-scope prompts are diagnosed instead of narrowed/refused. | High | Medium | PRD acceptance criteria and guardrails; F-03 rubric surface; interview Q3 |
| 4 | Owner/privacy boundaries regress across grow-log, diagnosis, account deletion, or bulk deletion flows. | High | Medium | PRD Access Control/FR-005; AGENTS privacy rule; roadmap S-03/S-04; hot-spot dirs `MycoHubAI/src/pages/api`, `MycoHubAI/src/lib/account-deletion` |
| 5 | Runtime/env/provider failure works in tests but fails locally or on Cloudflare. | Medium | High | roadmap observability partial; stack Cloudflare/OpenRouter; hot-spot runtime/config/auth areas |
| 6 | Server-side validation/RLS parity drifts as API surfaces expand. | High | Medium | PRD FR-001/FR-005; roadmap grow-log/account/bulk surfaces; hot-spot dirs `MycoHubAI/src/lib/grow-logs`, `MycoHubAI/supabase/migrations` |
| 7 | Abuse of authenticated/API/provider surfaces bypasses ownership, trusts hostile input, leaks secrets/private data, or triggers costly provider work repeatedly. | High | Medium | mandatory abuse lens for auth + user input + server-side provider calls; AGENTS privacy rule; PRD Access Control/FR-005; stack Cloudflare/OpenRouter; hot-spot dirs `MycoHubAI/src/pages/api`, `MycoHubAI/src/lib/diagnosis`, `MycoHubAI/src/lib/runtime-env` |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Answer evidence visibly depends on selected log/stage and uncertainty stays bounded. | Passing schema means answer quality is safe. | diagnosis entry point, prompt contract, selected-log binding, rubric oracle | integration + contract tests | implementation mirror |
| #2 | Bad provider shapes are rejected or translated into controlled errors before UI render. | Provider SDK always returns valid structured data. | provider boundary, validation path, error translation, UI rendering contract | unit + integration | happy-path-only mocks |
| #3 | Unsupported/missing/mixed cases follow rubric outcomes without invented diagnosis. | In-scope happy path proves guardrails. | evaluation cases, scope classes, service routing | contract/evaluation tests | copied production expected values |
| #4 | Non-owner/missing IDs cannot trigger diagnosis, data access, deletion, or side effects. | Authentication implies ownership. | owner checks, persisted state, API/resource boundary | integration | over-mocking internals |
| #5 | Missing secrets/provider failures surface controlled failure and do not persist bad state. | Build success proves runtime readiness. | env contract, Cloudflare/runtime boundary, failure mode | unit + manual smoke | local-only assurance |
| #6 | Invalid stage/body/owner inputs are rejected server-side and by DB/RLS where applicable. | UI validation equals product contract. | server validation, migration/RLS source, API side effects | integration + migration smoke | testing only client forms |
| #7 | Hostile or repeated requests cannot cross owner boundaries, bypass server validation, leak secrets/private data, or start unbounded expensive provider work. | "Signed in" means safe, client validation is enough, and provider calls are cheap/harmless, but cannot be repeatedly sent as can generate higher costs. | auth/resource boundary, input parsing, error/log redaction, provider-call ordering, rate/cost control surface | integration + abuse/security contract tests | happy-path auth tests, testing only one benign request, or exposing debug details as assertions |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Diagnosis Contract Hardening | Prove diagnosis confidence, selected-log binding, malformed provider handling, and scope outcomes at the cheapest deterministic layers. | #1, #2, #3 | unit, integration, contract/evaluation | complete | context/changes/testing-diagnosis-contract-hardening/ |
| 2 | Ownership, Abuse, And Mutation Boundaries | Prove owner-scoped access, hostile-input rejection, secret/private-data redaction, side-effect boundaries, and costly-operation controls for diagnosis, account deletion, and bulk/grow-log APIs. | #4, #6, #7 | integration, abuse/security, RLS/manual smoke | not started | — |
| 3 | Runtime Failure And Smoke Layer | Prove env/provider/runtime failures are visible, controlled, and covered by focused smoke checks. | #5, cross-cutting | targeted smoke, limited browser/manual | not started | — |
| 4 | Quality Gates And Cookbook | Lock the current floor in CI/docs and write cookbook patterns for future tests. | cross-cutting | gates, documentation | not started | — |

Status vocabulary (fixed - parser literals):

| Value | Meaning |
|---|---|
| `not started` | No change folder for this rollout phase yet. |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched` | `research.md` exists in the change folder. |
| `planned` | `plan.md` exists with a `## Progress` section. |
| `implementing` | Progress section has at least one `[x]` and at least one `[ ]`. |
| `complete` | Progress section is fully `[x]`. |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | 4.1.7 | Meaningful existing suite; use for deterministic API, service, and component coverage. |
| API mocking | custom mocks / direct dependency injection | n/a | Prefer boundary mocks for provider, Supabase, and fetch edges already present in the codebase. |
| e2e | Browser / Playwright-style manual smoke when needed | n/a | Reserve for user-visible flows that integration tests cannot express cheaply. |
| accessibility | none yet | n/a | See Phase 4 if accessibility checks become necessary. |
| (optional) AI-native | Browser plugin - checked: 2026-06-15 | n/a | Use only for runtime/manual verification where deterministic tests miss the signal. |

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

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions |
| e2e on critical flows | CI on PR | required after §3 Phase 2 only if still needed | broken critical user paths |
| abuse/security contracts | local + CI | required after §3 Phase 2 | owner bypass, hostile input, secret/private-data leak, unbounded costly operations |
| post-edit hook | local (agent loop) | recommended after §3 Phase 3 | regressions at edit time |
| visual diff (deterministic) | CI on PR | optional | rendering regressions |
| multimodal visual review | CI on PR | optional | visual issues classic diff misses |
| pre-prod smoke | between merge + prod | optional | environment-specific failures |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD - see §3 Phase <N>".

### 6.1 Adding a unit test

- **Location**: `src/lib/**` or `src/components/**` next to the unit under test.
- **Naming**: `<module>.test.ts` or `<module>.test.tsx`.
- **Reference test**: `src/lib/diagnosis/prompt.test.ts`.
- **Run locally**: `npm run test:unit`.

### 6.2 Adding an integration test

- **Location**: `src/pages/api/**` or the boundary-adjacent module under test.
- **Mocking policy**: only mock at the network/provider/Supabase edge. Never mock internal modules.
- **Reference test**: `src/pages/api/diagnosis/selected-log.test.ts`.
- **Run locally**: `npm run test:unit`.

### 6.3 Adding an e2e test

- TBD - see §3 Phase 3.

### 6.4 Adding a test for a new API endpoint

- **Test type**: integration (preferred).
- **Pattern**: exercise the handler through its request contract, assert response shape and side effects, and mock only the external edges.
- **Reference test**: `src/pages/api/grow-logs/[id]/delete.test.ts`.
- **When to add e2e instead**: only if the endpoint's failure mode requires the full deployed shape and integration cannot catch the risk cheaply.

### 6.5 Adding an abuse/security test

- **Test type**: integration or contract test at the smallest boundary that proves the abuse scenario.
- **Pattern**: assert the hostile or repeated request fails before data access, mutation, secret exposure, or costly provider work.
- **Required checks**: ownership/resource ID, server-side input validation, error/log redaction, provider-call ordering, and rate/cost behavior where the surface exists.
- **Anti-pattern**: do not reuse only a happy-path authenticated request as proof that abuse is blocked.

### 6.6 Adding a test for a new content-build rule

- TBD - see §3 Phase 1.

### 6.7 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2-3 line note
here capturing anything surprising the rollout phase taught - e.g., "Phase
2 found we needed a fixture catalog under `src/lib/...`; new content tests
should reuse it.")

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- Broad e2e coverage for every CRUD path - focused integration tests catch the risk more cheaply.
- Pixel-perfect UI tests - they are too brittle for the signal they return.
- Generated or framework-owned boilerplate - the generator is the test.
- Purely cosmetic screenshot churn on ordinary forms - it does not prove product behavior.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-15
- Stack versions last verified: 2026-06-15
- AI-native tool references last verified: 2026-06-15

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
