<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Delete User Account Implementation Plan

- **Plan**: context/changes/delete-user-account/plan.md
- **Scope**: Phases 1–5 of 5
- **Date**: 2026-08-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Verification Evidence

- `npm run test:unit` — PASS: 26 files, 168 tests.
- `npm run lint` — PASS: 0 errors, 22 warnings outside this feature's changed files.
- `npm run build` — PASS.
- `npm run typecheck` — PASS: 0 errors, 0 warnings, 4 hints. This additional gate is required by `context/foundation/lessons.md`.
- All 50 Progress rows are checked, but Findings F6–F8 show that several checked criteria are not supported by the current checkout or their attributed commit.

## Findings

### F1 — Auth soft-delete can strand an account outside the purge lifecycle

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/lib/account-deletion/service.ts:83
- **Detail**: The service soft-deletes the Auth user before calling the database finalization RPC. If Auth succeeds but finalization fails, `soft_deleted_at` remains null. The user may no longer be able to authenticate and retry, while the scheduled purge selects only rows whose `soft_deleted_at` is non-null (`src/lib/account-deletion/repository.ts:248`). This can retain the disabled Auth request and grow logs indefinitely instead of purging after 30 days.
- **Fix ⭐ Recommended**: Add a service-role reconciliation state machine for expired/unfinalized requests: retry the soft delete, treat an already-deleted Auth user as success, atomically finalize the row, and only then let the due-purge path process it.
  - Strength: Makes the cross-system workflow recoverable after the exact partial-success boundary and preserves the existing claim/lease design.
  - Tradeoff: Requires a migration/repository contract plus worker and failure-injection tests.
  - Confidence: HIGH — the current ordering and `soft_deleted_at is not null` purge filter directly expose the stranded state.
  - Blind spot: Live Supabase behavior for every soft-deleted-user lookup variant was not re-exercised during this review.
- **Decision**: FIXED — Added scheduled reconciliation for unfinalized requests before purge, reusing the existing claim/lease and idempotent request service. Verified with 19 focused tests, 172 full unit tests, lint, build, and typecheck.

### F2 — Pending deletion does not revoke direct database access

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260529191400_create_grow_logs.sql:34
- **Detail**: Middleware and sign-in block a pending-deletion user in Astro, but grow-log RLS still checks only `owner_id = auth.uid()`. A previously issued JWT remains usable until expiry, so a user can call Supabase directly and read or mutate private grow logs after the UI says the account is disabled immediately. The authorization invariant is missing at the data boundary.
- **Fix ⭐ Recommended**: Add a database authorization predicate used by all grow-log policies that denies access when the owner has a deletion row with non-null `soft_deleted_at`, with focused two-principal RLS smoke coverage.
  - Strength: Enforces immediate denial at the system of record for every client, including cached JWTs and direct REST calls.
  - Tradeoff: Changes all grow-log RLS policies and needs real local-Supabase verification to avoid recursion or privilege mistakes.
  - Confidence: HIGH — current policies contain no account-deletion predicate, while the deletion row is already durable.
  - Blind spot: The maximum JWT lifetime and any platform-side soft-delete token behavior were not measured live in this review.
- **Decision**: FIXED — Added database-level pending-deletion predicates to all four grow-log RLS policies and proved SELECT/INSERT/UPDATE/DELETE denial with two real temporary JWT principals, persisted survivor re-reads, an unaffected active owner, and cleanup. Full unit, lint, build, typecheck, and local RLS smoke passed.

### F3 — Purge candidates are unclaimed and already-deleted users are not idempotent

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/account-deletion/purge.ts:46
- **Detail**: Scheduled runs list due rows without an atomic claim, then treat every Auth Admin error as failure. Concurrent or retried runs can process the same user; after one succeeds and the cascade removes the row, another can receive `user_not_found`, attempt to update a missing row, and abort the invocation. This differs from the request service, which treats already-deleted users as success.
- **Fix ⭐ Recommended**: Claim due purge candidates with an expiring lease, treat `user_not_found` as idempotent success, and isolate each candidate so one stale row cannot abort the batch.
  - Strength: Makes scheduled and manual retries safe and matches the established request-claim pattern.
  - Tradeoff: Adds a purge-claim RPC or equivalent database coordination plus concurrency tests.
  - Confidence: HIGH — the current select-then-delete loop has no ownership or stale-result handling.
  - Blind spot: Cloudflare's actual overlap frequency was not measured; manual invocation can still create the race.
- **Decision**: SKIPPED — user chose to defer this finding during triage.

### F4 — Monthly cron violates the 30-day retention promise

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: wrangler.jsonc:18
- **Detail**: `0 3 1 * *` runs on the first day of each month. A request becoming due just after that run can remain for nearly another month, approaching 60 days total, while the plan, UI, README, and roadmap promise permanent deletion after 30 days.
- **Fix**: Change the cron to a daily schedule and update its test fixture to match.
- **Decision**: SKIPPED — user chose to defer this finding during triage.

### F5 — Purge persists raw Admin API error text

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/account-deletion/purge.ts:59
- **Detail**: Purge stores `error.message` in `last_error`, while request finalization persists only the allowlisted `admin_delete_failed` code. Raw provider/admin text can retain operational details and breaks the controlled persisted-error pattern.
- **Fix**: Persist a bounded allowlisted code such as `admin_delete_failed`; keep detailed diagnostics ephemeral and redacted.
- **Decision**: SKIPPED — user chose to defer this finding during triage.

### F6 — Environment example omits the runtime admin-key contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: .env.example:3
- **Detail**: The current example documents `SUPABASE_SERVICE_ROLE_KEY`, but application runtime reads `SUPABASE_ADMIN_KEY`. Progress 5.1 is checked even though the planned variable is absent; commit `1ba93bc` originally deleted the example file.
- **Fix**: Add a placeholder `SUPABASE_ADMIN_KEY` entry with a server-only account-deletion/purge comment, preserving the separate service-role variable used by scripts.
- **Decision**: SKIPPED — user chose to defer this finding during triage.

### F7 — Required manual checklist is absent despite completed criteria

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/delete-user-account/manual-verification.md
- **Detail**: The required checklist does not exist, yet Progress 5.3 says it exists and 5.8 says it was followed end to end. The same implementation commits stamp all manual checks, including deployed Cron verification, without durable evidence in the change folder. For an irreversible lifecycle, this is not sufficient support for completion.
- **Fix ⭐ Recommended**: Create the planned checklist, execute it against disposable local data and the existing authorized deployment surface, record observable results, and refresh only the Progress rows actually confirmed.
  - Strength: Restores auditable evidence for soft delete, blocked access, forced purge, cascade deletion, missing-key behavior, and deployed cron configuration.
  - Tradeoff: Requires disposable principals/data and external deployment verification for the production-only criterion.
  - Confidence: HIGH — the referenced checklist path is absent and cannot have been followed from the current checkout.
  - Blind spot: Some manual checks may have been performed outside the repository, but no durable evidence was found.
- **Decision**: FIXED — Added the required manual-verification checklist at the planned path with prerequisites, local setup, happy path, missing-key, access-block, purge, cascade, production-check, and non-goals sections.

### F8 — Phase 1 policy completion was stamped before the policy existed

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/delete-user-account/plan.md:514
- **Detail**: Progress 1.3 attributes the owner-select policy to `1ba93bc`, but that commit's creation migration only enabled RLS. Later migrations `20260803120000` and `20260803120100` added the policy and grant, so the current effective schema is repaired but the evidence trail is inaccurate.
- **Fix**: Update the Progress evidence to the actual repair commit(s), without rewriting the effective migration history.
- **Decision**: SKIPPED — user chose to defer this finding during triage.

## Triage Summary

- Fixed: F1, F2, F7
- Skipped: F3, F4, F5, F6, F8
- Remaining unresolved findings: 4 warnings, 1 observation

## Scope Notes

- The feature respected the explicit non-goals: no cancellation/reactivation, broad account settings, export, sharing, images, diagnosis expansion, or saved chat history.
- `src/lib/auth-session.ts` and its tests are justified extras that make sign-out resilient after Auth soft deletion.
- The feature commit's ESLint suppression in `scripts/ingest-diagnosis-knowledge.ts` is unrelated but benign; `src/components/auth/ServerStatus.tsx` is unused adjacent dead code. Neither changes the verdict.
