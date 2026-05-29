# Grow Log Data Contract Implementation Plan

## Overview

Define the minimum Supabase-backed grow-log persistence contract for the single-user MVP. This foundation creates the database and TypeScript contract that later `staged-grow-log-crud` and `selected-log-diagnosis` work can rely on, without implementing CRUD routes, UI, AI diagnosis, saved chat history, image handling, or multi-user product features.

## Current State Analysis

MycoHubAI currently has Supabase Auth and a single-authorized-user access gate, but no application data schema. The `supabase/config.toml` file exists and migrations are enabled, but there is no tracked `supabase/migrations/` directory, no generated `Database` type, and no application table access through Supabase yet. Runtime Supabase access is centralized in `src/lib/supabase.ts`, while the owner boundary is enforced through `AUTHORIZED_USER_ID` and Supabase `user.id`.

## Desired End State

The repository contains a reviewed grow-log database migration and a small TypeScript contract module. The database contract supports private owner-scoped text grow logs with an explicit `agar` or `grain` stage, hard deletion, timestamps, and RLS policies that restrict all row access to `owner_id = auth.uid()`. The TypeScript contract exposes the same stage invariant and row/input shapes so the next slice can implement CRUD without rediscovering the schema.

### Key Discoveries:

- `context/foundation/roadmap.md:33` marks `grow-log-data-contract` as F-02 and defines the foundation outcome as minimum staged text-log persistence.
- `context/foundation/prd.md:66` requires create, view, edit, and delete for the user's own text grow logs with a minimal agar/grain stage field.
- `context/foundation/prd.md:82` keeps full multi-user account management out of scope while allowing starter Supabase auth as access plumbing.
- `context/changes/grow-log-data-contract/change.md:12` already constrains the change to private authorized-user text logs with explicit agar/grain stage.
- `supabase/config.toml:53` enables migrations, but `supabase/config.toml:58` has no schema paths and there are no tracked migrations yet.
- `src/lib/supabase.ts:11` centralizes Supabase server client creation with request cookies.
- `src/lib/access-control.ts:16` defines authorization by matching the Supabase user ID against the configured owner ID.

## What We're NOT Doing

- Building grow-log CRUD API routes, server actions, repositories, pages, or React islands.
- Implementing selected-log diagnosis, AI provider integration, prompts, rubric execution, or saved chat history.
- Adding species-specific advice, photo storage, image analysis, local export, social features, sharing, collaboration, or multi-user account management.
- Creating `docs/reference/contract-surfaces.md` in this change.
- Adding soft delete, archival behavior, or recovery UI; delete semantics for this contract are hard delete.
- Adding extra owner allowlist tables, role tables, invitation flows, or admin UI.

## Implementation Approach

Use a narrow database-first contract. Add one Supabase migration for the `public.grow_logs` table, enforce the stage invariant in the database with a check constraint, and enable RLS so row access is owner-scoped even if a future API query is too broad. Then add a small TypeScript contract module that mirrors the database stage values and names the row/input shapes. Keep runtime CRUD out of this foundation so S-01 remains the first user-visible grow-log slice.

## Critical Implementation Details

### Security Model

The app-level owner gate stays in `AUTHORIZED_USER_ID`, but the data contract should still use `owner_id = auth.uid()` and RLS. This preserves privacy at the database boundary while avoiding any new user-management product surface.

### Delete Semantics

This plan intentionally uses hard delete and does not add `deleted_at`. Future CRUD work must not assume recoverability or hide deleted rows with a soft-delete filter.

## Phase 1: Database Contract

### Overview

Create the Supabase migration that defines the `grow_logs` table, stage constraint, timestamps, ownership, and RLS policies.

### Changes Required:

#### 1. Grow-log migration directory

**File**: `supabase/migrations/<timestamp>_create_grow_logs.sql`

**Intent**: Introduce the first application data migration for the MVP grow-log contract.

**Contract**: The migration lives under `supabase/migrations/` and can be applied by Supabase CLI. It creates only the grow-log persistence surface; it does not seed sample data or change auth settings.

#### 2. `grow_logs` table

**File**: `supabase/migrations/<timestamp>_create_grow_logs.sql`

**Intent**: Persist the minimum staged text-log shape required by FR-001 and future selected-log diagnosis.

**Contract**: Create `public.grow_logs` with `id uuid primary key`, `owner_id uuid not null references auth.users(id) on delete cascade`, `stage text not null`, `title text not null`, `body text not null`, `created_at timestamptz not null default now()`, and `updated_at timestamptz not null default now()`. There is no `deleted_at` column.

#### 3. Stage and text constraints

**File**: `supabase/migrations/<timestamp>_create_grow_logs.sql`

**Intent**: Keep the persisted stage and text fields inside the PRD's agar/grain text-only MVP boundary.

**Contract**: Add a database check that limits `stage` to `agar` or `grain`. Add basic non-empty text checks for `title` and `body` so the database does not accept blank grow-log records. Do not add diagnosis-specific fields such as `symptoms`, `actions_taken`, species, photos, or problem categories.

#### 4. Timestamp maintenance

**File**: `supabase/migrations/<timestamp>_create_grow_logs.sql`

**Intent**: Keep `updated_at` reliable for later list/edit workflows without requiring every future query to remember timestamp maintenance manually.

**Contract**: Add a small trigger function and trigger that updates `updated_at` on row update for `public.grow_logs`. Keep the trigger local to this table or clearly named if implemented as a reusable helper.

#### 5. RLS policies

**File**: `supabase/migrations/<timestamp>_create_grow_logs.sql`

**Intent**: Enforce private owner-scoped grow-log access in Supabase, not only in application code.

**Contract**: Enable RLS on `public.grow_logs`. Add policies for authenticated users so `select`, `insert`, `update`, and `delete` are allowed only when `owner_id = auth.uid()`. Inserts must check that the new row owner is the authenticated user.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` and contains the `public.grow_logs` table definition.
- Stage constraint allows only `agar` and `grain`.
- RLS is enabled on `public.grow_logs`.
- Policies cover owner-scoped `select`, `insert`, `update`, and `delete`.
- No `deleted_at` column or diagnosis-specific fields are present in the migration.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- In local Supabase, the migration applies cleanly with the project-pinned Supabase CLI.
- As the owner user, selecting, inserting, updating, and deleting own grow logs works in SQL/API checks.
- As another authenticated user, selecting, updating, or deleting the owner's rows is denied by RLS.
- Insert attempts with `owner_id` different from `auth.uid()` are denied by RLS.
- Insert attempts with an unsupported stage are rejected by the database.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding progress checkboxes for these items live in the `## Progress` section at the bottom of the plan.

**Local Supabase Note**: `supabase/config.toml` enables seed loading from `./seed.sql`. If the local CLI reset/apply workflow requires that file, create an empty `supabase/seed.sql` as local CLI hygiene in this phase, or use a migration-only command that does not require seeding.

---

## Phase 2: Application Type Contract

### Overview

Add the small TypeScript surface that future grow-log CRUD code can import without introducing CRUD runtime behavior in this foundation.

### Changes Required:

#### 1. Grow-log contract module

**File**: `src/lib/grow-logs/types.ts`

**Intent**: Provide the application-level contract for grow-log stages, rows, and input shapes that match the database migration.

**Contract**: Export `GROW_LOG_STAGES`, `GrowLogStage`, `GrowLogRow`, `CreateGrowLogInput`, and `UpdateGrowLogInput` or equivalent names. `GrowLogStage` is the union `'agar' | 'grain'`. Row fields mirror the migration: `id`, `ownerId`, `stage`, `title`, `body`, `createdAt`, and `updatedAt`. Input types must not introduce diagnosis-specific fields.

`GrowLogRow` is the app/domain shape and intentionally uses camelCase field names. The database contract remains PostgreSQL-style snake_case; future Supabase CRUD work must map database rows such as `owner_id`, `created_at`, and `updated_at` into this app contract at the repository/API boundary.

#### 2. Stage guard

**File**: `src/lib/grow-logs/types.ts`

**Intent**: Give future API/UI code one shared way to check whether user input is a supported grow-log stage.

**Contract**: Export a small predicate such as `isGrowLogStage(value: unknown): value is GrowLogStage` backed by `GROW_LOG_STAGES`. The guard accepts only `agar` and `grain`.

#### 3. Directory boundary

**File**: `src/lib/grow-logs/types.ts`

**Intent**: Establish a grow-log domain folder without starting CRUD implementation early.

**Contract**: The `src/lib/grow-logs/` folder contains contract-only code in this phase. Do not add repository functions, API routes, database queries, React components, or Astro pages.

### Success Criteria:

#### Automated Verification:

- Grow-log type module exports the supported stages and row/input types.
- `GrowLogStage` resolves to only `agar` or `grain`.
- Type contract does not include `deletedAt`, species, image, diagnosis, or saved-chat fields.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- A future implementer can identify the exact stage values and row shape from `src/lib/grow-logs/types.ts`.
- The type contract matches the migration fields and hard-delete decision.
- No CRUD runtime behavior was added accidentally.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No dedicated unit test is required for the migration-only database contract unless the implementation adds non-trivial TypeScript logic beyond the stage guard.
- If the stage guard is added, cover or manually validate that it accepts `agar` and `grain` and rejects unsupported values.

### Integration Tests:

- Use local Supabase migration application as the primary integration check.
- Verify RLS behavior with an owner user and a non-owner authenticated user before treating the data contract as complete.

### Manual Testing Steps:

1. Start or reset local Supabase in the standard repo workflow.
2. Apply the new migration.
3. Create or identify two authenticated users in local Supabase.
4. Insert a grow log as the owner with `stage = 'agar'`; confirm it succeeds.
5. Insert a grow log with an unsupported stage; confirm the database rejects it.
6. Attempt to read, update, and delete the owner's row as a different authenticated user; confirm RLS denies it.
7. Delete the owner's row as the owner; confirm the row is physically removed and no soft-delete column exists.
8. Run `npm run lint` and `npm run build`.

## Performance Considerations

The MVP data volume is small and low-QPS. The migration should still add an index on `owner_id` and a practical ordering index such as `(owner_id, updated_at desc)` or `(owner_id, created_at desc)` so later list queries do not require a table scan. Avoid full-text search, vector columns, caching, or analytics tables in this foundation.

## Migration Notes

This is the first application data migration in the repo. Local and production Supabase migration application should be handled deliberately; Cloudflare Worker rollback does not roll back Supabase schema changes. Because this change uses hard delete, no backfill, recovery migration, or soft-delete cleanup is needed.

## References

- Roadmap F-02: `context/foundation/roadmap.md:33`
- PRD grow-log requirement: `context/foundation/prd.md:66`
- PRD access boundary: `context/foundation/prd.md:82`
- Change identity: `context/changes/grow-log-data-contract/change.md:12`
- Supabase migration config: `supabase/config.toml:53`
- Supabase client helper: `src/lib/supabase.ts:11`
- Owner access helper: `src/lib/access-control.ts:16`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Contract

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` and contains the `public.grow_logs` table definition.
- [x] 1.2 Stage constraint allows only `agar` and `grain`.
- [x] 1.3 RLS is enabled on `public.grow_logs`.
- [x] 1.4 Policies cover owner-scoped `select`, `insert`, `update`, and `delete`.
- [x] 1.5 No `deleted_at` column or diagnosis-specific fields are present in the migration.
- [x] 1.6 Linting passes: `npm run lint`.
- [x] 1.7 Build passes: `npm run build`.

#### Manual

- [x] 1.8 In local Supabase, the migration applies cleanly with the project-pinned Supabase CLI. — c5d393e
- [x] 1.9 As the owner user, selecting, inserting, updating, and deleting own grow logs works in SQL/API checks. — c5d393e
- [x] 1.10 As another authenticated user, selecting, updating, or deleting the owner's rows is denied by RLS. — c5d393e
- [x] 1.11 Insert attempts with `owner_id` different from `auth.uid()` are denied by RLS. — c5d393e
- [x] 1.12 Insert attempts with an unsupported stage are rejected by the database. — c5d393e

### Phase 2: Application Type Contract

#### Automated

- [x] 2.1 Grow-log type module exports the supported stages and row/input types. — c5d393e
- [x] 2.2 `GrowLogStage` resolves to only `agar` or `grain`. — c5d393e
- [x] 2.3 Type contract does not include `deletedAt`, species, image, diagnosis, or saved-chat fields. — c5d393e
- [x] 2.4 Linting passes: `npm run lint`. — c5d393e
- [x] 2.5 Build passes: `npm run build`. — c5d393e

#### Manual

- [x] 2.6 A future implementer can identify the exact stage values and row shape from `src/lib/grow-logs/types.ts`. — c5d393e
- [x] 2.7 The type contract matches the migration fields and hard-delete decision. — c5d393e
- [x] 2.8 No CRUD runtime behavior was added accidentally. — c5d393e
