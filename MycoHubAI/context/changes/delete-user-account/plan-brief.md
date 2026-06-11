# Delete User Account - Plan Brief

> Full plan: `context/changes/delete-user-account/plan.md`

## What & Why

Build S-03 as a compliant account deletion lifecycle, not an instant hard-delete button. The owner can request deletion, the account is disabled immediately, data is retained during the 30-day RODO/GDPR window, and a scheduled purge permanently removes the Supabase auth user and cascaded grow-log data after retention expires.

## Starting Point

The app already has single-owner access control, server-first auth routes, owner-scoped grow logs, and hard-delete semantics for individual grow logs. It does not yet have an account deletion state table, admin Supabase client, account danger UI, pending-deletion access block, or scheduled purge handler.

## Desired End State

The dashboard exposes one account deletion action with a browser confirmation that names the 30-day timing. A successful request signs the owner out, redirects to sign-in with a neutral message, and blocks all future app access. Cloudflare Cron later hard-deletes due users, and `grow_logs.owner_id` cascade removes retained grow-log rows.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Deletion semantics | Soft-delete now, hard-delete after 30 days | Matches the RODO/GDPR retention requirement while preserving eventual permanent deletion. |
| Confirmation UX | Single browser confirm | Keeps the MVP low-friction and consistent with current server-first destructive actions. |
| Post-delete destination | Sign-in page with neutral message | Reuses the current public auth surface without adding a goodbye page. |
| Purge mechanism | Cloudflare scheduled purge | Makes the 30-day hard delete automatic rather than checklist-driven. |
| Data during retention | Retained but inaccessible | Preserves data during retention while preventing normal product use after deletion request. |
| Cancellation | No cancellation | Avoids expanding into account recovery or broader account management. |
| Confirmation copy | Explicit disabled-now and deleted-after-30-days wording | Prevents the user from misunderstanding the delayed deletion lifecycle. |

## Scope

**In scope:**

- Account deletion request table with 30-day `purge_after`.
- Server-only Supabase admin client using a separate optional `SUPABASE_ADMIN_KEY`.
- Dashboard danger action and POST route for deletion requests.
- Supabase Auth soft delete on request.
- Middleware/sign-in block for pending deletion.
- Neutral sign-in messages.
- Cloudflare Cron scheduled purge for due hard deletes.
- Docs, env examples, and manual verification checklist.

**Out of scope:**

- Immediate hard delete.
- Self-service cancellation, account restore, or grace-period login.
- Full account settings, profile editing, roles, invites, or admin UI.
- Email notifications, export/download, sharing, diagnosis changes, image support, or bulk grow-log actions.

## Architecture / Approach

The app stores deletion lifecycle state in `public.account_deletion_requests`. The request route uses a server-only admin client to record the request and call Supabase Auth Admin soft delete, then signs out the SSR session. Middleware and sign-in consult the pending request state before allowing access. A custom Cloudflare Worker entrypoint keeps Astro `fetch` handling and adds a `scheduled` handler that hard-deletes due auth users; the database cascade removes grow logs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Deletion State Foundation | Migration, types, repository, admin client, env contract | Admin key must stay server-only and optional for runtime fail-closed behavior. |
| 2. Request Deletion UX and API | Dashboard action, POST route, soft-delete service | Partial failure between request state and Auth Admin call. |
| 3. Access Blocking and Sign-In Messaging | Pending-deletion users cannot access app; neutral messages render | JWTs may remain valid until expiry unless middleware blocks them. |
| 4. Scheduled Purge | Cloudflare cron and hard-delete purge service | Custom Worker entrypoint must not break Astro HTTP routes. |
| 5. Config, Documentation, and Verification | Env/deploy docs and manual checklist | Production setup must include admin secret and Cron Trigger verification. |

**Prerequisites:** F-01 single-user access gate and S-01 staged grow-log CRUD are already in place. Local/staging verification needs disposable Supabase users and `SUPABASE_ADMIN_KEY`.

**Estimated effort:** About 3-5 focused sessions across 5 phases because the code is moderate but the deletion lifecycle and deployment verification are high-risk.

## Open Risks & Assumptions

- The exact Supabase hosted behavior for soft-deleted users should be verified manually with a disposable account.
- Cloudflare Cron Trigger deployment must be checked in the deployed Worker, not inferred only from `wrangler.jsonc`.
- The plan assumes retained grow logs count as account data during the 30-day window and must be inaccessible, not immediately deleted.
- Final hard deletion is irreversible; rollback cannot restore a hard-deleted auth user or cascaded grow logs.

## Success Criteria (Summary)

- Owner can request deletion, gets signed out, and sees a neutral confirmation on sign-in.
- Pending-deletion accounts cannot access `/dashboard`, `/grow-logs`, or grow-log detail pages during the 30-day retention window.
- Scheduled purge hard-deletes due auth users after 30 days and grow-log rows disappear through database cascade.
