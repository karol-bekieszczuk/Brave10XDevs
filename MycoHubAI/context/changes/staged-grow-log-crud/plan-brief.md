# Staged Grow-log CRUD — Plan Brief

> Full plan: `context/changes/staged-grow-log-crud/plan.md`

## What & Why

This change builds S-01: private CRUD for staged text grow logs. It turns the completed grow-log data contract into a user-visible workflow and creates the single-log surface that later selected-log diagnosis can depend on.

## Starting Point

The database and TypeScript contract already exist from `grow-log-data-contract`: `public.grow_logs` stores owner-scoped `agar` or `grain` text logs with hard delete semantics and RLS. The app has owner-only auth and a protected dashboard placeholder, but no grow-log repository, CRUD routes, forms, or UI.

## Desired End State

The owner can manage logs through dedicated `/grow-logs/*` routes: list, create, detail, edit, and delete. Writes use server-first forms and API redirects, validation is shared and tested, and the UI remains limited to private agar/grain text logs.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| UX surface | Dedicated `/grow-logs/*` routes | Keeps dashboard as entry point while giving CRUD a clean route structure. |
| Form model | Server-first forms plus `APIRoute` redirects | Matches existing auth route patterns and avoids client-side CRUD state complexity. |
| Create flow | `/grow-logs/new` | Fits the dedicated route model and keeps list rendering clean. |
| Detail flow | `/grow-logs/[id]` | Creates the future selected-log anchor for diagnosis. |
| Edit flow | `/grow-logs/[id]/edit` | Keeps edit validation and navigation simple. |
| Delete semantics | Hard delete with confirmation | Preserves the F-02 hard-delete contract while reducing accidental loss. |
| Validation | Shared server validation | Prevents create/update drift and keeps DB errors from becoming the primary UX. |
| Testing depth | Add unit tests for validation/repository mapping | Gives coverage for the fragile boundary without adding E2E infrastructure. |

## Scope

**In scope:**

- Grow-log validation and repository functions.
- Unit test harness and tests for validation/mapping.
- Dedicated list, create, detail, and edit pages under `/grow-logs/*`.
- Create, update, and delete POST API routes.
- Dashboard link into grow-log management.
- Manual local Supabase/UI smoke checks.

**Out of scope:**

- Selected-log diagnosis, AI provider work, prompts, saved chat history, or diagnosis UI.
- New schema migration, soft delete, recovery, export, sharing, species fields, photos, or image analysis.
- Full multi-user account product surface, public links, collaboration, or invitations.
- E2E/browser test infrastructure.

## Architecture / Approach

Use a narrow server-first vertical slice. `src/lib/grow-logs/` owns validation, mapping, and Supabase repository calls; Astro pages under `/grow-logs/*` render mostly static UI; API routes under `/api/grow-logs/*` process HTML form POSTs, validate input, call the repository, and redirect. Existing middleware keeps every grow-log route owner-protected.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data Access, Validation, and Unit Test Harness | Repository, validation, mapping, and unit tests | Adding test tooling can grow beyond the MVP if not kept minimal. |
| 2. Grow-log Routes, Forms, and Dashboard Entry Point | User-visible list/create/detail/edit/delete flow | Route and form handling must not bypass owner filtering or expand the data model. |
| 3. End-to-End Verification and Scope Audit | Final automated checks and local smoke evidence | Manual smoke must not be mistaken for production verification. |

**Prerequisites:** Completed `grow-log-data-contract`, local Supabase available for smoke testing, and owner sign-in configured.
**Estimated effort:** ~2 implementation sessions across 3 phases.

## Open Risks & Assumptions

- The repo does not currently have a test runner, so Phase 1 must introduce one without pulling in browser/E2E scope.
- Query-string form errors match the current auth pattern but are less polished than re-rendered forms with preserved body text.
- Hard delete means accidental deletion is not recoverable.
- Pagination is intentionally omitted because target data volume is small.

## Success Criteria (Summary)

- Owner can create, view, edit, and hard-delete private `agar` and `grain` text logs through `/grow-logs/*`.
- Server validation and unit tests protect stage/text constraints and row mapping.
- The final slice remains scoped: no diagnosis, images, species fields, sharing, export, soft delete, or multi-user product features.
