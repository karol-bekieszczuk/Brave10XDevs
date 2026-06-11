# Bulk Grow-log Actions - Plan Brief

> Full plan: `context/changes/bulk-grow-log-actions/plan.md`

## What & Why

This change builds S-04: the owner can select and delete multiple grow logs in one action. It reduces repetitive cleanup once real grow-log history accumulates while preserving the existing private, owner-scoped, hard-delete CRUD contract.

## Starting Point

The app already supports single-log CRUD under `/grow-logs/*`, including hard delete from the detail page with browser confirmation. The list page renders owner logs as cards, but there is no selection UI, bulk-delete route, or repository helper for deleting multiple selected IDs.

## Desired End State

On `/grow-logs`, the owner can check multiple visible logs, click a bulk delete action, confirm the selected count, and return to the list with generic success or error feedback. Selected rows are physically deleted, unselected rows remain, and malformed or non-owned IDs do not reveal private details.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| UI shape | Checkbox list mode | It is the smallest change that satisfies selecting multiple existing logs. |
| Delete safety | Confirmation only | It matches the current hard-delete single-log behavior without adding soft-delete or undo state. |
| Invalid selection handling | Generic no-op/error | It keeps ownership and row existence private while avoiding complex partial-result UX. |
| Testing scope | Repository and validation unit tests plus manual UI smoke | It matches the repo's current test depth without adding browser infrastructure for a narrow feature. |
| Runtime style | Server-first Astro form and POST route | It follows the existing grow-log CRUD convention and avoids unnecessary React state. |

## Scope

**In scope:**

- Bulk selected-ID parsing and validation.
- Owner-filtered bulk delete repository helper.
- One bulk-delete POST route.
- Checkbox selection and a bulk action bar on `/grow-logs`.
- Browser confirmation with selected count.
- Generic success/error feedback.
- Unit tests for parsing and repository delete behavior.
- Manual local smoke verification.

**Out of scope:**

- Database migration, soft delete, undo, recovery, or `deleted_at`.
- Export, sharing, image/photo handling, species fields, tags, pagination, or search.
- Diagnosis runtime, AI provider, prompt, knowledge, or saved-chat changes.
- Full multi-user account product behavior.
- Playwright/E2E test infrastructure.

## Architecture / Approach

Keep the existing server-first flow: `/grow-logs` renders a POST form around selectable cards, the new route parses selected IDs and calls a repository helper, and the repository performs one owner-scoped delete query. Supabase RLS remains a second privacy boundary, and the UI uses only progressive client-side enhancement for selected-count confirmation.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Bulk Delete Contract | Parser, repository helper, and unit tests | Malformed or empty IDs must not create unsafe delete calls. |
| 2. Bulk Delete Route | POST endpoint and redirect feedback | Failure handling must not leak submitted IDs or row ownership. |
| 3. List Selection UI | Checkbox selection and confirmed bulk action | Hard-delete UX must be clear without implying undo. |
| 4. Verification and Scope Audit | Automated checks and manual smoke | Scope can creep into recovery, export, or diagnosis if not audited. |

**Prerequisites:** Existing S-01 grow-log CRUD, owner sign-in, local Supabase data for manual smoke testing.
**Estimated effort:** ~1-2 implementation sessions across 4 small phases.

## Open Risks & Assumptions

- Browser confirmation is acceptable for this MVP and matches the existing single-delete flow.
- Grow-log volume is small, so one owner-scoped `id in (...)` delete query is enough.
- The selected count in confirmation may need a small inline script, but not a React island.
- Hard delete means accidental deletion is not recoverable after confirmation.

## Success Criteria (Summary)

- Owner can select and delete multiple grow logs from `/grow-logs` in one action.
- Empty, malformed, or non-owned submitted IDs do not leak private row details.
- Existing single-log CRUD still works and the feature adds no schema, undo, sharing, export, image, species, or diagnosis scope.
