# Ownership, Abuse, And Mutation Boundaries Implementation Plan

## Overview

This plan delivers rollout Phase 2 from `context/foundation/test-plan.md` for Risks #4, #6, and #7. It hardens owner-scoped grow-log and diagnosis behavior, closes server/database validation drift, adds persisted two-principal RLS proof, and introduces durable admission controls for provider and privileged account-deletion work.

The rollout follows cost × signal. Cheap deterministic route and service contracts land first; database claims are proved later through a real local Supabase stack; the final sub-phase records only the cookbook patterns that actually shipped. The one-owner create-two/bulk-delete-one/reload browser scenario remains reserved for rollout Phase 3, Runtime Failure And Smoke Layer.

## Current State Analysis

The application already derives resource ownership from authenticated locals, repeats owner filters in grow-log repositories, and keeps diagnosis provider construction behind the selected-log lookup. Those safeguards have useful mocked tests, but the suite cannot currently prove persisted RLS behavior because repository tests assert fluent query shape rather than executing Postgres policies with distinct identities.

Several gaps are concrete. Diagnosis accepts any nonblank resource ID, so a malformed UUID reaches PostgREST and is translated as `provider_failed`/502. Create and update routes lack route-level coverage. Grow-log text, bulk cardinality, raw diagnosis JSON, and structured provider output are not fully bounded. Valid repeated diagnosis requests have no global rate, concurrency, or duplicate control, and concurrent first account-deletion requests can both cross the authenticated-ID-to-Admin-API boundary.

`account_deletion_requests` enables RLS without any policy even though middleware reads pending state through the session-bound client. The intended contract is owner-readable pending state with no authenticated mutation capability.

## Desired End State

Malformed, missing, non-owner, unsupported, oversized, and spoofed-owner requests fail at the earliest meaningful boundary with controlled responses and without private-data access, mutation, or provider work. Valid grow-log writes obey the same stage, nonblank, and length invariants in application validation and Postgres.

A local Supabase smoke creates two temporary Auth principals and proves real JWT-backed cross-owner denial, selected-row/survivor state, owner-only pending-deletion visibility, and the absence of authenticated pending-state mutations. This proof bypasses the application's single-owner middleware intentionally; it does not read or modify `.dev.vars`.

Provider-bearing diagnosis requests are durably bounded across Worker isolates: at most 10 admitted attempts per owner per fixed 10-minute window, one in-flight attempt, and a 60-second exact-duplicate cooldown. Concurrent account-deletion requests acquire one atomic processing lease before the Admin API. Public error responses remain controlled; existing server logging behavior is not expanded into a new redaction contract in this rollout.

### Key Discoveries:

- Diagnosis validates `growLogId` only as trimmed nonblank text in `src/lib/diagnosis/schema.ts:7`, while the lookup occurs before the provider error boundary in `src/lib/diagnosis/service.ts:203`.
- Owner-scoped grow-log queries exist in `src/lib/grow-logs/repository.ts:88`, but current tests prove query construction rather than persisted RLS state.
- `grow_logs` already has owner-only policies and stage/nonblank constraints in `supabase/migrations/20260529191400_create_grow_logs.sql:1` and `supabase/migrations/20260529191400_create_grow_logs.sql:32`.
- `account_deletion_requests` enables RLS without an owner-select policy in `supabase/migrations/20260611110000_create_account_deletion_requests.sql:13`, while middleware expects the session client to read pending state in `src/middleware.ts:61`.
- The public account-deletion route accepts no target ID and passes only `context.locals.user.id` into the admin service in `src/pages/api/account/delete.ts:16`.
- Provider timeouts in `src/lib/diagnosis/provider.ts:9` bound one call but do not bound request volume; the service starts provider work for every valid provider-bearing request in `src/lib/diagnosis/service.ts:230`.
- The current Cloudflare configuration has no KV or Durable Object admission binding, so process-local maps would not provide a global concurrency or rate guarantee.
- Context7 guidance checked 2026-07-30 confirms `maxOutputTokens` for current AI SDK generation settings, Vitest 4 concurrent-test isolation requirements, and Supabase CLI local reset/test prerequisites.

## What We're NOT Doing

- Not adding multi-user product flows, sharing, social behavior, saved diagnosis history, response caching, photo storage, or image analysis.
- Not treating the second RLS principal as an application-authorized user or changing `AUTHORIZED_USER_ID`.
- Not reading, rewriting, or temporarily patching `.dev.vars`; the RLS smoke authenticates directly against local Supabase.
- Not adding the one-owner browser CRUD/reload scenario to Phase 2; it remains a Phase 3 runtime smoke.
- Not calling static migration-text assertions, repository query-shape tests, or mocked middleware behavior persisted RLS proof.
- Not moving the local Supabase smoke into CI in this rollout.
- Not making the diagnosis knowledge corpus owner-private or redesigning its authenticated RPC grant; it contains controlled product knowledge rather than private grow-log data.
- Not creating a new server-log sanitization system. Decision 7B limits the new redaction assertions to production-shaped HTTP responses.
- Not silently preserving oversized legacy values. Decision 8B explicitly truncates existing titles/bodies to the new limits before constraints are added.

## Implementation Approach

Start with test-first contracts for malformed IDs and fail-before-work ordering. Add explicit server and response limits next, then apply matching forward migrations. Prove database behavior with two JWT-backed local principals, using service-role access only for fixtures, persisted-state oracles, and cleanup. After those prerequisites exist, add atomic Supabase-backed admission/lease functions and integrate them immediately before provider or Admin-API work. Finish with full gates and update `context/foundation/test-plan.md` §6 using only patterns demonstrated by the completed rollout.

Mock only provider, network, and Supabase edges when a deterministic route/service test is the cheapest honest layer. Do not mock internal orchestration when the asserted risk is ordering. For cross-owner or constraint claims, use the real local database and assert persisted survivor state because PostgREST may report a denied cross-owner update/delete as a successful zero-row operation.

## Critical Implementation Details

### State Sequencing

Diagnosis admission occurs only after authentication, request/resource-ID validation, owner-scoped lookup, supported-scope checks, and thin-context refusal, but before provider construction or embedding. Once admission succeeds, completion/release runs in `finally`; provider failure still consumes the admitted rate slot, while invalid, missing, non-owner, unsupported, and thin-context requests consume none.

Account deletion retains authenticated target derivation at the route. The admin service must atomically claim that derived user ID before invoking `auth.admin.deleteUser`; a concurrent loser follows the existing generic pending/success path rather than receiving target or lease details.

### Performance Constraints

The product contracts are: title at most 160 Unicode code points, body at most 8,000, at most 100 deduplicated valid bulk-delete UUIDs, raw diagnosis JSON at most 16 KiB, question at most 2,000 characters, provider output at most 1,200 tokens, and at most five causes, actions, and sources. Cause/action text is capped at 500 characters per entry, uncertainty at 1,000, follow-up at 500, source path at 300, and source heading at 200.

### Local Database Safety

The RLS smoke hard-fails unless `SUPABASE_URL` resolves to loopback. It never resets the database itself and never loads committed or local secret files. The human starts and resets the disposable local stack explicitly, exports the local URL/anon/service-role values into the shell, then runs the smoke. Fixture cleanup deletes only the two exact generated Auth user IDs in `finally`.

## Phase 1: Classify IDs And Fail Before Work

### Overview

Define resource-ID behavior and prove hostile, missing, and non-owner requests stop before private work or mutation. This is the cheapest high-signal phase and is suitable for red-green-refactor execution.

### Changes Required:

#### 1. Resource ID Validation Contract

**File**: `src/lib/grow-logs/validation.ts`, `src/lib/diagnosis/schema.ts`

**Intent**: Treat malformed UUIDs as client input errors before any Supabase lookup or provider path. Keep blank, malformed, valid-but-missing, and valid-but-non-owner outcomes distinct only where the public contract requires it.

**Contract**: Diagnosis requires a UUID-shaped `growLogId` and returns `invalid_request`/400 for malformed values. Single update/delete reject malformed path IDs through their existing controlled redirect/error convention. Valid missing and non-owner IDs remain indistinguishable and expose no row content or existence detail.

#### 2. Diagnosis Fail-Before-Work Integration

**File**: `src/lib/diagnosis/service.test.ts`, `src/pages/api/diagnosis/selected-log.test.ts`

**Intent**: Prove invalid and unavailable resources cannot reach owner-private context or provider cost.

**Contract**: Table-driven cases cover blank/malformed JSON, malformed UUID, well-formed missing ID, non-owner lookup result, unsupported scope, and thin log. Assertions prove zero provider construction, embedding, retrieval, and generation where the request exits before those boundaries. Production-shaped HTTP payloads exclude sentinel API-key, grow-log, provider-error, and stack text.

#### 3. Grow-Log Mutation Route Coverage

**File**: `src/pages/api/grow-logs/create.test.ts`, `src/pages/api/grow-logs/[id]/update.test.ts`, `src/pages/api/grow-logs/[id]/delete.test.ts`, `src/pages/api/grow-logs/bulk-delete.test.ts`

**Intent**: Challenge the authenticated happy path at each mutation entry point without treating repository call shape as database proof.

**Contract**: Create/update ignore submitted `owner_id` fields and use the authenticated owner. Malformed IDs stop before lookup/mutation; missing/non-owner single-delete lookup results leave deletion uncalled; mixed bulk inputs preserve the current valid-ID partial-success behavior. Redirects remain generic and contain no submitted IDs, titles, bodies, or internal errors.

#### 4. Privileged Account Target Derivation

**File**: `src/pages/api/account/delete.test.ts`

**Intent**: Freeze the meaningful public account-deletion ownership boundary before later concurrency work.

**Contract**: Crafted body/query target or owner fields are ignored, the request body need not be parsed, and the service receives only `context.locals.user.id`. Unauthenticated requests never create the admin client or invoke the service.

### Risk Contract:

- **Behavior asserted**: malformed/non-owner/missing IDs and spoofed owners stop before provider work or mutation; account deletion targets the authenticated user only.
- **Regression caught**: malformed diagnosis UUIDs becoming `provider_failed`/502, non-owner single-delete mutation, future target-ID trust, or private detail in controlled responses.
- **Research source**: `research.md` Risk #4 real protected paths/existing proof and Risk #6 ID inconsistency; `src/lib/diagnosis/schema.ts:7`, `src/lib/diagnosis/service.ts:203`, `src/pages/api/account/delete.ts:16`.
- **Edge/error/boundary cases**: blank, malformed, well-formed missing, B-owned ID, spoofed owner fields, unauthenticated request, sentinel response text.
- **Anti-pattern avoided**: happy-path authentication, internal implementation mirrors, debug-detail assertions, and mocked query shape presented as persisted proof.

### Success Criteria:

#### Automated Verification:

- Focused ID/ordering route and service tests pass with malformed, missing, non-owner, and spoofed-owner cases.
- Malformed diagnosis UUID returns controlled `invalid_request`/400 before Supabase lookup or provider construction.
- Missing/non-owner single-delete leaves the delete operation uncalled and returns the generic not-found behavior.
- Account deletion ignores client target fields and forwards only the authenticated user ID.
- Production-shaped HTTP errors contain none of the sentinel private/secret/debug values.
- Focused test command passes: `npm.cmd run test:unit -- src/lib/diagnosis/schema.test.ts src/lib/diagnosis/service.test.ts src/pages/api/diagnosis/selected-log.test.ts "src/pages/api/grow-logs/[id]/delete.test.ts" "src/pages/api/grow-logs/[id]/update.test.ts" src/pages/api/grow-logs/create.test.ts src/pages/api/account/delete.test.ts`.

#### Manual Verification:

- Review the response matrix and confirm valid missing and non-owner resources remain publicly indistinguishable.
- Confirm the account-deletion route has no client-selected target-ID contract.

**Implementation Note**: After this phase passes, pause for human confirmation before continuing. Start this phase with `/10x-tdd` because the malformed-ID and fail-before-work behavior is not yet implemented.

---

## Phase 2: Bound Server And Database Inputs

### Overview

Turn previously implicit resource limits into explicit server, provider, response-schema, and database contracts while preserving defined stage/body semantics.

### Changes Required:

#### 1. Grow-Log Input And Bulk Cardinality Limits

**File**: `src/lib/grow-logs/validation.ts`, `src/lib/grow-logs/validation.test.ts`

**Intent**: Reject excessive grow-log and bulk inputs before repository work while preserving current trimming, supported-stage, nonblank, deduplication, and partial-success rules.

**Contract**: Titles allow at most 160 Unicode code points; bodies allow at most 8,000; bulk parsing ignores malformed entries, deduplicates valid UUIDs in insertion order, and rejects more than 100 valid IDs after deduplication. Boundary tests cover exact-limit and one-over values, trim-to-empty values, duplicates, and mixed malformed/valid inputs.

#### 2. Create And Update Server Invariants

**File**: `src/pages/api/grow-logs/create.test.ts`, `src/pages/api/grow-logs/[id]/update.test.ts`

**Intent**: Prove server behavior independently from client forms.

**Contract**: Unsupported stage, blank/non-string title/body, and over-limit text fail before repository mutation. Extra owner fields remain ignored. Exact-boundary agar/grain inputs reach the repository under the authenticated owner.

#### 3. Diagnosis Request And Output Bounds

**File**: `src/lib/diagnosis/schema.ts`, `src/lib/diagnosis/schema.test.ts`, `src/pages/api/diagnosis/selected-log.ts`, `src/pages/api/diagnosis/selected-log.test.ts`, `src/lib/diagnosis/provider.ts`, `src/lib/diagnosis/provider.test.ts`

**Intent**: Bound request parsing and generated output rather than relying on platform/provider accidents.

**Contract**: Raw diagnosis JSON is rejected above 16 KiB before JSON parsing/service execution; the existing 2,000-character question limit remains. `generateText` receives `maxOutputTokens: 1200`. Structured output enforces at most five causes/actions/sources and the field limits defined under Performance Constraints; excess maps to the existing controlled `invalid_model_output`/502 behavior.

#### 4. Forward Grow-Log Constraint Migration

**File**: `supabase/migrations/<timestamp>_bound_grow_log_text.sql`

**Intent**: Align persisted invariants with application validation using the user's explicit migration decision for legacy values.

**Contract**: In one forward migration, existing titles are truncated to 160 and bodies to 8,000 Unicode code points before named length checks are added. Existing stage and nonblank constraints remain. The migration never prints or exports private content.

### Risk Contract:

- **Behavior asserted**: defined stage/body rules and explicit size/cardinality limits hold at server and database/provider boundaries.
- **Regression caught**: client-only validation, spoofed-owner mutation, oversized stored prompt context, unbounded bulk query inputs, or excessive provider output.
- **Research source**: `research.md` Risk #6 server/DB validation and Risk #7 proven cost gaps; `src/lib/grow-logs/validation.ts:39`, `supabase/migrations/20260529191400_create_grow_logs.sql:4`, `src/lib/diagnosis/schema.ts:7`.
- **Edge/error/boundary cases**: exact limit, one over, Unicode input, trim-to-empty, duplicate IDs, mixed valid/malformed IDs, excessive output cardinality/text.
- **Anti-pattern avoided**: testing only client forms, inventing undefined hostile-content rules, one benign request, or relying on provider defaults.

### Success Criteria:

#### Automated Verification:

- Grow-log validation tests pass for 160/8,000 exact and one-over boundaries.
- Create/update route tests prove invalid and oversized inputs cause zero repository mutation and spoofed owners are ignored.
- Bulk tests preserve partial success and reject more than 100 deduplicated valid UUIDs before deletion.
- Diagnosis tests reject raw JSON over 16 KiB before service/provider work.
- Provider/schema tests enforce `maxOutputTokens: 1200` and all response cardinality/text bounds.
- Focused validation command passes: `npm.cmd run test:unit -- src/lib/grow-logs/validation.test.ts src/pages/api/grow-logs/create.test.ts "src/pages/api/grow-logs/[id]/update.test.ts" src/pages/api/grow-logs/bulk-delete.test.ts src/lib/diagnosis/schema.test.ts src/lib/diagnosis/provider.test.ts src/pages/api/diagnosis/selected-log.test.ts`.

#### Manual Verification:

- Review the migration and explicitly accept the chosen irreversible truncation of pre-existing values before constraints are added.
- Confirm response limits still permit concise uncertainty-forward agar/grain diagnoses.

**Implementation Note**: After this phase passes, pause for human confirmation before continuing. Do not apply the migration to a non-local database as part of implementation verification.

---

## Phase 3: Prove Two-Principal RLS And Persisted Survivors

### Overview

Add the missing pending-deletion owner-select policy and prove database constraints and ownership with two real local Supabase identities and persisted-state oracles.

### Changes Required:

#### 1. Pending-Deletion Owner-Select Policy

**File**: `supabase/migrations/<timestamp>_allow_owner_select_account_deletion_requests.sql`

**Intent**: Make middleware's owner-read contract true without making pending state owner-mutable.

**Contract**: Add exactly one authenticated `SELECT` policy using `user_id = auth.uid()`. Add no authenticated insert, update, or delete policies. Existing service-role account-deletion mutations remain server-only.

#### 2. Local Two-Principal Smoke Harness

**File**: `scripts/smoke-ownership-rls.ts`, `package.json`

**Intent**: Provide the cheapest honest persisted database proof for owner boundaries and migration constraints.

**Contract**: Add `test:rls`. The script accepts local Supabase URL, anon key, and service-role key only from process environment; hard-fails for non-loopback URLs; creates two uniquely named confirmed Auth users through the admin client; signs each in through an anon-key client to obtain distinct JWTs; uses admin only for fixtures/oracles/cleanup; and hard-deletes only those generated user IDs in `finally`.

The two principals do not pass through `src/middleware.ts` and are not both application-authorized users. The script does not inspect or modify `.dev.vars`.

#### 3. Grow-Log RLS, Constraint, And Survivor Matrix

**File**: `scripts/smoke-ownership-rls.ts`

**Intent**: Prove cross-owner denial and selected-row/survivor state below the browser.

**Contract**: Seed at least two A rows and one B row. As A, prove B is absent from list/detail, cannot be updated/deleted, cannot be selected for diagnosis, and survives a mixed bulk delete. Prove the selected A row is deleted while the unselected A and B rows survive. Prove mismatched-owner insert and owner reassignment fail by re-reading exact persisted state through admin. Prove database stage, nonblank, and 160/8,000 checks independently of server validation.

#### 4. Pending-Deletion RLS Matrix

**File**: `scripts/smoke-ownership-rls.ts`

**Intent**: Prove owner-readable pending state does not become cross-owner or owner mutable.

**Contract**: Admin seeds one pending row per owner. A sees only A; B sees only B. Neither session can insert, update, or delete its own or the other principal's pending row. Admin survivor reads are the oracle when PostgREST returns zero affected rows without an error.

### Risk Contract:

- **Behavior asserted**: owner A cannot read/mutate/diagnose owner B; DB invariants hold; pending state is owner-select-only; selected and survivor rows have exact persisted outcomes.
- **Regression caught**: RLS policy drift, missing middleware visibility, owner reassignment, mixed bulk cross-owner deletion, or application mocks staying green while persisted behavior breaks.
- **Research source**: `research.md` Risks #4/#6, Account-deletion RLS drift, and Architecture Insights; live migrations at `supabase/migrations/20260529191400_create_grow_logs.sql:32` and `supabase/migrations/20260611110000_create_account_deletion_requests.sql:13`.
- **Edge/error/boundary cases**: two JWTs, zero-row cross-owner mutations, mismatched-owner inserts, owner changes, missing/B-owned diagnosis ID, own versus other pending row, exact survivors.
- **Anti-pattern avoided**: static SQL called RLS proof, service-role clients used for authorization assertions, query-builder mocks, and the reserved browser scenario.

### Success Criteria:

#### Automated Verification:

- `package.json` defines `test:rls` for the loopback-only ownership smoke.
- The smoke refuses non-loopback Supabase URLs and cleans up only generated fixture users.
- A/B JWT-backed assertions prove grow-log select/insert/update/delete RLS and database constraints through persisted state.
- Mixed bulk deletion removes only the selected A row; unselected A and B rows survive.
- Non-owner diagnosis lookup starts no provider work against the real local Supabase boundary.
- Pending-deletion rows are owner-readable and have no authenticated insert/update/delete path.

#### Manual Verification:

- Start local Supabase, explicitly reset the disposable local database so the full migration chain applies, export local credentials into the current shell, and run `npm.cmd run test:rls` successfully.
- Confirm the smoke ran without reading or modifying `.dev.vars` and without changing the application-authorized owner ID.

**Implementation Note**: Database reset is a deliberate manual gate because it destroys local Supabase data. The smoke script itself must never invoke reset.

---

## Phase 4: Enforce Durable Cost And Privileged-Work Admission

### Overview

Close the proven repeated-request and concurrent privileged-work gaps with atomic Supabase-backed admission contracts that remain valid across Cloudflare Worker isolates.

### Changes Required:

#### 1. Diagnosis Admission Migration

**File**: `supabase/migrations/<timestamp>_create_diagnosis_admission.sql`

**Intent**: Add the smallest durable state and atomic claim operation needed for the single-owner MVP policy without storing diagnosis content or raw private input.

**Contract**: Store per-owner fixed-window counts plus opaque in-flight/duplicate claim state. An authenticated atomic RPC derives the owner from `auth.uid()`, expires stale leases/cooldowns, admits no more than 10 attempts per fixed 10-minute UTC window, permits one in-flight claim, and rejects an identical fingerprint for 60 seconds. The in-flight lease expires after two minutes. Tables are not directly readable/mutable by authenticated clients; the function has minimal grants and a fixed safe search path.

#### 2. Admission Service Boundary

**File**: `src/lib/diagnosis/admission.ts`, `src/lib/diagnosis/admission.test.ts`, `src/lib/diagnosis/service.ts`, `src/lib/diagnosis/service.test.ts`

**Intent**: Integrate admission at the first point where provider cost is inevitable and make policy outcomes deterministic to test.

**Contract**: Normalize the question by trimming and collapsing whitespace, then SHA-256 hash owner ID, grow-log ID, and normalized question; store only the hash and opaque claim ID. Acquire after all no-cost exits and before provider construction. Release active state in `finally`; keep the rate count and 60-second cooldown after success or provider failure. Invalid, missing, non-owner, unsupported, and thin-context requests do not acquire or consume quota.

#### 3. Controlled 429 API Contract

**File**: `src/lib/diagnosis/errors.ts`, `src/lib/diagnosis/schema.ts`, `src/pages/api/diagnosis/selected-log.ts`, `src/pages/api/diagnosis/selected-log.test.ts`

**Intent**: Translate rate, concurrency, and duplicate rejection into one redacted public contract.

**Contract**: Add `rate_limited`, HTTP 429, `retryable: true`, message `Diagnosis requests are temporarily limited. Try again later.`, and an integer `Retry-After` header/controlled retry metadata. Do not expose counts, fingerprints, private input, claim IDs, or whether rate/concurrency/dedup triggered. Per decision 7B, new redaction assertions cover HTTP responses; this phase does not promise a new sanitized logging subsystem.

#### 4. Diagnosis Admission Contract Tests

**File**: `src/lib/diagnosis/admission.test.ts`, `src/lib/diagnosis/service.test.ts`, `src/pages/api/diagnosis/selected-log.test.ts`, `scripts/smoke-ownership-rls.ts`

**Intent**: Prove bounded sequential and concurrent behavior rather than assuming the presence of a limiter is sufficient.

**Contract**: Deterministic tests cover attempts 1–10 admitted and 11 rejected, exact window rollover, identical cooldown, concurrent identical and different questions while the first provider promise is held, provider failure/timeout consuming quota but releasing active state, stale-lease recovery, and pre-provider refusals consuming none. The local Supabase smoke issues parallel atomic claims and proves exactly one succeeds.

#### 5. Atomic Account-Deletion Processing Lease

**File**: `supabase/migrations/<timestamp>_claim_account_deletion_processing.sql`, `src/lib/account-deletion/repository.ts`, `src/lib/account-deletion/service.ts`, `src/lib/account-deletion/service.test.ts`, `src/pages/api/account/delete.test.ts`

**Intent**: Prevent concurrent first requests for the authenticated user from invoking the Admin API more than once.

**Contract**: Add opaque processing claim/expiry state and an atomic admin-side claim operation with a two-minute stale lease. The route still supplies only the authenticated user ID. A concurrent loser returns the existing generic pending/success behavior; failures release or eventually expire the claim for retry; completed pending requests remain idempotent. A held Admin-call test proves two concurrent service calls produce exactly one `deleteUser` call.

### Risk Contract:

- **Behavior asserted**: valid diagnosis cost and concurrent Admin work stay bounded; rejected inputs stay outside quota; all admission failures are generic/redacted.
- **Regression caught**: unlimited sequential provider work, duplicate concurrent embeddings/generation, isolate-local false protection, stale permanent lockout, rejected junk consuming quota, or duplicate Admin deletion calls.
- **Research source**: `research.md` Proven cost/resource-control gaps and Risk #7 guidance; `src/lib/diagnosis/service.ts:230`, `src/lib/diagnosis/provider.ts:9`, `src/lib/account-deletion/service.ts:73`.
- **Edge/error/boundary cases**: 10th/11th, window rollover, identical/different concurrency, provider timeout, stale lease, generic 429, concurrent account deletion, retry after failure.
- **Anti-pattern avoided**: one benign request, treating per-call timeout as volume control, in-memory Worker limits, assuming a missing control passes, or storing/replaying diagnosis content.

### Success Criteria:

#### Automated Verification:

- Sequential diagnosis tests prove 10 admissions per 10-minute window and controlled rejection of the 11th.
- Concurrent tests prove one provider-bearing request at a time and 60-second exact-duplicate suppression.
- Invalid, non-owner, unsupported, and thin-context cases consume no admission quota and start no provider work.
- Provider failure/timeout consumes its admitted slot, releases the active lease, and returns a controlled response.
- Local parallel RPC smoke proves exactly one simultaneous diagnosis claim is admitted.
- Concurrent account-deletion tests prove exactly one Admin API call and safe retry/idempotency behavior.
- Focused admission command passes: `npm.cmd run test:unit -- src/lib/diagnosis/admission.test.ts src/lib/diagnosis/service.test.ts src/pages/api/diagnosis/selected-log.test.ts src/lib/account-deletion/service.test.ts src/pages/api/account/delete.test.ts`.

#### Manual Verification:

- Review database admission functions and confirm they store no raw question, grow-log text, provider output, or secret.
- Confirm the public 429 and concurrent account-deletion outcomes reveal no internal policy or target details.

**Implementation Note**: After this phase passes, pause for human confirmation before continuing. Do not substitute an isolate-local map for the database-backed contract.

---

## Phase 5: Run Gates And Ship Cookbook Patterns

### Overview

Run the complete deterministic and local database gates, then document the patterns Phase 2 actually established for future test authors.

### Changes Required:

#### 1. Full Verification Gate

**File**: `package.json`, current test/config files

**Intent**: Demonstrate the new focused checks coexist with the existing suite and production build.

**Contract**: Run focused suites, full unit/integration tests, lint, build, and the manual local RLS/admission smoke. A local Supabase outage or unavailable Docker leaves the persisted-state manual gate honestly pending; static SQL inspection cannot replace it.

#### 2. Test Cookbook Update

**File**: `context/foundation/test-plan.md`

**Intent**: Update §6 with only the integration, API, abuse/security, and RLS/admission patterns that shipped.

**Contract**: Refresh §6.2, §6.4, and §6.5 with boundary-mocking policy, fail-before-work matrices, sentinel HTTP-redaction assertions, and persisted survivor oracles. Add the `test:rls` two-principal fixture/cleanup pattern and durable admission boundary. Append a concise §6.7 Phase 2 note. Preserve §1–§5 strategy except normal rollout status lifecycle, and leave §6.3 E2E assigned to Phase 3.

#### 3. Phase 3 Browser Reservation

**File**: `context/foundation/test-plan.md`

**Intent**: Prevent later contributors from misrepresenting the one-owner CRUD browser flow as Phase 2 ownership or abuse proof.

**Contract**: Cookbook notes state that create-two/bulk-delete-one/reload is a Phase 3 runtime/SSR wiring smoke. Phase 2's owner proof is two-principal persisted RLS; its mutation proof is selected-row plus survivor state below the browser.

#### 4. Dated Tool Guidance

**File**: `context/foundation/test-plan.md`

**Intent**: Keep current-tool claims auditable without promoting AI-native testing where deterministic checks already win.

**Contract**: Any Vitest, Supabase CLI, AI SDK, or browser/AI-native guidance changed by this rollout carries `checked: 2026-07-30`. No browser or vision tool is added to Phase 2.

### Risk Contract:

- **Behavior asserted**: all shipped boundaries pass together and future tests can repeat the cheapest honest patterns.
- **Regression caught**: cookbook drift back to happy-path/query-shape/static-SQL proof, undocumented local fixture hazards, or browser promotion without unique signal.
- **Research source**: `context/foundation/test-plan.md` §§1, 3, and 6; `research.md` Browser Scenario Assessment and Follow-up Research.
- **Edge/error/boundary cases**: unavailable local stack, cleanup failure, non-loopback guard, stale documentation, and Phase 3 scenario ownership.
- **Anti-pattern avoided**: documenting aspiration, substituting browser ceremony for persisted proof, or undated AI-native guidance.

### Success Criteria:

#### Automated Verification:

- Full unit/integration suite passes: `npm.cmd run test:unit`.
- Lint passes: `npm.cmd run lint`.
- Production build passes: `npm.cmd run build`.
- Search confirms the Phase 2 cookbook names persisted-state/RLS and fail-before-cost patterns without claiming static SQL or query mocks are proof.
- `context/foundation/test-plan.md` §6 contains the shipped Phase 2 patterns and dated guidance.

#### Manual Verification:

- On an explicitly reset local Supabase stack, `npm.cmd run test:rls` passes with two JWT principals, survivor assertions, admission concurrency, and cleanup.
- Confirm the Phase 2 plan contains no create-two/bulk-delete-one/reload browser gate and §6 keeps that scenario in Phase 3.
- Confirm no `.dev.vars` file was read or modified during implementation or verification.

**Implementation Note**: After the automated and manual gates pass, pause for human confirmation before closing the rollout phase.

---

## Testing Strategy

### Unit Tests:

- Validate UUID, grow-log length, bulk cardinality, diagnosis request/output, fingerprint normalization, and admission outcome contracts at their narrow pure boundaries.
- Use exact-limit/one-over, malformed/well-formed, duplicate, Unicode, stale-time, and window-boundary cases rather than copying production branches into expected values.

### Integration Tests:

- Exercise API handlers through real request bodies and route contracts; mock only Supabase/provider/network edges where persisted state is not the oracle.
- Exercise diagnosis orchestration with real validation and ordering while controlling owner lookup, admission, and provider promises at their boundaries.
- Use a real local Supabase stack for constraints, RLS, selected-row/survivor state, atomic admission, and two-principal claims.

### Abuse/Security Tests:

- Table-drive unauthenticated, malformed, oversized, missing, non-owner, unsupported, thin-context, repeated, duplicate, and concurrent requests.
- Assert fail-before-access/mutation/provider ordering and controlled HTTP responses containing no sentinel private/secret/debug text.
- Do not add new assertions about server-log sanitization under decision 7B.

### Manual Testing Steps:

1. Start the local Supabase stack.
2. Explicitly reset only the disposable local database to apply the full migration chain.
3. Export the local URL, anon key, and service-role key into the current PowerShell process without reading `.dev.vars`.
4. Run `npm.cmd run test:rls` and inspect the fixture cleanup result.
5. Run `npm.cmd run test:unit`, `npm.cmd run lint`, and `npm.cmd run build`.
6. Confirm the two generated identities authenticated directly to Supabase and did not pass through the application single-owner gate.
7. Confirm selected/unselected/cross-owner survivors and pending-deletion rows match the smoke report.

## Performance Considerations

The atomic diagnosis admission adds one local/remote Supabase round-trip before provider work. This is intentional: it creates a cross-isolate guarantee using infrastructure already present in the repository. A fixed window can allow a boundary burst, but the one-in-flight lease caps instantaneous provider work and the 10-attempt window caps sustained volume. The MVP does not need KV, Durable Objects, rolling-window infrastructure, response caching, or saved diagnosis history.

Bulk IDs are capped after deduplication, and stored/request/output size limits bound the main amplification paths. Admission cleanup should use bounded indexed queries or opportunistic expiry so stale rows do not create unbounded maintenance work.

## Migration Notes

All database changes are forward migrations; do not edit deployed historical migrations. The grow-log bounds migration intentionally truncates existing private title/body values before adding constraints, per decision 8B. This is irreversible once applied, so implementation verification is local-only and the manual gate must explicitly acknowledge the data-loss behavior before any non-local rollout.

The account-deletion owner-select migration grants authenticated `SELECT` only. Diagnosis admission tables/functions expose only the minimal authenticated RPC surface, and account-deletion processing claims remain behind the admin service boundary. Rollback requires dropping the new policies/functions/tables or constraints in a new forward migration; it must not restore truncated legacy text.

## References

- Change research: `context/changes/testing-ownership-abuse-mutation-boundaries/research.md`
- Rollout strategy: `context/foundation/test-plan.md`
- Lessons: `context/foundation/lessons.md`
- Progress contract: `.agents/skills/10x-plan/references/progress-format.md`
- Grow-log validation: `src/lib/grow-logs/validation.ts:39`
- Grow-log owner queries: `src/lib/grow-logs/repository.ts:88`
- Single-delete ordering: `src/pages/api/grow-logs/[id]/delete.ts:5`
- Diagnosis request schema: `src/lib/diagnosis/schema.ts:7`
- Diagnosis ordering: `src/lib/diagnosis/service.ts:203`
- Diagnosis provider bounds: `src/lib/diagnosis/provider.ts:9`
- Diagnosis API translation: `src/pages/api/diagnosis/selected-log.ts:52`
- Account target derivation: `src/pages/api/account/delete.ts:16`
- Account deletion sequencing: `src/lib/account-deletion/service.ts:60`
- Grow-log constraints/RLS: `supabase/migrations/20260529191400_create_grow_logs.sql:1`
- Pending-deletion table/RLS: `supabase/migrations/20260611110000_create_account_deletion_requests.sql:1`
- Context7 verification: Supabase CLI, Vitest 4.1.6, and AI SDK guidance checked 2026-07-30.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Classify IDs And Fail Before Work

#### Automated

- [x] 1.1 Focused ID/ordering route and service tests pass with malformed, missing, non-owner, and spoofed-owner cases. — 768f9c9
- [x] 1.2 Malformed diagnosis UUID returns controlled `invalid_request`/400 before Supabase lookup or provider construction. — 768f9c9
- [x] 1.3 Missing/non-owner single-delete leaves the delete operation uncalled and returns the generic not-found behavior. — 768f9c9
- [x] 1.4 Account deletion ignores client target fields and forwards only the authenticated user ID. — 768f9c9
- [x] 1.5 Production-shaped HTTP errors contain none of the sentinel private/secret/debug values. — 768f9c9
- [x] 1.6 Focused test command passes: `npm.cmd run test:unit -- src/lib/diagnosis/schema.test.ts src/lib/diagnosis/service.test.ts src/pages/api/diagnosis/selected-log.test.ts "src/pages/api/grow-logs/[id]/delete.test.ts" "src/pages/api/grow-logs/[id]/update.test.ts" src/pages/api/grow-logs/create.test.ts src/pages/api/account/delete.test.ts`. — 768f9c9

#### Manual

- [x] 1.7 Review the response matrix and confirm valid missing and non-owner resources remain publicly indistinguishable. — 768f9c9
- [x] 1.8 Confirm the account-deletion route has no client-selected target-ID contract. — 768f9c9

### Phase 2: Bound Server And Database Inputs

#### Automated

- [x] 2.1 Grow-log validation tests pass for 160/8,000 exact and one-over boundaries.
- [x] 2.2 Create/update route tests prove invalid and oversized inputs cause zero repository mutation and spoofed owners are ignored.
- [x] 2.3 Bulk tests preserve partial success and reject more than 100 deduplicated valid UUIDs before deletion.
- [x] 2.4 Diagnosis tests reject raw JSON over 16 KiB before service/provider work.
- [x] 2.5 Provider/schema tests enforce `maxOutputTokens: 1200` and all response cardinality/text bounds.
- [x] 2.6 Focused validation command passes: `npm.cmd run test:unit -- src/lib/grow-logs/validation.test.ts src/pages/api/grow-logs/create.test.ts "src/pages/api/grow-logs/[id]/update.test.ts" src/pages/api/grow-logs/bulk-delete.test.ts src/lib/diagnosis/schema.test.ts src/lib/diagnosis/provider.test.ts src/pages/api/diagnosis/selected-log.test.ts`.

#### Manual

- [x] 2.7 Review the migration and explicitly accept the chosen irreversible truncation of pre-existing values before constraints are added.
- [x] 2.8 Confirm response limits still permit concise uncertainty-forward agar/grain diagnoses.

### Phase 3: Prove Two-Principal RLS And Persisted Survivors

#### Automated

- [ ] 3.1 `package.json` defines `test:rls` for the loopback-only ownership smoke.
- [ ] 3.2 The smoke refuses non-loopback Supabase URLs and cleans up only generated fixture users.
- [ ] 3.3 A/B JWT-backed assertions prove grow-log select/insert/update/delete RLS and database constraints through persisted state.
- [ ] 3.4 Mixed bulk deletion removes only the selected A row; unselected A and B rows survive.
- [ ] 3.5 Non-owner diagnosis lookup starts no provider work against the real local Supabase boundary.
- [ ] 3.6 Pending-deletion rows are owner-readable and have no authenticated insert/update/delete path.

#### Manual

- [ ] 3.7 Start local Supabase, explicitly reset the disposable local database so the full migration chain applies, export local credentials into the current shell, and run `npm.cmd run test:rls` successfully.
- [ ] 3.8 Confirm the smoke ran without reading or modifying `.dev.vars` and without changing the application-authorized owner ID.

### Phase 4: Enforce Durable Cost And Privileged-Work Admission

#### Automated

- [ ] 4.1 Sequential diagnosis tests prove 10 admissions per 10-minute window and controlled rejection of the 11th.
- [ ] 4.2 Concurrent tests prove one provider-bearing request at a time and 60-second exact-duplicate suppression.
- [ ] 4.3 Invalid, non-owner, unsupported, and thin-context cases consume no admission quota and start no provider work.
- [ ] 4.4 Provider failure/timeout consumes its admitted slot, releases the active lease, and returns a controlled response.
- [ ] 4.5 Local parallel RPC smoke proves exactly one simultaneous diagnosis claim is admitted.
- [ ] 4.6 Concurrent account-deletion tests prove exactly one Admin API call and safe retry/idempotency behavior.
- [ ] 4.7 Focused admission command passes: `npm.cmd run test:unit -- src/lib/diagnosis/admission.test.ts src/lib/diagnosis/service.test.ts src/pages/api/diagnosis/selected-log.test.ts src/lib/account-deletion/service.test.ts src/pages/api/account/delete.test.ts`.

#### Manual

- [ ] 4.8 Review database admission functions and confirm they store no raw question, grow-log text, provider output, or secret.
- [ ] 4.9 Confirm the public 429 and concurrent account-deletion outcomes reveal no internal policy or target details.

### Phase 5: Run Gates And Ship Cookbook Patterns

#### Automated

- [ ] 5.1 Full unit/integration suite passes: `npm.cmd run test:unit`.
- [ ] 5.2 Lint passes: `npm.cmd run lint`.
- [ ] 5.3 Production build passes: `npm.cmd run build`.
- [ ] 5.4 Search confirms the Phase 2 cookbook names persisted-state/RLS and fail-before-cost patterns without claiming static SQL or query mocks are proof.
- [ ] 5.5 `context/foundation/test-plan.md` §6 contains the shipped Phase 2 patterns and dated guidance.

#### Manual

- [ ] 5.6 On an explicitly reset local Supabase stack, `npm.cmd run test:rls` passes with two JWT principals, survivor assertions, admission concurrency, and cleanup.
- [ ] 5.7 Confirm the Phase 2 plan contains no create-two/bulk-delete-one/reload browser gate and §6 keeps that scenario in Phase 3.
- [ ] 5.8 Confirm no `.dev.vars` file was read or modified during implementation or verification.
