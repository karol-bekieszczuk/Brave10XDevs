---
change_id: staged-grow-log-crud
title: Staged grow-log CRUD
status: impl_reviewed
created: 2026-05-29
updated: 2026-05-31
archived_at: null
---

## Notes

Build roadmap slice S-01 from `context/foundation/roadmap.md`: the owner user can create, view, edit, and delete their own text grow logs with an explicit `agar` or `grain` stage.

Use the completed `grow-log-data-contract` foundation as the starting contract. The database table is `public.grow_logs`; it is owner-scoped through RLS, uses hard delete semantics, and exposes the minimum staged text-log shape through `src/lib/grow-logs/types.ts`.

Planning should keep this slice user-visible but narrow:
- In scope: CRUD runtime around the existing grow-log contract, owner-only access, stage validation, and dashboard/navigation surface needed to manage logs.
- Out of scope: selected-log diagnosis, AI provider work, saved chat history, photo/image handling, species-specific fields, sharing, export, collaboration, and full multi-user account features.

Key risk: selected-log diagnosis depends on this slice, so the CRUD UI/API must create real staged logs that can later be selected by diagnosis without broadening the MVP data model.
