# Staged Grow-log CRUD Implementation Plan

## Overview

Build roadmap slice S-01: the owner user can create, view, edit, and delete their own text grow logs with an explicit `agar` or `grain` stage. This turns the completed grow-log data contract into the first user-visible grow-log workflow and prepares a real selected-log surface for the later diagnosis slice.

## Current State Analysis

The repository already has the F-02 persistence foundation: `public.grow_logs` exists with owner-scoped RLS, hard delete semantics, `stage/title/body` fields, timestamps, and application types for the same staged text-log shape. The app also has Supabase Auth, a default-deny middleware access gate, and a protected dashboard placeholder, but no grow-log repository, routes, CRUD API handlers, form validation, or user-facing grow-log screens.

## Desired End State

The owner can navigate from the dashboard to `/grow-logs`, create a staged text log at `/grow-logs/new`, view a single log at `/grow-logs/[id]`, edit it at `/grow-logs/[id]/edit`, and hard-delete it only after a user-visible confirmation. All CRUD operations use the existing `public.grow_logs` contract, set ownership from the authenticated user, validate `stage/title/body` on the server, and keep the MVP scope limited to private agar/grain text logs.

### Key Discoveries:

- `context/foundation/roadmap.md:35` defines `staged-grow-log-crud` as S-01 and scopes it to create/view/edit/delete for own text grow logs with an agar/grain stage.
- `context/foundation/roadmap.md:102` states S-01 is sequenced before selected-log diagnosis because diagnosis cannot be real until a staged log can be selected.
- `context/foundation/prd.md:66` requires grow-log CRUD with a minimal agar/grain stage field.
- `supabase/migrations/20260529191400_create_grow_logs.sql:1` creates `public.grow_logs` with `owner_id`, `stage`, `title`, `body`, and timestamps.
- `supabase/migrations/20260529191400_create_grow_logs.sql:32` enables RLS and policies use `owner_id = auth.uid()`.
- `src/lib/grow-logs/types.ts:1` exports `GROW_LOG_STAGES`, `GrowLogStage`, row/input types, and `isGrowLogStage`.
- `src/lib/supabase.ts:5` centralizes server-side Supabase client creation and returns `null` when Supabase is not configured.
- `src/middleware.ts:12` leaves only sign-in, auth POSTs, and static assets public; all other routes require the authorized user.
- `src/pages/api/auth/signin.ts:10` shows the current server-first form pattern: `APIRoute`, `request.formData()`, and redirects with query-string errors.
- `src/pages/dashboard.astro:7` is still a protected placeholder and should become the entry point to the grow-log area, not the whole CRUD surface.

## What We're NOT Doing

- No selected-log diagnosis runtime, AI provider integration, prompt work, rubric execution, or saved chat history.
- No schema changes, soft delete, recovery flow, export, import, tags, species fields, problem categories, photo storage, or image analysis.
- No sharing, collaboration, social features, public links, user administration, invitation flows, or full multi-user account product surface.
- No client-side fetch state machine or Astro Actions; this plan uses the existing server-first form and API route convention.
- No feature flag. If implementation later adds one, it must include an explicit kill date per `context/foundation/lessons.md`.

## Implementation Approach

Use a server-first vertical slice. Add a small grow-log repository and validation boundary under `src/lib/grow-logs/`, then wire file-based Astro pages and `APIRoute` POST handlers for list, create, detail, edit, update, and delete. Keep routing explicit under `/grow-logs/*`, use redirects after writes, and rely on both app-side owner filtering and Supabase RLS for privacy. Add unit tests for validation/repository mapping because the user selected stronger test coverage than the current repo baseline.

## Critical Implementation Details

### Testing Baseline

The repo currently has lint/build scripts but no committed test runner. Because this plan calls for unit tests, the first phase must introduce the smallest practical TypeScript test setup and an `npm` script before implementation can claim automated unit coverage.

### Route Protection

Do not add `/grow-logs` to public route allowlists. The middleware already protects every non-public route, so grow-log pages and API endpoints should stay behind the existing default-deny owner gate.

## Phase 1: Data Access, Validation, and Unit Test Harness

### Overview

Create the application boundary for grow-log CRUD: validation, row mapping, repository functions, and unit tests around the non-UI behavior.

### Changes Required:

#### 1. Test runner setup

**File**: `package.json`

**File**: `.github/workflows/ci.yml`

**Intent**: Add a minimal unit-test command so validation and repository mapping can be verified automatically.

**Contract**: Add a script such as `test:unit` and the smallest compatible test dependency needed for TypeScript unit tests. Add `npm run test:unit` to CI after `npm ci` and before lint/build so the new tests protect pull requests and pushes. Do not add E2E/browser infrastructure in this change.

#### 2. Grow-log validation module

**File**: `src/lib/grow-logs/validation.ts`

**Intent**: Centralize server-side validation for `stage`, `title`, and `body` so create and update routes do not drift.

**Contract**: Validate only the F-02 fields: `stage`, `title`, and `body`. Accept only `agar` and `grain` through `isGrowLogStage`, trim `title` and `body`, reject blank strings, and return a typed result that routes can convert into redirect-friendly error messages.

#### 3. Grow-log repository module

**File**: `src/lib/grow-logs/repository.ts`

**Intent**: Isolate Supabase queries and snake_case to camelCase mapping from Astro pages and API routes.

**Contract**: Export functions for listing owner logs, fetching one owner log, creating a log, updating a log, and deleting a log. Inserts must set `owner_id` from the authenticated `user.id`; reads, updates, and deletes must filter by both `id` and `owner_id` even though RLS also enforces ownership. Map database rows into `GrowLogRow`.

#### 4. Grow-log test coverage

**File**: `src/lib/grow-logs/*.test.ts`

**Intent**: Protect the stage validation and database/app mapping decisions from easy regressions.

**Contract**: Cover accepted stages, rejected unsupported stages, blank title/body handling, trimming behavior, and row mapping from `owner_id/created_at/updated_at` into `ownerId/createdAt/updatedAt`. Repository query tests may use a lightweight mocked Supabase query object instead of a live database.

### Success Criteria:

#### Automated Verification:

- Unit test command exists in `package.json` and is documented by the plan as the repository's grow-log unit test entry point.
- CI runs `npm run test:unit` before lint/build.
- Validation accepts only `agar` and `grain` stages and rejects blank `title` or `body`.
- Row mapping preserves `id`, `ownerId`, `stage`, `title`, `body`, `createdAt`, and `updatedAt`.
- Repository contracts set or filter `owner_id` using the authenticated user ID.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- The data-access layer remains limited to the existing F-02 fields and does not introduce diagnosis, image, species, export, sharing, or soft-delete fields.
- The test setup is small and does not add browser/E2E infrastructure.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding progress checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Grow-log Routes, Forms, and Dashboard Entry Point

### Overview

Build the server-first user-visible CRUD surface under `/grow-logs/*` and link it from the protected dashboard.

### Changes Required:

#### 1. Grow-log list page

**File**: `src/pages/grow-logs/index.astro`

**Intent**: Give the owner a dedicated page for reviewing all staged grow logs and starting create/view/edit/delete flows.

**Contract**: Render owner logs from the repository, ordered by recent update or creation. Include links to `/grow-logs/new`, each `/grow-logs/[id]`, and each `/grow-logs/[id]/edit`. Show empty state copy when no logs exist. Do not expose logs from other owners.

#### 2. Grow-log create page

**File**: `src/pages/grow-logs/new.astro`

**Intent**: Provide a dedicated create form for a new text grow log.

**Contract**: Render a server-first form with `stage`, `title`, and `body` fields. The form posts to the create API route. It may read redirect query parameters for short validation errors, matching the existing auth form convention.

#### 3. Grow-log detail page

**File**: `src/pages/grow-logs/[id].astro`

**Intent**: Provide a stable single-log view that can later become the selected-log entry point for diagnosis.

**Contract**: Fetch one owner log by route `id`; show not-found or redirect behavior when the log does not exist for the current owner. Render full `title`, `stage`, `body`, timestamps, an edit link, and a delete form with confirmation.

#### 4. Grow-log edit page

**File**: `src/pages/grow-logs/[id]/edit.astro`

**Intent**: Let the owner edit a single staged text log on its own route.

**Contract**: Fetch one owner log by route `id` and render the same `stage/title/body` fields prefilled. The form posts to the update API route and stays scoped to the existing data contract.

#### 5. Grow-log API routes

**File**: `src/pages/api/grow-logs/create.ts`

**File**: `src/pages/api/grow-logs/[id]/update.ts`

**File**: `src/pages/api/grow-logs/[id]/delete.ts`

**Intent**: Handle writes using the current server-first `APIRoute` form pattern.

**Contract**: Export uppercase `POST` handlers. Each route creates the Supabase server client, checks that a user exists in `context.locals.user`, validates form input through the grow-log validation module, calls the repository, and redirects after success or failure. Create success should redirect to the new detail page. Update success should redirect to the edited detail page. Delete success should redirect to `/grow-logs`.

#### 6. Shared grow-log UI components

**File**: `src/components/grow-logs/GrowLogForm.astro`

**File**: `src/components/grow-logs/GrowLogCard.astro`

**Intent**: Keep the route files readable while preserving Astro-first rendering for mostly static CRUD screens.

**Contract**: Use Astro components for static UI and plain HTML forms. Use existing `Button` where practical. If conditional classes are needed in TS/TSX, use `cn()` from `@/lib/utils`. Do not introduce a React island unless a specific interaction cannot be represented with HTML forms.

#### 7. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the placeholder-only dashboard experience with a clear navigation path into grow-log management while keeping sign-out available.

**Contract**: Add a prominent link or call-to-action to `/grow-logs`. The dashboard should not become the CRUD page because the user chose dedicated `/grow-logs/*` routes.

### Success Criteria:

#### Automated Verification:

- `/grow-logs`, `/grow-logs/new`, `/grow-logs/[id]`, and `/grow-logs/[id]/edit` pages exist and build.
- Create, update, and delete API routes export uppercase `POST` handlers.
- API routes validate `stage`, `title`, and `body` server-side before repository writes.
- API routes set or filter owner access using `context.locals.user.id` and the repository owner contract.
- Delete remains hard delete and does not introduce `deleted_at` or recovery UI.
- No route or UI adds diagnosis, image, species, sharing, export, or multi-user account fields.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- Owner can open `/dashboard` and navigate to `/grow-logs`.
- Owner can create an `agar` grow log and lands on its detail page.
- Owner can create a `grain` grow log and see it in the list.
- Owner can edit a grow log's stage, title, and body from `/grow-logs/[id]/edit`.
- Owner can delete a grow log only after an explicit confirmation and returns to `/grow-logs`.
- Blank title/body and unsupported stage submissions show a user-facing error and do not create or update rows.
- A missing or non-owned log ID does not expose row contents.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: End-to-End Verification and Scope Audit

### Overview

Verify the complete S-01 slice against the repo's privacy and MVP boundaries before marking the change implemented.

### Changes Required:

#### 1. Verification evidence

**File**: `context/changes/staged-grow-log-crud/plan.md`

**Intent**: Keep the implementation state mechanically trackable through the canonical Progress section.

**Contract**: During implementation, `/10x-implement` flips only the matching Progress checkboxes and appends the closing commit SHA at phase end. Do not create sidecar state files.

#### 2. Optional user-facing docs update

**File**: `README.md`

**File**: `.github/workflows/ci.yml`

**Intent**: If the implementation adds a new test script or changes local smoke-test expectations, document the command without expanding product scope.

**Contract**: Update only command or local verification documentation if needed. Ensure CI runs `npm run test:unit` before lint/build if this was not already completed in Phase 1. Do not add marketing or product claims about diagnosis.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`.
- CI includes `npm run test:unit` before lint/build.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.
- Search confirms no forbidden scope fields or surfaces were added for grow logs: no `species`, image/photo upload, sharing, export, saved chat history, or `deleted_at` in the S-01 implementation.
- Search confirms no `/grow-logs` path was added to middleware public routes.

#### Manual Verification:

- Full local smoke test covers list, create, detail, edit, delete, validation failure, and missing/non-owned ID behavior.
- Supabase local data inspection confirms rows are physically deleted after delete.
- The resulting CRUD flow provides a real single-log detail page suitable for later selected-log diagnosis.
- Production smoke testing is explicitly left for after deployment; do not claim production verification before a deploy exists.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- Test validation for accepted `agar` and `grain` stages.
- Test validation rejection for unsupported stages and blank title/body values.
- Test trimming behavior for title/body.
- Test database row to `GrowLogRow` mapping.
- Test repository query intent with a mocked Supabase client where practical, especially `owner_id` assignment/filtering.

### Integration Tests:

- Use local Supabase manually for CRUD smoke testing because the repo does not yet have an integration-test harness.
- Verify that RLS and app owner filtering both protect row access for non-owned IDs.

### Manual Testing Steps:

1. Start local Supabase with the existing project workflow.
2. Run `npm run test:unit`, `npm run lint`, and `npm run build`.
3. Sign in as the authorized owner.
4. Open `/dashboard` and navigate to `/grow-logs`.
5. Create an `agar` grow log with non-empty title/body.
6. Create a `grain` grow log with non-empty title/body.
7. Confirm both logs appear on `/grow-logs`.
8. Open one log detail page and confirm title, stage, body, and timestamps are visible.
9. Edit the log and confirm the detail/list reflect the new values.
10. Submit invalid create/edit values and confirm no row is written.
11. Delete a log after confirmation and confirm it no longer appears.
12. Inspect local Supabase to confirm deleted rows are physically removed.
13. Attempt a missing or non-owned ID path and confirm no row contents are exposed.

## Performance Considerations

The PRD target scale is small, low-QPS, and low data volume. The existing F-02 migration already adds owner-oriented indexes, so this plan should keep list queries simple and avoid pagination, search indexes, caching, full-text search, or virtualized UI. If a future user accumulates enough logs to make list performance noticeable, pagination belongs in a later change.

## Migration Notes

No new database migration is planned. This change must consume the existing `public.grow_logs` schema exactly as defined by F-02. Because delete semantics are hard delete, rollback of application code will not recover deleted rows; manual smoke tests should use disposable local data.

## References

- Roadmap S-01: `context/foundation/roadmap.md:35`
- S-01 detail: `context/foundation/roadmap.md:102`
- PRD grow-log requirement: `context/foundation/prd.md:66`
- PRD non-goals: `context/foundation/prd.md:106`
- Grow-log migration: `supabase/migrations/20260529191400_create_grow_logs.sql:1`
- Grow-log RLS: `supabase/migrations/20260529191400_create_grow_logs.sql:32`
- Grow-log app types: `src/lib/grow-logs/types.ts:1`
- Supabase server client: `src/lib/supabase.ts:5`
- Default-deny middleware: `src/middleware.ts:12`
- Existing API route pattern: `src/pages/api/auth/signin.ts:10`
- Dashboard placeholder: `src/pages/dashboard.astro:7`
- Lesson on feature flags: `context/foundation/lessons.md:5`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Access, Validation, and Unit Test Harness

#### Automated

- [ ] 1.1 Unit test command exists in `package.json` and is documented by the plan as the repository's grow-log unit test entry point.
- [ ] 1.2 CI runs `npm run test:unit` before lint/build.
- [ ] 1.3 Validation accepts only `agar` and `grain` stages and rejects blank `title` or `body`.
- [ ] 1.4 Row mapping preserves `id`, `ownerId`, `stage`, `title`, `body`, `createdAt`, and `updatedAt`.
- [ ] 1.5 Repository contracts set or filter `owner_id` using the authenticated user ID.
- [ ] 1.6 Unit tests pass: `npm run test:unit`.
- [ ] 1.7 Linting passes: `npm run lint`.
- [ ] 1.8 Build passes: `npm run build`.

#### Manual

- [ ] 1.9 The data-access layer remains limited to the existing F-02 fields and does not introduce diagnosis, image, species, export, sharing, or soft-delete fields.
- [ ] 1.10 The test setup is small and does not add browser/E2E infrastructure.

### Phase 2: Grow-log Routes, Forms, and Dashboard Entry Point

#### Automated

- [ ] 2.1 `/grow-logs`, `/grow-logs/new`, `/grow-logs/[id]`, and `/grow-logs/[id]/edit` pages exist and build.
- [ ] 2.2 Create, update, and delete API routes export uppercase `POST` handlers.
- [ ] 2.3 API routes validate `stage`, `title`, and `body` server-side before repository writes.
- [ ] 2.4 API routes set or filter owner access using `context.locals.user.id` and the repository owner contract.
- [ ] 2.5 Delete remains hard delete and does not introduce `deleted_at` or recovery UI.
- [ ] 2.6 No route or UI adds diagnosis, image, species, sharing, export, or multi-user account fields.
- [ ] 2.7 Unit tests pass: `npm run test:unit`.
- [ ] 2.8 Linting passes: `npm run lint`.
- [ ] 2.9 Build passes: `npm run build`.

#### Manual

- [ ] 2.10 Owner can open `/dashboard` and navigate to `/grow-logs`.
- [ ] 2.11 Owner can create an `agar` grow log and lands on its detail page.
- [ ] 2.12 Owner can create a `grain` grow log and see it in the list.
- [ ] 2.13 Owner can edit a grow log's stage, title, and body from `/grow-logs/[id]/edit`.
- [ ] 2.14 Owner can delete a grow log only after an explicit confirmation and returns to `/grow-logs`.
- [ ] 2.15 Blank title/body and unsupported stage submissions show a user-facing error and do not create or update rows.
- [ ] 2.16 A missing or non-owned log ID does not expose row contents.

### Phase 3: End-to-End Verification and Scope Audit

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test:unit`.
- [ ] 3.2 CI includes `npm run test:unit` before lint/build.
- [ ] 3.3 Linting passes: `npm run lint`.
- [ ] 3.4 Build passes: `npm run build`.
- [ ] 3.5 Search confirms no forbidden scope fields or surfaces were added for grow logs: no `species`, image/photo upload, sharing, export, saved chat history, or `deleted_at` in the S-01 implementation.
- [ ] 3.6 Search confirms no `/grow-logs` path was added to middleware public routes.

#### Manual

- [ ] 3.7 Full local smoke test covers list, create, detail, edit, delete, validation failure, and missing/non-owned ID behavior.
- [ ] 3.8 Supabase local data inspection confirms rows are physically deleted after delete.
- [ ] 3.9 The resulting CRUD flow provides a real single-log detail page suitable for later selected-log diagnosis.
- [ ] 3.10 Production smoke testing is explicitly left for after deployment; do not claim production verification before a deploy exists.
