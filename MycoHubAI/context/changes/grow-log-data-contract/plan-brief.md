# Grow Log Data Contract - Plan Brief

> Full plan: `context/changes/grow-log-data-contract/plan.md`

## What & Why

This change defines the minimum Supabase-backed grow-log persistence contract for the MVP. It gives future CRUD and selected-log diagnosis work a stable private text-log shape with an explicit agar/grain stage, without expanding into diagnosis runtime, UI, image handling, sharing, or multi-user product features.

## Starting Point

The app has Supabase Auth, server-side Supabase client creation, and a single-authorized-user access gate. It does not yet have application data migrations, generated database types, grow-log tables, repository functions, API routes, or grow-log UI.

## Desired End State

The repo has one grow-log database migration and one small TypeScript contract module. `public.grow_logs` stores owner-scoped text logs with `stage`, `title`, `body`, timestamps, hard delete semantics, and RLS policies limited to `owner_id = auth.uid()`. TypeScript exposes the same stage invariant and row/input shapes for the next slice.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Field scope | Minimal staging contract with `title` | Supports list/detail UX and diagnosis selection without adding diagnosis-specific fields. |
| Delete behavior | Hard delete | Keeps the MVP contract simple and avoids soft-delete filtering in every future query. |
| Privacy model | `owner_id = auth.uid()` with RLS | Enforces private grow-log access in Supabase, not only in app code. |
| Type source | Manual app types now | Gives S-01 a stable TypeScript contract without adding typegen workflow work to F-02. |
| Stage validation | DB check plus TS union | Keeps the agar/grain invariant enforced in both persistence and application code. |
| Contract docs | Plan and types only | Avoids creating `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md` in this change. |
| Runtime boundary | Contract-only helper | Keeps F-02 as a foundation and leaves CRUD runtime for S-01. |

## Scope

**In scope:**

- Supabase migration for `public.grow_logs`.
- RLS policies for owner-scoped select, insert, update, and delete.
- Database constraint limiting `stage` to `agar` or `grain`.
- Hard delete semantics; no `deleted_at`.
- TypeScript contract module for stages, row shape, and create/update inputs.
- Verification guidance for migration, RLS, lint, and build.

**Out of scope:**

- CRUD API routes, repositories, pages, or React islands.
- Selected-log diagnosis runtime, AI provider work, prompts, or saved chat history.
- `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md`.
- Soft delete or recovery behavior.
- Species-specific advice, photos, image analysis, sharing, collaboration, export, or multi-user account management.

## Architecture / Approach

Use a database-first foundation: one migration creates the table, constraints, timestamp maintenance, indexes, and RLS policies. A small `src/lib/grow-logs/types.ts` module mirrors the database contract for future application code. Runtime CRUD stays out of this change so the next roadmap slice owns user-visible grow-log behavior.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database Contract | `grow_logs` migration with constraints, indexes, timestamps, and RLS | RLS mistakes could weaken privacy or block valid owner access. |
| 2. Application Type Contract | Shared stage/row/input TypeScript contract | Manual types can drift from SQL if not reviewed together. |

**Prerequisites:** Local Supabase CLI workflow must be available for migration/RLS verification.
**Estimated effort:** ~1 implementation session across 2 small phases, plus manual local Supabase checks.

## Open Risks & Assumptions

- Manual TypeScript types must be kept in sync with the migration until the repo adopts generated Supabase types.
- Hard delete means accidental deletion is not recoverable through this contract.
- RLS verification needs at least two local authenticated users or equivalent SQL role simulation.

## Success Criteria (Summary)

- The database accepts only owner-scoped agar/grain text grow logs and rejects unsupported stages or cross-owner access.
- The TypeScript contract clearly exposes the same stage values and row/input shape without diagnosis or image fields.
- The change remains a foundation only: no CRUD runtime, no diagnosis runtime, no registry file, and no product-scope expansion.
