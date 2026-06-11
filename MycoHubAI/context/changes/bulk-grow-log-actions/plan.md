# Bulk Grow-log Actions Implementation Plan

## Overview

Build roadmap slice S-04: the owner can select multiple grow logs from `/grow-logs` and delete them in one server-first action. This extends the existing staged grow-log CRUD surface without changing the database contract, adding undo/soft delete, or broadening the MVP beyond private agar/grain text logs.

## Current State Analysis

The repository already has private, owner-scoped grow-log CRUD. `/grow-logs` lists the owner's logs as cards, single-log detail pages provide a hard-delete form with browser confirmation, and the repository deletes one row at a time while filtering by both `id` and `owner_id`. What is missing is a bulk selection UI, a bulk-delete POST endpoint, a parser for selected log IDs, and unit coverage for owner-filtered bulk deletion.

## Desired End State

The owner can open `/grow-logs`, select two or more visible logs with checkboxes, submit a single "Delete selected" action, confirm the selected count, and return to `/grow-logs` with user-safe feedback. Empty selections redirect back with a generic error, malformed IDs are ignored before the repository call, and well-formed non-owned IDs are filtered out by the owner-scoped repository contract and Supabase RLS. Deleted rows are physically removed, while unselected rows remain.

### Key Discoveries:

- `context/foundation/roadmap.md:38` defines S-04 as `bulk-grow-log-actions`: the user can select and delete multiple grow logs in one action.
- `context/foundation/roadmap.md:150` leaves the deletion-safety choice open; this plan resolves it as confirmation-only deletion, not undo.
- `context/foundation/prd.md:66` requires create, view, edit, and delete for the user's own text grow logs with an agar/grain stage.
- `context/foundation/prd.md:82` keeps the MVP single-user-first and excludes full multi-user account product work.
- `src/pages/grow-logs/index.astro:9` already loads owner logs through `listOwnerGrowLogs`.
- `src/pages/grow-logs/index.astro:76` renders one `GrowLogCard` per log with no selection state.
- `src/components/grow-logs/GrowLogCard.astro:4` accepts one `GrowLogRow` and currently renders only open/view/edit actions.
- `src/pages/grow-logs/[id].astro:105` uses a plain POST form for single-log deletion.
- `src/pages/grow-logs/[id].astro:108` uses browser confirmation for the existing hard-delete action.
- `src/lib/grow-logs/repository.ts:95` deletes one grow log at a time with both `id` and `owner_id` filters.
- `src/lib/grow-logs/repository.test.ts:193` already tests owner-filtered single-row delete behavior.
- `.github/workflows/ci.yml:20` runs `npm run test:unit` before lint and build.

## What We're NOT Doing

- No database migration, schema change, `deleted_at`, soft delete, recovery queue, or undo flow.
- No export, import, sharing, collaboration, public links, image/photo handling, species fields, tags, search, pagination, or saved diagnosis/chat history.
- No selected-log diagnosis changes, AI provider work, prompt work, or knowledge retrieval changes.
- No full multi-user account product behavior; all grow-log behavior remains owner-scoped.
- No Playwright/E2E infrastructure in this change.
- No feature flag. If implementation later adds one, it must include an explicit kill date per `context/foundation/lessons.md`.

## Implementation Approach

Use the existing server-first Astro pattern. Add a small bulk-delete contract under `src/lib/grow-logs/`, expose one bulk-delete POST route, and update `/grow-logs` so each card can contribute a selected ID to a single form. Keep the interaction progressive: plain checkboxes and a submit button work as the core behavior, while a small inline confirmation/count enhancement is acceptable if needed to show the selected count without introducing a React island.

## Critical Implementation Details

### User Experience Spec

The selected-count confirmation is a progressive enhancement on top of a server-validated form. Client-side code may prevent an obvious empty submission and show `Delete N selected grow logs permanently? This cannot be undone.`, but the POST route still owns empty/malformed input handling because the form can be submitted or tampered with without JavaScript.

### Privacy-Safe ID Handling

Bulk selection comes from rendered owner rows, but request data is still untrusted. The parser should dedupe selected IDs, discard malformed UUID-like values before the repository call, and treat "no valid IDs" as the same generic empty-selection error. The API must not reveal whether a submitted well-formed ID belongs to another user.

## Phase 1: Bulk Delete Contract

### Overview

Add the reusable parsing and repository contract that lets routes delete many owner-scoped grow logs without duplicating query logic.

### Changes Required:

#### 1. Bulk selection validation

**File**: `src/lib/grow-logs/validation.ts`

**Intent**: Give the bulk-delete route one shared way to turn form values into a safe list of selected grow-log IDs.

**Contract**: Export a small validator/parser for repeated selected ID values. It returns a deduped array of UUID-like strings, ignores empty or malformed values, and reports failure when no valid IDs remain. It must not validate ownership or row existence; the repository and RLS own that boundary.

#### 2. Owner-scoped bulk delete repository helper

**File**: `src/lib/grow-logs/repository.ts`

**Intent**: Keep all Supabase delete semantics in the repository layer and preserve the existing owner filter.

**Contract**: Export a helper such as `deleteOwnerGrowLogs(client, ids, ownerId)` that deletes from `grow_logs` using both `owner_id = ownerId` and `id in ids`. It must throw on Supabase errors and must not accept an empty ID array from callers.

#### 3. Unit tests for bulk parsing and deletion

**File**: `src/lib/grow-logs/validation.test.ts`

**File**: `src/lib/grow-logs/repository.test.ts`

**Intent**: Protect the privacy and data-loss boundaries before adding the UI route.

**Contract**: Extend tests to cover deduping selected IDs, rejecting an empty effective selection, ignoring malformed values, and issuing a bulk delete query with both `owner_id` and selected IDs. Update the mock query builder if needed to record Supabase `.in(...)` calls.

### Success Criteria:

#### Automated Verification:

- Bulk selection parser returns unique valid selected IDs.
- Bulk selection parser fails when no valid selected IDs remain.
- Repository bulk delete filters by authenticated owner ID.
- Repository bulk delete filters by selected IDs.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- The new contract does not introduce schema fields, soft delete, undo state, export, sharing, diagnosis, image, or species behavior.
- The bulk-delete helper is a sibling of the existing single-delete helper and does not change existing single-delete behavior.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding progress checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Bulk Delete Route

### Overview

Add the server-first POST endpoint that receives selected IDs, applies the bulk-delete contract, and redirects back to the grow-log list with generic user-safe feedback.

### Changes Required:

#### 1. Bulk delete API route

**File**: `src/pages/api/grow-logs/bulk-delete.ts`

**Intent**: Provide one POST target for deleting multiple selected grow logs from the list page.

**Contract**: Export uppercase `POST`. The handler reads `context.locals.user`, creates the Supabase server client, reads repeated selected ID form fields, validates them through the bulk selection parser, calls `deleteOwnerGrowLogs`, and redirects back to `/grow-logs`. Missing auth or client redirects to sign-in with a generic error. Empty or invalid effective selection redirects to `/grow-logs?error=Select at least one grow log`. Repository failures redirect to `/grow-logs?error=Unable to delete selected grow logs`.

#### 2. Redirect feedback contract

**File**: `src/pages/grow-logs/index.astro`

**Intent**: Let the list page display success as well as existing error feedback after bulk delete redirects.

**Contract**: Continue reading `error` from the query string and add a generic success message parameter such as `message`. Do not include grow-log titles, bodies, or submitted IDs in redirect URLs. Success copy should be generic, for example "Selected grow logs deleted."

### Success Criteria:

#### Automated Verification:

- Bulk delete API route exports uppercase `POST`.
- Bulk delete API route rejects empty effective selection before repository deletion.
- Bulk delete API route uses `context.locals.user.id` for owner-scoped deletion.
- Bulk delete API route does not expose selected IDs, titles, or body text in redirect URLs.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- Direct empty POST to the bulk-delete route returns to `/grow-logs` with a generic selection error.
- Tampered malformed ID values do not delete rows and do not reveal row existence.
- The existing single-log delete route still works.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: List Selection UI

### Overview

Update the grow-log list so the owner can select multiple cards and submit one confirmed bulk-delete action.

### Changes Required:

#### 1. Bulk delete form on the list page

**File**: `src/pages/grow-logs/index.astro`

**Intent**: Wrap the non-empty grow-log list in one form that posts selected IDs to the bulk-delete route.

**Contract**: When logs exist, render a form with `method="POST"` and `action="/api/grow-logs/bulk-delete"`. Include a bulk action bar with a delete button. The form must preserve existing links to view/edit individual logs and the existing empty/unavailable states.

#### 2. Selectable grow-log card

**File**: `src/components/grow-logs/GrowLogCard.astro`

**Intent**: Let each card contribute its log ID to the bulk-delete form while keeping the current card content readable.

**Contract**: Add a checkbox named consistently with the route parser, with `value={log.id}` and an accessible label tied to the log title. Keep view/edit/open links available. The checkbox must not change the grow-log data model.

#### 3. Confirmation and empty-selection UX

**File**: `src/pages/grow-logs/index.astro`

**Intent**: Reduce accidental hard deletion while keeping the implementation smaller than a React island.

**Contract**: Use browser confirmation before form submission, including the selected count when JavaScript is available. Prevent an obvious zero-selection submission on the client when possible, but rely on the route for the authoritative empty-selection guard. Do not add undo copy or imply recovery.

#### 4. Feedback messages

**File**: `src/pages/grow-logs/index.astro`

**Intent**: Make redirect outcomes understandable without leaking private row details.

**Contract**: Show existing `error` messages and the new generic success message near the top of the page. Messages should not include selected IDs, titles, body previews, or non-owned/missing-row details.

### Success Criteria:

#### Automated Verification:

- `/grow-logs` builds with the bulk-delete form only when logs exist.
- Each rendered grow-log card includes one checkbox with the selected ID as its value.
- The bulk action posts to `/api/grow-logs/bulk-delete`.
- Existing view/edit/detail links remain present.
- UI copy does not imply undo or recovery.
- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.

#### Manual Verification:

- Owner can select multiple visible logs and trigger one delete action.
- Browser confirmation shows the selected count before deletion.
- Canceling the confirmation does not delete rows.
- Submitting with no selected logs shows a generic error and deletes nothing.
- After confirmed deletion, selected logs disappear from `/grow-logs` and unselected logs remain.
- The page still renders the empty state when all logs are deleted.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Verification and Scope Audit

### Overview

Verify the complete S-04 slice against the repo's privacy, hard-delete, and MVP-scope boundaries.

### Changes Required:

#### 1. Verification evidence

**File**: `context/changes/bulk-grow-log-actions/plan.md`

**Intent**: Keep implementation state mechanically trackable through this plan's canonical Progress section.

**Contract**: During implementation, `/10x-implement` flips only the matching Progress checkboxes and appends the closing commit SHA at phase end. Do not create sidecar state files.

#### 2. Scope audit

**File**: implementation files touched by Phases 1-3

**Intent**: Confirm the bulk action stayed inside S-04 and did not reopen data-contract or diagnosis scope.

**Contract**: Search the diff for forbidden additions: soft-delete fields, undo storage, export/sharing behavior, diagnosis changes, image/photo handling, species fields, public route allowlist changes, or full multi-user account behavior.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`.
- Linting passes: `npm run lint`.
- Build passes: `npm run build`.
- Search confirms no `deleted_at`, undo storage, recovery queue, export, sharing, image/photo upload, species field, saved chat history, or diagnosis runtime change was added for this slice.
- Search confirms no `/grow-logs` or bulk-delete path was added to middleware public routes.

#### Manual Verification:

- Full local smoke test covers selecting two or more logs, canceling confirmation, confirming deletion, empty selection, malformed/tampered selection, and preserving unselected logs.
- Local Supabase data inspection confirms selected rows are physically deleted.
- Missing/non-owned selected IDs do not expose private row contents or ownership details.
- Production smoke testing is explicitly left for after deployment; do not claim production verification before a deploy exists.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- Test bulk selection parsing with multiple valid IDs.
- Test deduping of repeated selected IDs.
- Test empty or malformed-only selections returning validation failure.
- Test repository bulk delete uses both selected IDs and `owner_id`.
- Keep existing single-delete repository tests passing.

### Integration Tests:

- No automated integration or browser test harness is planned for this slice.
- Use local Supabase and the app UI for manual smoke coverage.

### Manual Testing Steps:

1. Start the local app and local Supabase using the existing project workflow.
2. Sign in as the authorized owner.
3. Create at least three disposable grow logs.
4. Open `/grow-logs`.
5. Select two logs and click the bulk delete button.
6. Cancel the browser confirmation and confirm no rows were deleted.
7. Select two logs again, confirm deletion, and verify only those selected logs disappear.
8. Submit the bulk form with no selected logs and confirm the generic error appears.
9. Tamper with the form submission to include a malformed ID and confirm no private details are exposed.
10. Inspect local Supabase and confirm selected rows are physically removed.
11. Confirm the existing single-log delete form still works from a detail page.

## Performance Considerations

The PRD target scale is small, low-QPS, and low data volume. Bulk delete should use one owner-scoped delete query with an ID list rather than looping one request per row. Pagination, virtualized lists, background jobs, and batch progress UI are intentionally out of scope.

## Migration Notes

No database migration is planned. This change consumes the existing `public.grow_logs` schema and hard-delete RLS policy. Because deletion is physical, rollback of application code will not recover deleted rows; manual tests should use disposable local data.

## References

- Roadmap S-04 row: `context/foundation/roadmap.md:38`
- Roadmap S-04 detail: `context/foundation/roadmap.md:142`
- S-04 deletion-safety unknown: `context/foundation/roadmap.md:150`
- PRD grow-log requirement: `context/foundation/prd.md:66`
- PRD single-user boundary: `context/foundation/prd.md:82`
- Current grow-log list page: `src/pages/grow-logs/index.astro:9`
- Current card component: `src/components/grow-logs/GrowLogCard.astro:4`
- Existing single-delete form: `src/pages/grow-logs/[id].astro:105`
- Existing single-delete confirmation: `src/pages/grow-logs/[id].astro:108`
- Existing owner-scoped delete helper: `src/lib/grow-logs/repository.ts:95`
- Existing delete repository test: `src/lib/grow-logs/repository.test.ts:193`
- Unit test command: `package.json:12`
- CI verification order: `.github/workflows/ci.yml:20`
- Progress format: `.agents/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bulk Delete Contract

#### Automated

- [x] 1.1 Bulk selection parser returns unique valid selected IDs.
- [x] 1.2 Bulk selection parser fails when no valid selected IDs remain.
- [x] 1.3 Repository bulk delete filters by authenticated owner ID.
- [x] 1.4 Repository bulk delete filters by selected IDs.
- [x] 1.5 Unit tests pass: `npm run test:unit`.
- [x] 1.6 Linting passes: `npm run lint`.
- [x] 1.7 Build passes: `npm run build`.

#### Manual

- [x] 1.8 The new contract does not introduce schema fields, soft delete, undo state, export, sharing, diagnosis, image, or species behavior.
- [x] 1.9 The bulk-delete helper is a sibling of the existing single-delete helper and does not change existing single-delete behavior.

### Phase 2: Bulk Delete Route

#### Automated

- [x] 2.1 Bulk delete API route exports uppercase `POST`.
- [x] 2.2 Bulk delete API route rejects empty effective selection before repository deletion.
- [x] 2.3 Bulk delete API route uses `context.locals.user.id` for owner-scoped deletion.
- [x] 2.4 Bulk delete API route does not expose selected IDs, titles, or body text in redirect URLs.
- [x] 2.5 Unit tests pass: `npm run test:unit`.
- [x] 2.6 Linting passes: `npm run lint`.
- [x] 2.7 Build passes: `npm run build`.

#### Manual

- [x] 2.8 Direct empty POST to the bulk-delete route returns to `/grow-logs` with a generic selection error.
- [x] 2.9 Tampered malformed ID values do not delete rows and do not reveal row existence.
- [x] 2.10 The existing single-log delete route still works.

### Phase 3: List Selection UI

#### Automated

- [x] 3.1 `/grow-logs` builds with the bulk-delete form only when logs exist.
- [x] 3.2 Each rendered grow-log card includes one checkbox with the selected ID as its value.
- [x] 3.3 The bulk action posts to `/api/grow-logs/bulk-delete`.
- [x] 3.4 Existing view/edit/detail links remain present.
- [x] 3.5 UI copy does not imply undo or recovery.
- [x] 3.6 Unit tests pass: `npm run test:unit`.
- [x] 3.7 Linting passes: `npm run lint`.
- [x] 3.8 Build passes: `npm run build`.

#### Manual

- [x] 3.9 Owner can select multiple visible logs and trigger one delete action.
- [x] 3.10 Browser confirmation shows the selected count before deletion.
- [x] 3.11 Canceling the confirmation does not delete rows.
- [x] 3.12 Submitting with no selected logs shows a generic error and deletes nothing.
- [x] 3.13 After confirmed deletion, selected logs disappear from `/grow-logs` and unselected logs remain.
- [x] 3.14 The page still renders the empty state when all logs are deleted.

### Phase 4: Verification and Scope Audit

#### Automated

- [x] 4.1 Unit tests pass: `npm run test:unit`.
- [x] 4.2 Linting passes: `npm run lint`.
- [x] 4.3 Build passes: `npm run build`.
- [x] 4.4 Search confirms no `deleted_at`, undo storage, recovery queue, export, sharing, image/photo upload, species field, saved chat history, or diagnosis runtime change was added for this slice.
- [x] 4.5 Search confirms no `/grow-logs` or bulk-delete path was added to middleware public routes.

#### Manual

- [x] 4.6 Full local smoke test covers selecting two or more logs, canceling confirmation, confirming deletion, empty selection, malformed/tampered selection, and preserving unselected logs.
- [x] 4.7 Local Supabase data inspection confirms selected rows are physically deleted.
- [x] 4.8 Missing/non-owned selected IDs do not expose private row contents or ownership details.
- [x] 4.9 Production smoke testing is explicitly left for after deployment; do not claim production verification before a deploy exists.
