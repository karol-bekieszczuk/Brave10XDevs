---
date: 2026-07-30T18:10:05+02:00
researcher: Codex
git_commit: abdbd18a4c85ba066f261301db7e80c62702a6b5
branch: master
repository: karol-bekieszczuk/Brave10XDevs (MycoHubAI)
topic: "Ground rollout Phase 2: Ownership, Abuse, And Mutation Boundaries"
tags: [research, codebase, ownership, validation, rls, abuse, diagnosis, grow-logs, account-deletion]
status: complete
last_updated: 2026-07-30
last_updated_by: Codex
last_updated_note: "Backported approved Risk #4, #6, and #7 corrections into the test plan"
---

# Research: Ownership, Abuse, And Mutation Boundaries

**Date**: 2026-07-30T18:10:05+02:00  
**Researcher**: Codex  
**Git Commit**: `abdbd18a4c85ba066f261301db7e80c62702a6b5`  
**Branch**: `master`  
**Repository**: `karol-bekieszczuk/Brave10XDevs` (`MycoHubAI/` subdirectory)

GitHub permalinks are intentionally omitted: the researched commit is one commit ahead of `origin/master`, so commit URLs would not resolve yet. References below point to the live checkout.

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`, Risks #4, #6, and #7. For each risk, trace the real failure path, verify or correct the proposed response, locate existing tests, choose the cheapest useful layer, and identify speculative or misleading hot-spot evidence. Also decide whether the proposed authenticated two-log bulk-delete browser scenario adds unique Phase 2 signal or belongs in the later Runtime Failure And Smoke Layer.

## Summary

The plan's core direction is correct, but Phase 2 must separate three kinds of evidence:

1. **Application ordering and query construction** are already reasonably covered. Grow-log operations derive the owner from authenticated locals, repositories add explicit owner filters, diagnosis loads the owner-scoped log before provider creation, and account deletion exposes no client-selected target user.
2. **Persisted ownership and database enforcement** are not proved by the current suite. Existing repository tests record fluent mock calls; they do not execute Postgres constraints or RLS with two identities. A narrow local-Supabase smoke is the cheapest honest proof for cross-owner access and mutation.
3. **Abuse/cost protection is incomplete.** Valid repeated diagnosis requests have no rate, concurrency, quota, deduplication, or cache control. Grow-log text has no size bound and is interpolated into embedding/generation inputs. Provider timeouts bound one call's duration, not request volume or cost.

Two concrete correctness gaps change the response guidance:

- Diagnosis accepts any nonblank `growLogId`. A malformed UUID reaches PostgREST, escapes the service's provider `try/catch`, and is translated by the route into `provider_failed`/502 instead of `invalid_request`/400. It still does not start provider work.
- `account_deletion_requests` enables RLS but defines no policy, while middleware queries it through the session-bound client. The mocked middleware test therefore proves intended branching but not that a pending deletion row is visible at runtime.

The proposed browser scenario is useful, but not for Phase 2's unique risk oracles. It proves form wiring, confirmation, redirect, persisted mutation, and SSR refresh for one benign owner. It does not exercise non-owner/missing IDs, hostile inputs, RLS, repeated requests, redaction, or provider cost controls. Put it in Phase 3, **Runtime Failure And Smoke Layer**, after Phase 2 integration/RLS coverage.

## Detailed Findings

### Risk #4: owner and privacy boundaries

#### Real protected paths

Grow-log reads and mutations carry ownership at both application and database layers:

- The SSR list passes `user.id` to `listOwnerGrowLogs` (`src/pages/grow-logs/index.astro:7-9`).
- Detail lookup passes both route ID and authenticated owner (`src/pages/grow-logs/[id].astro:7-14`).
- Repository list, detail, update, single-delete, and bulk-delete queries add `owner_id` filters (`src/lib/grow-logs/repository.ts:88-112`, `src/lib/grow-logs/repository.ts:127-165`).
- The database independently applies owner-only select, insert, update, and delete policies (`supabase/migrations/20260529191400_create_grow_logs.sql:32-57`).

The critical repository quote is:

> `.eq("id", id).eq("owner_id", ownerId)`

Single delete checks owner-scoped existence before mutation, returns the same generic not-found result for missing/non-owned IDs, and then repeats both ID and owner filters on delete (`src/pages/api/grow-logs/[id]/delete.ts:5-25`; `src/lib/grow-logs/repository.ts:148-153`). A missing path ID becomes `""` and cannot reach deletion if the lookup returns no row. There is a benign race: if the row disappears between lookup and delete, the route reports success because it does not inspect a deleted-row count, but it still cannot delete another owner's row.

Bulk delete parses IDs and executes one owner-first delete:

> `delete().eq("owner_id", ownerId).in("id", ids)`

(`src/pages/api/grow-logs/bulk-delete.ts:10-29`; `src/lib/grow-logs/repository.ts:156-165`). A mixed set of owned, non-owned, and nonexistent valid UUIDs can delete only matching owned rows. Non-owned and missing IDs are deliberately indistinguishable and do not leak row contents or existence.

Selected-log diagnosis also preserves the boundary. The service validates, loads through `getOwnerGrowLog`, returns `grow_log_not_found`, and only then creates the provider, embeds, retrieves, and generates (`src/lib/diagnosis/service.ts:203-258`). The public route takes owner identity only from `context.locals.user`, never from the JSON body (`src/pages/api/diagnosis/selected-log.ts:52-106`). Reading the API-key binding before calling the service is configuration access; provider construction remains lazy.

Account deletion has no client-controlled target ID. The route passes only `context.locals.user.id` into a server-only admin service (`src/pages/api/account/delete.ts:16-26`). The service uses that same ID for request state and `auth.admin.deleteUser` (`src/lib/account-deletion/service.ts:60-115`). Final Auth deletion cascades through `grow_logs.owner_id references auth.users(id) on delete cascade` (`supabase/migrations/20260529191400_create_grow_logs.sql:1-4`). The internal service can accept any ID, so preserving the route's authenticated-ID derivation and admin-client isolation is the meaningful contract.

Authentication alone is not treated as ownership: global middleware additionally permits only the configured `AUTHORIZED_USER_ID` (`src/middleware.ts:35-67`; `src/lib/access-control.ts:20-23`), repositories scope resources by owner, and `grow_logs` RLS is a second database boundary.

#### Existing proof and missing proof

Current tests prove useful but narrower facts:

- Repository tests assert owner filters for list, detail, update, delete, and bulk delete (`src/lib/grow-logs/repository.test.ts:119-230`).
- Diagnosis service tests prove owner-scoped load precedes provider work and missing logs cause zero provider creation/embedding/retrieval/generation (`src/lib/diagnosis/service.test.ts:72-153`).
- Bulk route tests cover auth absence, malformed/empty selection, owner forwarding, and redacted failure redirects (`src/pages/api/grow-logs/bulk-delete.test.ts:54-99`).
- Account route tests prove unauthenticated requests stop and successful calls use the authenticated ID (`src/pages/api/account/delete.test.ts:58-90`).

The gaps are material:

- No test executes `grow_logs` RLS with two authenticated identities.
- Query-builder mocks prove call shape, not persisted state or database policy behavior.
- Diagnosis route mocks the service; service tests inject a mocked grow-log loader. Neither proves a real non-owner lookup against Supabase.
- The single-delete route has only an owner happy path; it does not assert that missing/non-owned IDs leave `deleteGrowLog` uncalled (`src/pages/api/grow-logs/[id]/delete.test.ts:35-51`).
- No test submits mixed owned/non-owned/missing IDs and verifies survivor rows afterward.

#### Guidance verdict and cheapest layer

Keep the Risk #4 guidance, but define the proof as a **two-principal persisted-state integration/RLS smoke**, not another set of repository call-shape tests. Seed owner A and owner B rows; as A, verify B is absent from list/detail, cannot be diagnosed, and survives single/bulk delete attempts. Assert provider methods remain untouched for B/missing IDs. Then directly attempt cross-owner select, insert, update, and delete under RLS.

A small Vitest route test for missing/non-owner single delete is still worthwhile for ordering, but cannot replace the database smoke.

### Risk #6: server validation and RLS parity

#### What the server and database actually validate

The grow-log server contract is independent of the form. Create and update routes parse `FormData` and invoke `validateGrowLogInput` (`src/pages/api/grow-logs/create.ts:31-43`; `src/pages/api/grow-logs/[id]/update.ts:32-49`). The validator trims strings, rejects non-`agar|grain` stages, and rejects blank-after-trim title/body (`src/lib/grow-logs/validation.ts:39-87`). Non-string values normalize to empty and fail. Extra fields such as `owner_id` are ignored; ownership comes only from `context.locals.user.id` and is written by the repository (`src/pages/api/grow-logs/create.ts:24-43`; `src/lib/grow-logs/repository.ts:115-122`).

The DB mirrors those defined invariants: UUID owner FK, stage check, nonblank text checks, and owner-only RLS including insert/update `with check` (`supabase/migrations/20260529191400_create_grow_logs.sql:1-11`, `supabase/migrations/20260529191400_create_grow_logs.sql:32-57`). Neither server nor DB defines title/body length limits. Therefore “invalid body” currently means blank/non-string, not arbitrary hostile content or excessive size. Size/content rules must first be made explicit before tests can claim parity.

ID validation is inconsistent:

- Bulk IDs are UUID-shaped, deduplicated, and malformed entries are discarded (`src/lib/grow-logs/validation.ts:90-106`). Mixed valid plus malformed input succeeds using the valid subset; this is safe but is not strict whole-request rejection.
- Single update/delete IDs are not UUID-validated. Malformed values reach PostgREST and become generic redirects (`src/pages/api/grow-logs/[id]/update.ts:21-55`; `src/pages/api/grow-logs/[id]/delete.ts:5-25`).
- Diagnosis requires only a trimmed nonblank `growLogId` (`src/lib/diagnosis/schema.ts:7-10`). The owner lookup occurs before the service's provider `try/catch` (`src/lib/diagnosis/service.ts:203-230`), so a Postgres UUID-cast error reaches the route catch and is mislabeled `provider_failed`/502 (`src/pages/api/diagnosis/selected-log.ts:120-140`). Provider work still remains zero.

Owner IDs are not HTTP body inputs on grow-log, diagnosis, or account-deletion routes. “Invalid owner input” should therefore mean a crafted direct database operation or an assertion that spoofed form/JSON owner fields are ignored, not ordinary UI validation.

Diagnosis knowledge stage behavior is also more precise than “reject invalid stage.” Stored chunks have an `agar|grain` check; the RPC compares `stage_filter` to constrained rows and caps results at 20 (`supabase/migrations/20260606120000_create_diagnosis_knowledge_chunks.sql:3-21`, `supabase/migrations/20260606120000_create_diagnosis_knowledge_chunks.sql:47-78`). An invalid filter returns no rows rather than raising a validation error. The safety contract is “cannot retrieve cross-stage rows,” not necessarily “throws.”

#### Account-deletion RLS drift

`account_deletion_requests` enables RLS but creates no policies (`supabase/migrations/20260611110000_create_account_deletion_requests.sql:1-13`). Middleware nevertheless uses the session-bound Supabase client to call `getOwnerAccountDeletionRequest` (`src/middleware.ts:61-64`; `src/lib/account-deletion/repository.ts:60-71`). Without an owner-select policy, an authenticated client cannot observe its pending row. The middleware unit test mocks the repository (`src/middleware.test.ts:34-77`), so it conceals this database/runtime mismatch.

Historical planning explicitly required authenticated users to select only their own deletion row (`context/changes/delete-user-account/plan.md:70`, `context/changes/delete-user-account/plan.md:128`) and later marked the item complete (`context/changes/delete-user-account/plan.md:514`). Live migration code is the ground truth and contradicts that history.

This is a correctness/configuration drift, not a cross-owner leak: absent policies default-deny direct access. Admin account-deletion mutations still use the server-only service-role client.

#### Existing tests and cheapest layer

Validation unit tests cover supported stages, trimming, unsupported stage, blank title/body, and bulk UUID parsing (`src/lib/grow-logs/validation.test.ts:4-91`). Repository tests cover query shape, and bulk route tests cover malformed/empty input. There are no create/update route test files, no diagnosis malformed-UUID test, and no SQL/pgTAP/migration test harness.

Cheapest useful additions:

1. Vitest route tests for create/update: unsupported stage, blank/non-string body/title, spoofed `owner_id`, and zero repository mutation on rejection.
2. Diagnosis route/service test for malformed UUID, after defining the desired 400 `invalid_request` contract before DB/provider access.
3. A local-Supabase migration smoke with two identities for DB constraints and RLS, including owner-change-on-update and mismatched-owner insert.
4. An account-deletion policy smoke that first resolves whether owner-select is intended; current code and historical contract say yes, current migration says no.

Static SQL assertions can cheaply detect missing policy text, but they are drift alarms, not proof that RLS behaves correctly.

### Risk #7: hostile and repeated request abuse

#### Protected ordering and bounded inputs

Global middleware verifies Supabase user identity and the configured single owner before API routes run (`src/middleware.ts:35-67`). The diagnosis route rejects unauthenticated requests before JSON/provider work, parses through Zod, and only then enters the service (`src/pages/api/diagnosis/selected-log.ts:52-106`). The question is bounded to 2,000 characters (`src/lib/diagnosis/schema.ts:7-10`). The service repeats validation and owner lookup before provider creation (`src/lib/diagnosis/service.ts:203-258`).

Provider calls have time bounds: 15 seconds for embedding and 90 seconds for generation (`src/lib/diagnosis/provider.ts:9-12`, `src/lib/diagnosis/provider.ts:83-105`). Retrieval is bounded to a small default and SQL clamps results to 20 (`src/lib/diagnosis/retrieval.ts:47-56`; `supabase/migrations/20260606120000_create_diagnosis_knowledge_chunks.sql:74-78`). These bounds limit one request's duration/work, not how often work starts.

Production HTTP errors are generally generic. Runtime secrets are server-only bindings (`astro.config.mjs:18-25`; `src/lib/runtime-env.ts:27-32`), the route logs only API-key presence, and the provider prompt contains the selected owner log, question, and controlled knowledge chunks rather than secrets (`src/pages/api/diagnosis/selected-log.ts:99-102`; `src/lib/diagnosis/prompt.ts:35-63`). Prompt injection cannot reach other owners or runtime secrets through any tool surface in the current implementation; that threat is speculative unless the provider gains tools or broader context.

Redaction caveats remain. Development mode deliberately returns a caught error's name/message (`src/pages/api/diagnosis/selected-log.ts:40-46`) and provider debug logging can include error properties and stack (`src/lib/diagnosis/provider.ts:34-55`). `toDiagnosisError` logs raw unexpected errors and stacks (`src/lib/diagnosis/errors.ts:46-60`). Treat these as development/observability privacy risks, not a demonstrated production HTTP secret leak. Negative tests should submit sentinel private/secret text and assert absence; they should never preserve debug detail as an expected response contract.

#### Proven cost and resource-control gaps

Every valid, in-scope, sufficiently detailed owner request creates an embedding and, when retrieval returns chunks, a generation call (`src/lib/diagnosis/service.ts:230-258`). No limiter, per-owner quota, cache, duplicate suppression, in-flight coalescing, or concurrency gate exists in `src` or Worker configuration. Repeating the same signed-in request repeats billable work. This is a proven gap, not a speculative risk.

Stored grow-log text has no length bound at the validator or database (`src/lib/grow-logs/validation.ts:47-87`; `supabase/migrations/20260529191400_create_grow_logs.sql:4-11`) and full title/body/question text is fed into retrieval/prompt construction (`src/lib/diagnosis/prompt.ts:10-16`, `src/lib/diagnosis/prompt.ts:35-47`). A hostile authorized owner can therefore create individually large embedding/generation inputs, subject only to undocumented provider/platform limits. The route also calls `request.json()` before app validation without an explicit body-byte cap (`src/pages/api/diagnosis/selected-log.ts:73-79`). Platform limits may exist, but the repo does not establish them.

Generation has no explicit output/token cap and response arrays have no maximum cardinality (`src/lib/diagnosis/provider.ts:99-106`; `src/lib/diagnosis/schema.ts:17-25`).

Bulk delete rejects malformed-only selections and owner-scopes mutations, but it has no maximum selected-ID count; all repeated form fields are materialized and deduplicated before one `.in(...)` query (`src/lib/grow-logs/validation.ts:90-106`). This is a plausible resource/DB-query abuse gap, not a cross-owner deletion gap.

Account deletion ignores the body and targets the authenticated user. It becomes idempotent after `softDeletedAt`, but concurrent first requests can both observe no completed request and both invoke the Admin API (`src/lib/account-deletion/service.ts:73-101`). There is no explicit origin/CSRF check or route-level limiter. Cross-site exploitability is not established because cookie `SameSite` behavior is external to the inspected repo; absence of an explicit application check is factual, exploitability remains speculative.

The knowledge RPC is `security definer` and granted to the Supabase `authenticated` role, with a result cap of 20 (`supabase/migrations/20260606120000_create_diagnosis_knowledge_chunks.sql:47-83`). It does not expose grow logs or secrets, but any authenticated Supabase account can query the controlled knowledge corpus outside the app's `AUTHORIZED_USER_ID` gate. Whether that corpus is confidential is a product decision; this is not evidence of owner-private-data leakage.

#### Guidance verdict and cheapest layer

Correct the Risk #7 guidance from “prove costly-operation controls” to two explicit tracks:

- **Existing fail-before-cost behavior:** table-driven route/service integration tests for unauthenticated, malformed JSON/shape, oversized question, missing/non-owner ID, unsupported scope, and thin log. Assert zero provider work and absence of sentinel API key, log body, provider error, and stack.
- **Missing cost controls:** first choose and implement a per-owner rate/concurrency/deduplication policy plus input/output bounds. Then send sequential and concurrent valid requests and assert bounded provider calls plus a controlled retry response. The current implementation cannot pass this contract; provider timeouts are not a substitute.

Use a real or boundary-faithful Supabase client for ownership. Mock provider/network edges, not `diagnoseSelectedLog` or the internal owner loader, when the test's purpose is ordering and cross-owner protection.

## Browser Scenario Assessment

Scenario: an authenticated owner creates two unique grow logs, bulk-deletes exactly one, reloads the SSR list, and observes that only the selected log remains deleted.

Unique signal it adds:

- checkbox `name`/value and form-action wiring;
- browser confirmation and submission;
- redirect handling;
- real persisted mutation through the deployed/local runtime;
- SSR list refresh and visible preservation of the unselected row.

Signal it does **not** add:

- non-owner or missing-ID behavior;
- two-principal RLS enforcement;
- hostile/malformed input rejection;
- secret/private-data redaction;
- repeated-request or provider-cost control;
- account-deletion safety.

Therefore it belongs in Phase 3, **Runtime Failure And Smoke Layer**, as a thin browser/SSR mutation smoke. Phase 2 should prove the selected-row/survivor invariant more cheaply through API plus persisted database state, and prove ownership with a separate two-principal RLS case. With no Playwright infrastructure today, bootstrapping browser automation solely for this Phase 2 scenario would violate the test plan's cost-by-signal rule.

## Hot-Spot Evidence Assessment

| Hot spot                   | Verdict                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/api`            | Genuine evidence: auth, body parsing, error translation, mutations, and provider entry all cross here.                                                                                 |
| `src/lib/grow-logs`        | Genuine for owner query shape and server validation, but mocks cannot prove RLS.                                                                                                       |
| `src/lib/diagnosis`        | Genuine for owner-before-provider ordering, redaction, and the proven missing rate/size controls.                                                                                      |
| `supabase/migrations`      | Genuine and essential: it is the ground truth for constraints/RLS, including the account-deletion policy drift.                                                                        |
| `src/lib/account-deletion` | Relevant mainly for privileged ID derivation, idempotency/races, and the migration mismatch; a public cross-owner target-ID attack is low-likelihood because no target ID is accepted. |
| `src/lib/runtime-env`      | Relevant to secret isolation/redaction, but misleading as an anchor for Risk #6 stage/body/owner validation.                                                                           |

## Recommended Phase 2 Test Inventory

| Priority | Risk  | Test                                                                                                        | Cheapest honest layer                                       | Regression caught                               |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| P0       | #4/#6 | Two identities: owner A cannot select/update/delete/diagnose owner B; mismatched-owner insert/update denied | local Supabase integration/RLS smoke                        | Query-filter or migration-policy regression     |
| P0       | #7    | Repeated sequential/concurrent valid diagnosis requests obey an explicit cost policy                        | route/service integration after control is designed         | Unbounded embedding/generation spend            |
| P0       | #7    | Maximum grow-log/prompt/output sizes are enforced before provider work                                      | validation + route integration + DB constraint where chosen | Oversized stored/request content amplifies cost |
| P1       | #6    | Malformed diagnosis UUID returns controlled 400 before DB/provider                                          | route/service integration                                   | Current 502 misclassification                   |
| P1       | #6    | Pending deletion row visibility matches the intended owner-select policy                                    | migration/RLS smoke                                         | Current middleware/migration drift              |
| P1       | #4    | Missing/non-owned single-delete ID produces no delete side effect                                           | API route integration                                       | Happy-path-only delete regression               |
| P1       | #6    | Create/update reject invalid stage/blank or non-string fields and ignore spoofed owner                      | API route integration                                       | UI-only validation or owner spoofing            |
| P1       | #7    | Sentinel secrets/private text never appear in production-shaped error body/log contract                     | abuse/security contract test                                | Error/debug leakage                             |
| P2       | #7    | Bulk selection count is bounded before DB query                                                             | validation + route integration                              | Oversized form/query resource abuse             |
| P2       | #7    | Concurrent account-deletion requests do not duplicate Admin calls                                           | service integration with controlled concurrency             | Race-driven destructive/admin work              |

## Verification Performed

- Focused Vitest run: 9 files passed, 71 tests passed.
- Covered current grow-log validation/repository/bulk/single-delete, diagnosis route/service, account-deletion route/service, and middleware tests.
- Local Supabase reported running. No data or policy mutation was performed during research, so RLS findings remain grounded in migration SQL plus call paths, not claimed as an executed two-user smoke.

## Code References

- `src/middleware.ts:35-67` - authentication, configured-owner gate, and pending-deletion lookup.
- `src/lib/access-control.ts:20-23` - configured user equality check.
- `src/lib/grow-logs/repository.ts:88-165` - owner-scoped read and mutation queries.
- `src/lib/grow-logs/validation.ts:39-106` - grow-log and bulk-ID validation.
- `src/pages/api/grow-logs/bulk-delete.ts:10-29` - server-side selection validation and owner-derived bulk mutation.
- `src/pages/api/grow-logs/[id]/delete.ts:5-25` - owner lookup before single deletion.
- `src/lib/diagnosis/schema.ts:7-10` - diagnosis request bounds and missing UUID validation.
- `src/lib/diagnosis/service.ts:203-258` - owner lookup and provider-call ordering.
- `src/pages/api/diagnosis/selected-log.ts:40-46` - development error detail response.
- `src/pages/api/diagnosis/selected-log.ts:52-140` - auth, parsing, service invocation, and catch translation.
- `src/lib/diagnosis/provider.ts:9-12` - per-call timeout constants.
- `src/lib/diagnosis/provider.ts:83-105` - embedding and generation calls.
- `src/pages/api/account/delete.ts:16-26` - authenticated account ID derivation.
- `src/lib/account-deletion/service.ts:60-115` - idempotency state and Admin soft-delete ordering.
- `supabase/migrations/20260529191400_create_grow_logs.sql:1-57` - DB constraints, ownership FK, and RLS.
- `supabase/migrations/20260611110000_create_account_deletion_requests.sql:1-13` - RLS enabled without policies.
- `supabase/migrations/20260606120000_create_diagnosis_knowledge_chunks.sql:42-83` - direct-access revocation and authenticated security-definer RPC.

## Architecture Insights

The codebase uses defense in depth for grow logs: middleware identity gate, repository owner filters, and Postgres RLS. Tests should preserve the distinction between these layers. Route/service tests prove sequencing and controlled responses; a database smoke proves the final authorization boundary.

The account-deletion design deliberately crosses from a session client into a service-role client. That makes “where the target ID comes from” more important than validating a nonexistent request owner field. The pending-state read must nevertheless have an explicit session-side policy if middleware is expected to see it.

The diagnosis path is request-scoped and lazy enough to stop malformed shape, missing/non-owned logs, scope refusals, and thin context before provider calls. It is not admission-controlled: once a request is valid and in scope, nothing limits repeated or concurrently duplicated work.

## Historical Context (from prior changes)

- `context/changes/grow-log-data-contract/plan.md` established DB-first `agar|grain`, nonblank text, and owner-scoped RLS.
- `context/changes/staged-grow-log-crud/plan.md` required authenticated-owner-derived CRUD and server validation.
- `context/changes/bulk-grow-log-actions/plan.md` intentionally made owner/RLS responsible for mixed non-owned IDs and chose generic results.
- `context/changes/selected-log-diagnosis/plan.md` required owner lookup before embedding/retrieval/generation.
- `context/changes/selected-log-diagnosis/reviews/impl-review.md` caught eager provider construction; current service preserves lazy creation.
- `context/changes/delete-user-account/plan.md` required an owner-select policy for deletion state, but the live migration lacks it.
- `context/changes/testing-diagnosis-contract-hardening/research.md` previously grounded diagnosis ordering and controlled error behavior; live code remains the current source of truth for Phase 2.

## Related Research

- `context/changes/testing-diagnosis-contract-hardening/research.md`
- `context/changes/selected-log-diagnosis/research.md`
- `context/changes/selected-log-diagnosis/technology-research.md`

## Test-Plan Backport Candidates

The post-research backport check found response-guidance corrections that require user direction before `/10x-plan`:

1. **Risk #6:** narrow “invalid body/owner inputs” to defined server/DB invariants, crafted spoofed owner fields, and direct RLS operations; add malformed resource-ID classification and the account-deletion owner-select drift.
2. **Risk #7:** separate already-protected fail-before-provider cases from missing rate/concurrency/input-size controls. The current code cannot prove bounded repeated provider work because the control does not exist.
3. **Risk #4 hot-spot interpretation:** retain account deletion, but clarify that the public route has no client-selected account ID; the higher-value risk is authenticated-ID derivation/admin isolation plus pending-state policy behavior.
4. **Browser layer:** explicitly assign the one-owner bulk-delete/reload flow to Phase 3 runtime smoke, not Phase 2 ownership/abuse proof.

These corrections should update only risk wording/response guidance/source interpretation in `context/foundation/test-plan.md`; they must not add code anchors to the plan.

## Open Questions

- Should pending users be allowed to select only their own `account_deletion_requests` row, as the historical plan and middleware imply? If yes, the migration needs a narrow select policy and a real RLS test.
- What cost policy is acceptable for the single-owner MVP: fixed-window rate limit, one in-flight diagnosis, duplicate suppression, daily quota, or a combination?
- What maximum grow-log title/body and diagnosis output sizes are product contracts rather than provider/platform accidents?
- Is the diagnosis knowledge corpus confidential enough that its authenticated `security definer` RPC should also enforce the configured owner?
- Should mixed valid/malformed bulk IDs remain partial-success by design, or should any malformed entry reject the whole request?

## Follow-up Research 2026-07-30T18:59:17+02:00

The user approved the post-research backport. `context/foundation/test-plan.md` section 2 now records:

- Risk #4's real account-deletion boundary as authenticated target derivation, admin-client isolation, and owner-visible pending state rather than a client-supplied target ID.
- Risk #6's defined stage/body contract, malformed resource-ID classification, spoofed-owner handling, direct RLS proof, and account-deletion policy parity.
- Risk #7's split between existing fail-before-provider/redaction behavior and cost controls that must exist before repeated valid requests can be proved bounded.
- Corrected hot-spot interpretation: migrations are relevant to Risks #4/#6, grow-log input size is relevant to Risk #7, and runtime-env remains relevant only to secret isolation/redaction.

No file/line anchors were added to the test plan. The one-owner bulk-delete/reload browser scenario remains assigned by this research to Phase 3 runtime smoke; section 3 already defines that phase as limited browser/manual coverage, so no frozen phase-row edit was needed.
