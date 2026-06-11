# Delete User Account Implementation Plan

## Overview

Implement account deletion as a lifecycle flow for the single-owner MVP. The owner can request account deletion from the app, the account is disabled immediately with a Supabase Auth soft delete, the owner is signed out and blocked from future product access, and a scheduled Cloudflare Worker purge permanently deletes the Supabase auth user after 30 days so `grow_logs` are removed by the existing foreign-key cascade.

## Current State Analysis

The app is single-user-first and already blocks all non-owner access through `AUTHORIZED_USER_ID`. Grow logs are owner-scoped through both repository filters and database RLS, and the current grow-log schema has `owner_id references auth.users(id) on delete cascade`, which means hard-deleting the auth user can remove grow logs without a separate bulk grow-log delete path. There is no account/settings page, no account-deletion state table, no Supabase admin client, and no Cloudflare scheduled handler yet.

## Desired End State

The owner sees a small account deletion danger action in the authenticated app. Submitting it asks for a browser confirmation that clearly says the account is disabled now and permanently deleted after 30 days. On confirmation, the app records a deletion request, soft-deletes the Supabase auth user through a server-only admin client, signs out the current session, and redirects to `/auth/signin` with a neutral success message. Any still-valid JWT/session is denied by middleware while the deletion request is pending. A Cloudflare Cron Trigger runs a scheduled purge that hard-deletes due auth users after the 30-day retention window; the existing `grow_logs.owner_id` cascade removes retained grow-log rows.

### Key Discoveries:

- Roadmap S-03 is `delete-user-account` and now records the 30-day RODO/GDPR soft-delete retention requirement in its unknowns: `context/foundation/roadmap.md:130`.
- PRD access scope allows starter auth as plumbing but keeps broad account management outside MVP scope: `context/foundation/prd.md:104`.
- `public.grow_logs.owner_id` references `auth.users(id) on delete cascade`, so final auth-user hard delete can remove grow-log rows: `supabase/migrations/20260529191400_create_grow_logs.sql:3`.
- Owner authorization is centralized around `AUTHORIZED_USER_ID` and `isAuthorizedUser`: `src/lib/access-control.ts:16`.
- Middleware already signs out unauthorized sessions and protects all non-public app routes: `src/middleware.ts:12`.
- The current Supabase client is an SSR cookie-bound client using `SUPABASE_URL` and `SUPABASE_KEY`; no admin client exists: `src/lib/supabase.ts:6`.
- Supabase `auth.admin.deleteUser(id, shouldSoftDelete)` requires a server-only service-role/admin key and supports soft delete through `shouldSoftDelete = true`: `node_modules/@supabase/auth-js/src/GoTrueAdminApi.ts:814`.
- Astro supports optional server secret env fields with `envField.string({ context: "server", access: "secret", optional: true })`.
- Cloudflare Cron Triggers use `triggers.crons` in `wrangler.jsonc` and invoke a module Worker `scheduled` handler.
- Astro Cloudflare adapter v13 supports custom Worker entrypoints through `wrangler.jsonc` `main`, using `@astrojs/cloudflare/handler` to preserve normal Astro request handling.

## What We're NOT Doing

- No immediate hard delete on request.
- No user-facing cancellation, self-service recovery, grace-period login, or account reactivation.
- No full account settings product area, profile editing, roles, invitations, admin dashboard, or multi-user account management.
- No email notifications, audit email, or external compliance tooling.
- No export/download of grow logs before deletion.
- No separate bulk grow-log deletion UX; S-04 owns bulk maintenance.
- No diagnosis, image/photo, species-specific, sharing, or saved-chat-history changes.

## Implementation Approach

Use a narrow account-deletion state table plus a server-only account deletion service. The request path writes a deletion request record, soft-deletes the auth user through Supabase Admin, marks the request as disabled with `soft_deleted_at`, signs the current session out, and redirects to sign-in. Middleware and sign-in checks consult only successfully disabled deletion state before allowing access. The scheduled purge uses the same admin boundary to hard-delete due auth users; the existing `grow_logs` foreign key cascade performs final grow-log cleanup.

## Critical Implementation Details

### Admin key boundary

The Supabase admin key is not the existing browser/session key. Add a separate optional server-only env contract such as `SUPABASE_ADMIN_KEY`, use it only in server code, and fail account deletion closed at runtime when it is absent. Keeping it optional in Astro env schema allows CI/build to pass while the UI can show a clear owner-facing "Account deletion is not configured" error.

### Deletion sequencing

The request flow is intentionally not a single database transaction because Supabase Auth Admin deletion is an external admin API call. The account deletion service should make the operation idempotent by upserting a deletion request for the current user, attempting `auth.admin.deleteUser(user.id, true)`, setting `soft_deleted_at` only after that admin call succeeds, and preserving enough error metadata to retry or diagnose failures without creating duplicate requests. A row with `last_error` but no `soft_deleted_at` is a failed request attempt, not a pending disabled account.

### Custom Worker entrypoint

Changing `wrangler.jsonc.main` away from `@astrojs/cloudflare/entrypoints/server` is load-bearing. The custom Worker entrypoint must delegate normal HTTP traffic to the Astro Cloudflare handler and add only the `scheduled` handler for purge work; otherwise the deployed app can stop serving routes.

## Phase 1: Deletion State Foundation

### Overview

Add the database and TypeScript foundation for pending account deletion requests. This phase should not add UI or scheduled purge behavior yet.

### Changes Required:

#### 1. Account deletion request migration

**File**: `supabase/migrations/<timestamp>_create_account_deletion_requests.sql`

**Intent**: Add durable state for requested account deletion and the 30-day purge deadline.

**Contract**: Create `public.account_deletion_requests` with one row per user. Include `user_id uuid primary key references auth.users(id) on delete cascade`, `requested_at timestamptz not null default now()`, `purge_after timestamptz not null`, `soft_deleted_at timestamptz`, `last_attempt_at timestamptz`, `attempt_count integer not null default 0`, and `last_error text`. The insertion contract sets `purge_after` to `requested_at + interval '30 days'`. `soft_deleted_at` is null until Supabase Auth Admin soft delete succeeds. Enable RLS. Authenticated users may select only their own row. Authenticated users do not insert, update, or delete rows directly; server admin code owns mutations.

#### 2. Account deletion types and repository

**File**: `src/lib/account-deletion/types.ts`

**Intent**: Define the app-level account deletion request shape and keep database snake_case mapping out of route handlers.

**Contract**: Export an `AccountDeletionRequest` type with camelCase fields for `userId`, `requestedAt`, `purgeAfter`, `softDeletedAt`, `lastAttemptAt`, `attemptCount`, and `lastError`.

**File**: `src/lib/account-deletion/repository.ts`

**Intent**: Centralize query contracts for checking pending deletion state and listing due purge candidates.

**Contract**: Export functions to get a successfully disabled deletion request by owner user ID using the normal SSR Supabase client, upsert/read/delete/update deletion request state using an admin client, mark a request as soft-deleted after Auth Admin success, and list due requests where `purge_after <= now()` and `soft_deleted_at is not null`. The normal-client check must filter by `user_id` and require `soft_deleted_at is not null`; admin-client mutations must never trust user-supplied IDs without caller authorization.

#### 3. Admin Supabase client

**File**: `src/lib/supabase-admin.ts`

**Intent**: Create a server-only Supabase client for Auth Admin and purge operations.

**Contract**: Export a factory that reads `SUPABASE_URL` plus `SUPABASE_ADMIN_KEY` and returns `null` when either is missing. This module must not be imported by client islands. The admin key must not replace `SUPABASE_KEY` or be passed into `createServerClient`.

#### 4. Runtime env contract

**File**: `astro.config.mjs`

**Intent**: Add the optional server-only admin key schema without turning account deletion setup into a build-time requirement.

**Contract**: Add `SUPABASE_ADMIN_KEY` as `envField.string({ context: "server", access: "secret", optional: true })`.

**File**: `src/lib/runtime-env.ts`

**Intent**: Expose the admin key to server code using the repo's existing Cloudflare-first env lookup pattern.

**Contract**: Export a function such as `getSupabaseAdminKey()` that checks `cloudflareEnv.SUPABASE_ADMIN_KEY` first, then the Astro server env value.

#### 5. Unit tests

**File**: `src/lib/account-deletion/repository.test.ts`

**Intent**: Lock down query shape and mapping for deletion request state without a live database.

**Contract**: Use the existing lightweight mocked Supabase query-builder style from `src/lib/grow-logs/repository.test.ts`. Cover row mapping, owner-scoped pending lookup, upsert shape, due purge filtering, and failure metadata updates.

**File**: `src/lib/supabase-admin.test.ts`

**Intent**: Verify the admin client factory fails closed when config is missing.

**Contract**: Cover missing URL/admin key behavior and successful client construction through mocks or a narrow exported config helper.

### Success Criteria:

#### Automated Verification:

- Migration file exists and defines `public.account_deletion_requests`.
- Migration keeps `user_id` tied to `auth.users(id)` and cascades on final user deletion.
- RLS is enabled and owner select is the only authenticated-user table policy.
- `SUPABASE_ADMIN_KEY` is optional and server-secret only in Astro env schema.
- Repository/admin-client unit tests cover mapping, query shape, due purge lookup, and missing admin-key behavior.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Production build passes: `npm run build`.

#### Manual Verification:

- Inspect the migration and confirm it retains deletion request state until the auth user is hard-deleted.
- Confirm no committed file contains a real Supabase admin key or service-role value.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Request Deletion UX and API

### Overview

Add the owner-facing account deletion action and the POST endpoint that records a deletion request, soft-deletes the auth user, signs the user out, and redirects to sign-in.

### Changes Required:

#### 1. Account deletion service

**File**: `src/lib/account-deletion/service.ts`

**Intent**: Orchestrate the deletion request so route handlers do not directly juggle admin client, database state, and auth soft delete.

**Contract**: Export a request function that accepts the authenticated user ID and necessary clients/dependencies. It must return structured outcomes for success, missing admin configuration, already pending deletion, and unexpected failure. On success it records or reuses the deletion request with a 30-day `purge_after`, calls `supabase.auth.admin.deleteUser(userId, true)`, then marks the request with `soft_deleted_at`. On soft-delete failure, it preserves failure metadata, leaves `soft_deleted_at` null, and returns a failure outcome without pretending the account was deleted.

#### 2. Delete account API route

**File**: `src/pages/api/account/delete.ts`

**Intent**: Provide a server-first POST endpoint for the dashboard danger action.

**Contract**: Export uppercase `POST`. It must require `context.locals.user`, reject missing Supabase SSR/admin clients with a clear redirect, call the deletion service for `context.locals.user.id`, call `supabase.auth.signOut()` after successful soft-delete, and redirect to `/auth/signin?message=Account%20deletion%20requested`. Failure redirects should return to the dashboard with a generic account-deletion error message and no private grow-log text in the URL.

#### 3. Dashboard danger action

**File**: `src/pages/dashboard.astro`

**Intent**: Add the minimal user-visible account deletion entry point without turning the dashboard into a full account settings surface.

**Contract**: Add a compact danger section below the existing dashboard content. It contains one POST form targeting `/api/account/delete`, one destructive button, and a browser `confirm(...)` message that states the account will be disabled now and permanently deleted after 30 days. Keep the existing sign-out flow intact.

#### 4. Service and route tests

**File**: `src/lib/account-deletion/service.test.ts`

**Intent**: Verify deletion request outcomes and the soft-delete call contract.

**Contract**: Cover successful soft delete with `shouldSoftDelete = true`, missing admin configuration, already pending deletion idempotency, and admin API failure.

**File**: `src/pages/api/account/delete.test.ts`

**Intent**: Verify route-level redirects and session cleanup behavior.

**Contract**: Mock dependencies so tests cover unauthenticated redirect, missing config redirect, success redirect to sign-in message, and route calling sign-out only after successful service completion.

### Success Criteria:

#### Automated Verification:

- Account deletion service calls Supabase Admin delete with soft-delete mode enabled.
- API route requires an authenticated owner from `context.locals.user`.
- API route signs out only after successful deletion request and soft delete.
- Dashboard contains a single-confirm account deletion form and does not add broad account-management UI.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Production build passes: `npm run build`.

#### Manual Verification:

- As the owner with `SUPABASE_ADMIN_KEY` configured, click the dashboard delete action, accept the confirmation, and confirm redirect to sign-in with a neutral deletion-requested message.
- As the owner with `SUPABASE_ADMIN_KEY` missing, submit the action and confirm no deletion request is completed and the dashboard shows a clear configuration error.
- Inspect Supabase locally and confirm the account has a pending deletion request with `purge_after` 30 days after `requested_at`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Access Blocking and Sign-In Messaging

### Overview

Block pending-deletion accounts from using the app while the 30-day retention window is active, and let sign-in display neutral messages separately from errors.

### Changes Required:

#### 1. Access-control helper

**File**: `src/lib/access-control.ts`

**Intent**: Name the pending-deletion access outcome so middleware and sign-in route logic stay explicit.

**Contract**: Add a user-facing constant such as `ACCOUNT_DELETION_PENDING_ERROR = "Account deletion is pending"` or a neutral redirect message. Do not change the existing owner-ID authorization contract.

#### 2. Middleware pending-deletion check

**File**: `src/middleware.ts`

**Intent**: Deny product access for users who have requested deletion even if a JWT remains valid until expiry.

**Contract**: After the normal user load and owner authorization check, query successfully disabled deletion state for `context.locals.user.id` by requiring `soft_deleted_at is not null`. If present, call `supabase.auth.signOut()` and redirect to `/auth/signin?message=Account%20deletion%20is%20pending` or equivalent neutral wording. Public route allowlist behavior must remain intact.

#### 3. Sign-in route pending-deletion check

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Prevent a pending-deletion account from re-entering the app if Supabase still accepts credentials during the retention window.

**Contract**: After Supabase sign-in succeeds and owner authorization passes, check successfully disabled deletion state by requiring `soft_deleted_at is not null`. If present, sign out and redirect to `/auth/signin?message=Account%20deletion%20is%20pending`. Keep access-denied behavior for non-owner accounts unchanged.

#### 4. Sign-in page message UI

**File**: `src/pages/auth/signin.astro`

**Intent**: Show neutral account-deletion messages separately from auth errors.

**Contract**: Read `message` from query params and render it as neutral/status copy. Continue rendering `error` through the existing error component. Do not leak internal admin/config failure details.

**File**: `src/components/auth/ServerError.tsx` or a new adjacent component

**Intent**: Reuse the auth UI pattern for non-error status messages.

**Contract**: Either extend the existing auth status rendering safely or add a tiny component for neutral server messages. Keep client-side behavior minimal.

#### 5. Tests

**File**: `src/pages/api/auth/signin.test.ts`

**Intent**: Lock down the pending-deletion sign-in behavior.

**Contract**: Add tests for owner sign-in with no pending deletion, owner sign-in with pending deletion, and non-owner access denial staying unchanged.

**File**: `src/middleware.test.ts`

**Intent**: Verify pending deletion blocks protected routes.

**Contract**: If no middleware test harness exists, add a focused helper-level test around the pending-deletion decision path instead of overbuilding a full Astro middleware integration harness.

### Success Criteria:

#### Automated Verification:

- Middleware blocks pending-deletion users and signs out their session.
- Sign-in POST blocks pending-deletion users after successful credential verification.
- Sign-in page supports neutral `message` rendering and keeps `error` rendering separate.
- Non-owner access denial still behaves as before.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Production build passes: `npm run build`.

#### Manual Verification:

- With a pending deletion request present, visit `/dashboard`, `/grow-logs`, and a grow-log detail URL; confirm redirect to sign-in and no private page render.
- Try signing in again during the pending-deletion window; confirm the app signs out and shows a neutral pending-deletion message.
- Confirm a normal owner account without pending deletion can still sign in and use `/dashboard`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Scheduled Purge

### Overview

Add the Cloudflare Cron Trigger and custom Worker entrypoint that permanently deletes auth users whose 30-day retention window has elapsed.

### Changes Required:

#### 1. Purge service

**File**: `src/lib/account-deletion/purge.ts`

**Intent**: Encapsulate scheduled purge logic so the Worker handler is thin and testable.

**Contract**: Export a function that uses the admin client to list due deletion requests where `soft_deleted_at is not null`, calls `supabase.auth.admin.deleteUser(userId, false)` for each due user, and records `last_attempt_at`, `attempt_count`, and `last_error` when a purge attempt fails. Successful hard delete should remove the auth user; the deletion request and grow logs should disappear through database cascades.

#### 2. Custom Cloudflare Worker entrypoint

**File**: `src/worker.ts`

**Intent**: Preserve Astro HTTP request handling while adding a scheduled purge handler.

**Contract**: Export a standard Cloudflare module Worker object with `fetch` delegating to `handle(request, env, ctx)` from `@astrojs/cloudflare/handler`, and `scheduled` calling the purge service. The scheduled handler should log a compact success/failure summary without logging private grow-log content.

#### 3. Wrangler cron configuration

**File**: `wrangler.jsonc`

**Intent**: Deploy the purge schedule with the Worker.

**Contract**: Change `main` to the custom entrypoint and add `triggers.crons`, such as one daily schedule. Keep existing `assets`, `compatibility_flags`, `observability`, and secrets. Add `SUPABASE_ADMIN_KEY` to required production secrets only if the team wants Cloudflare deploys to fail when purge is not configured; otherwise document it as required for S-03 runtime behavior while leaving the app buildable.

#### 4. Worker and purge tests

**File**: `src/lib/account-deletion/purge.test.ts`

**Intent**: Verify purge behavior without calling live Supabase.

**Contract**: Cover no due requests, successful hard delete, per-user failure recording, and no private content in logged summaries.

**File**: `src/worker.test.ts`

**Intent**: Verify the scheduled handler invokes purge and the fetch path delegates to Astro handler.

**Contract**: Use module mocks if practical. If adapter mocking becomes brittle, keep the test at the purge service boundary and make Worker behavior part of manual verification.

### Success Criteria:

#### Automated Verification:

- Purge service calls Supabase Admin delete with hard-delete mode for due requests.
- Purge service records failure metadata without deleting or hiding failed pending requests.
- Custom Worker entrypoint preserves the Astro fetch handler contract.
- `wrangler.jsonc` includes the cron trigger and custom `main` entrypoint.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Production build passes: `npm run build`.

#### Manual Verification:

- Run a local or staging purge test with a request whose `purge_after` is moved into the past; confirm the auth user is hard-deleted.
- Confirm the related grow-log rows are physically removed through `on delete cascade`.
- Confirm normal HTTP routes still render after switching to the custom Worker entrypoint.
- Confirm Cloudflare Cron Trigger is visible/configured in the deployed Worker settings after deployment.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Config, Documentation, and End-to-End Verification

### Overview

Finish the operational contract: env examples, deployment notes, roadmap alignment if needed, and an explicit manual verification checklist for the irreversible account lifecycle.

### Changes Required:

#### 1. Environment examples

**File**: `.env.example`

**Intent**: Make local setup discoverable without committing secrets.

**Contract**: Add `SUPABASE_ADMIN_KEY=###` with a comment that it is a server-only Supabase service-role or secret key used only for account deletion and purge.

#### 2. Cloudflare and CI docs/config

**File**: `wrangler.jsonc`

**Intent**: Ensure Cloudflare production has the required runtime secret contract for account deletion.

**Contract**: Document or require `SUPABASE_ADMIN_KEY` consistently with the chosen runtime failure behavior from Phase 4. The key must be configured through Cloudflare secrets/dashboard, not committed config.

**File**: `.github/workflows/ci.yml`

**Intent**: Keep validation builds passing with the new optional env contract.

**Contract**: CI does not need a real admin key if `SUPABASE_ADMIN_KEY` stays optional in Astro env schema. If implementation makes it required, CI must receive it from repository secrets.

#### 3. README and deployment notes

**File**: `README.md`

**Intent**: Explain the new account deletion env contract and local verification path.

**Contract**: Add short setup notes for `SUPABASE_ADMIN_KEY`, account deletion request behavior, and the 30-day purge window. Do not include real secret values.

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Keep deployment operations aware of the new Cloudflare secret and cron trigger.

**Contract**: Add a concise S-03 note for configuring `SUPABASE_ADMIN_KEY` in Cloudflare and verifying the Cron Trigger after deploy. Preserve Cloudflare-owned deployment posture.

#### 4. Manual verification checklist

**File**: `context/changes/delete-user-account/manual-verification.md`

**Intent**: Capture the high-risk manual pass in a durable checklist under the change folder.

**Contract**: Include prerequisites, local env setup, happy path, missing admin-key path, pending-deletion access block, sign-in message checks, forced due-purge check, grow-log cascade verification, and explicit non-goals.

#### 5. Change and roadmap status alignment

**File**: `context/changes/delete-user-account/change.md`

**Intent**: Keep change metadata current after planning and later implementation.

**Contract**: This plan sets `status: planned`; implementation should later move it through `implementing` and `implemented` according to repo workflow.

**File**: `context/foundation/roadmap.md`

**Intent**: Keep S-03 wording aligned with the agreed retention semantics if the current roadmap wording is still ambiguous.

**Contract**: If edited during implementation, phrase S-03 as request deletion now, disable access now, permanently purge after 30 days. Do not broaden into full account management.

### Success Criteria:

#### Automated Verification:

- `.env.example` documents `SUPABASE_ADMIN_KEY` without real secrets.
- Deployment docs mention the Cloudflare secret and cron trigger.
- Manual verification checklist exists under `context/changes/delete-user-account/`.
- Change metadata remains consistent with plan state.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Production build passes: `npm run build`.

#### Manual Verification:

- Follow `context/changes/delete-user-account/manual-verification.md` end to end using disposable local data.
- Confirm production setup instructions identify where `SUPABASE_ADMIN_KEY` and the Cron Trigger are configured.
- Confirm no user-facing screen offers cancellation or account reactivation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- Repository mapping and query contracts for `account_deletion_requests`.
- Admin client config behavior, especially missing `SUPABASE_ADMIN_KEY`.
- Account deletion service outcomes: success, missing config, already pending, admin soft-delete failure.
- Account delete API redirects and sign-out sequencing.
- Sign-in and access-control behavior for pending deletion.
- Purge service behavior: no due rows, successful hard delete, failure metadata, idempotency.

### Integration Tests:

- No browser E2E is required for the first implementation pass unless route-level unit tests prove too weak.
- If E2E is later added, cover only the owner happy path and pending-deletion blocked-access path with disposable local Supabase data.

### Manual Testing Steps:

1. Configure local `SUPABASE_URL`, `SUPABASE_KEY`, `AUTHORIZED_USER_ID`, and `SUPABASE_ADMIN_KEY` with disposable local Supabase values.
2. Sign in as the owner and create at least one grow log.
3. Open `/dashboard`, click the account deletion action, and cancel the browser confirm; verify nothing changes.
4. Click it again, accept the confirm, and verify redirect to `/auth/signin` with a neutral deletion-requested message.
5. Inspect `public.account_deletion_requests`; confirm one row exists for the user and `purge_after` is 30 days after `requested_at`.
6. Try visiting `/dashboard`, `/grow-logs`, and the prior grow-log URL with any remaining session; confirm redirect to sign-in and no private content renders.
7. Try signing in again during the pending window; confirm sign-in is blocked and the neutral pending-deletion message appears.
8. Move `purge_after` into the past for the disposable user and run the scheduled purge path.
9. Confirm the auth user is hard-deleted and related grow-log rows are physically removed by cascade.
10. Repeat the delete action without `SUPABASE_ADMIN_KEY`; confirm the app fails closed and does not complete deletion.

## Performance Considerations

The MVP has one owner and small data volume. The scheduled purge can run daily and process a small batch of due deletion requests. Add an index on `purge_after` so the query stays cheap even if the table grows. Avoid per-request admin-client writes; middleware should only perform a narrow pending-deletion lookup after a valid owner session exists.

## Migration Notes

This change adds one database migration and one optional server-only secret. Existing accounts are not pending deletion by default. Existing grow logs remain untouched until an account deletion request is made and the final purge hard-deletes the auth user. Rollback before final purge can remove the UI/API and leave pending request rows for manual handling; rollback after hard deletion cannot restore the deleted auth user or cascaded grow logs.

## References

- Change identity: `context/changes/delete-user-account/change.md`
- Roadmap S-03: `context/foundation/roadmap.md:130`
- PRD access boundary: `context/foundation/prd.md:104`
- Grow-log auth-user cascade: `supabase/migrations/20260529191400_create_grow_logs.sql:3`
- Owner access helper: `src/lib/access-control.ts:16`
- Default-deny middleware: `src/middleware.ts:12`
- Current Supabase SSR client: `src/lib/supabase.ts:6`
- Current grow-log delete route pattern: `src/pages/api/grow-logs/[id]/delete.ts`
- Supabase Auth Admin delete user reference: `node_modules/@supabase/auth-js/src/GoTrueAdminApi.ts:814`
- Supabase Auth docs: `https://github.com/supabase/auth/blob/master/_autodocs/endpoints.md`
- Supabase user deletion/session note: `https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/managing-user-data.mdx`
- Cloudflare Cron Trigger docs: `https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/`
- Astro Cloudflare custom entrypoint docs: `https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/integrations-guide/cloudflare.mdx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Deletion State Foundation

#### Automated

- [x] 1.1 Migration file exists and defines `public.account_deletion_requests`. — 1ba93bc
- [x] 1.2 Migration keeps `user_id` tied to `auth.users(id)` and cascades on final user deletion. — 1ba93bc
- [x] 1.3 RLS is enabled and owner select is the only authenticated-user table policy. — 1ba93bc
- [x] 1.4 `SUPABASE_ADMIN_KEY` is optional and server-secret only in Astro env schema. — 1ba93bc
- [x] 1.5 Repository/admin-client unit tests cover mapping, query shape, due purge lookup, and missing admin-key behavior. — 1ba93bc
- [x] 1.6 Unit tests pass: `npm run test:unit`. — 1ba93bc
- [x] 1.7 Linting passes: `npm run lint`. — 1ba93bc
- [x] 1.8 Production build passes: `npm run build`. — 1ba93bc

#### Manual

- [x] 1.9 Inspect the migration and confirm it retains deletion request state until the auth user is hard-deleted. — 1ba93bc
- [x] 1.10 Confirm no committed file contains a real Supabase admin key or service-role value. — 1ba93bc

### Phase 2: Request Deletion UX and API

#### Automated

- [x] 2.1 Account deletion service calls Supabase Admin delete with soft-delete mode enabled.
- [x] 2.2 API route requires an authenticated owner from `context.locals.user`.
- [x] 2.3 API route signs out only after successful deletion request and soft delete.
- [x] 2.4 Dashboard contains a single-confirm account deletion form and does not add broad account-management UI.
- [x] 2.5 Unit tests pass: `npm run test:unit`.
- [x] 2.6 Linting passes: `npm run lint`.
- [x] 2.7 Production build passes: `npm run build`.

#### Manual

- [x] 2.8 As the owner with `SUPABASE_ADMIN_KEY` configured, click the dashboard delete action, accept the confirmation, and confirm redirect to sign-in with a neutral deletion-requested message.
- [x] 2.9 As the owner with `SUPABASE_ADMIN_KEY` missing, submit the action and confirm no deletion request is completed and the dashboard shows a clear configuration error.
- [x] 2.10 Inspect Supabase locally and confirm the account has a pending deletion request with `purge_after` 30 days after `requested_at`.

### Phase 3: Access Blocking and Sign-In Messaging

#### Automated

- [x] 3.1 Middleware blocks pending-deletion users and signs out their session. - 75623a6
- [x] 3.2 Sign-in POST blocks pending-deletion users after successful credential verification. - 75623a6
- [x] 3.3 Sign-in page supports neutral `message` rendering and keeps `error` rendering separate. - 75623a6
- [x] 3.4 Non-owner access denial still behaves as before. - 75623a6
- [x] 3.5 Unit tests pass: `npm run test:unit`. - 75623a6
- [x] 3.6 Linting passes: `npm run lint`. - 75623a6
- [x] 3.7 Production build passes: `npm run build`. - 75623a6

#### Manual

- [x] 3.8 With a pending deletion request present, visit `/dashboard`, `/grow-logs`, and a grow-log detail URL; confirm redirect to sign-in and no private page render. - 75623a6
- [x] 3.9 Try signing in again during the pending-deletion window; confirm the app signs out and shows a neutral pending-deletion message. - 75623a6
- [x] 3.10 Confirm a normal owner account without pending deletion can still sign in and use `/dashboard`. - 75623a6

### Phase 4: Scheduled Purge

#### Automated

- [x] 4.1 Purge service calls Supabase Admin delete with hard-delete mode for due requests. - d861c53
- [x] 4.2 Purge service records failure metadata without deleting or hiding failed pending requests. - d861c53
- [x] 4.3 Custom Worker entrypoint preserves the Astro fetch handler contract. - d861c53
- [x] 4.4 `wrangler.jsonc` includes the cron trigger and custom `main` entrypoint. - d861c53
- [x] 4.5 Unit tests pass: `npm run test:unit`. - d861c53
- [x] 4.6 Linting passes: `npm run lint`. - d861c53
- [x] 4.7 Production build passes: `npm run build`. - d861c53

#### Manual

- [x] 4.8 Run a local or staging purge test with a request whose `purge_after` is moved into the past; confirm the auth user is hard-deleted. - d861c53
- [x] 4.9 Confirm the related grow-log rows are physically removed through `on delete cascade`. - d861c53
- [x] 4.10 Confirm normal HTTP routes still render after switching to the custom Worker entrypoint. - d861c53
- [x] 4.11 Confirm Cloudflare Cron Trigger is visible/configured in the deployed Worker settings after deployment. - d861c53

### Phase 5: Config, Documentation, and End-to-End Verification

#### Automated

- [x] 5.1 `.env.example` documents `SUPABASE_ADMIN_KEY` without real secrets. - d861c53
- [x] 5.2 Deployment docs mention the Cloudflare secret and cron trigger. - d861c53
- [x] 5.3 Manual verification checklist exists under `context/changes/delete-user-account/`. - d861c53
- [x] 5.4 Change metadata remains consistent with plan state. - d861c53
- [x] 5.5 Unit tests pass: `npm run test:unit`. - d861c53
- [x] 5.6 Linting passes: `npm run lint`. - d861c53
- [x] 5.7 Production build passes: `npm run build`. - d861c53

#### Manual

- [x] 5.8 Follow `context/changes/delete-user-account/manual-verification.md` end to end using disposable local data. - d861c53
- [x] 5.9 Confirm production setup instructions identify where `SUPABASE_ADMIN_KEY` and the Cron Trigger are configured. - d861c53
- [x] 5.10 Confirm no user-facing screen offers cancellation or account reactivation. - d861c53
