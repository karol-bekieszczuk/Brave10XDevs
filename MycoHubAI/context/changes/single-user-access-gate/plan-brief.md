# Single-User Access Gate - Plan Brief

> Full plan: `context/changes/single-user-access-gate/plan.md`

## What & Why

MycoHubAI will stop exposing public registration and will allow access only to one configured Supabase user ID. The change exists because the starter auth surface currently permits any valid Supabase account to sign in, which conflicts with the stricter single-user MVP access requirement.

## Starting Point

The app has starter Supabase sign-in, signup, confirm-email, sign-out, and a middleware guard that protects only `/dashboard`. Current docs and local Supabase config still describe and enable public signup.

## Desired End State

`/auth/signin` remains the only public auth screen. All non-static app routes require the configured owner Supabase `user.id`; non-owner valid accounts and stale sessions are signed out and redirected with a generic access-denied error. Signup routes and UI are gone, local Supabase signup is disabled, and production setup includes disabling hosted Supabase public signup.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Owner identity | Supabase user ID | Stable and stronger than email for blocking old or unrelated accounts. |
| Rejected login behavior | Sign out and show generic error | Clears unauthorized sessions without revealing which user is allowed. |
| Signup removal | Delete signup page and API route | Fully removes app-level public registration instead of hiding only UI. |
| Route protection | Everything except sign-in and static assets | Matches the requirement that no one else should access the application. |
| Config style | Required `AUTHORIZED_USER_ID` secret/env | Fails clearly when owner access is not configured. |
| Missing config UX | Sign-in shows configuration error | Makes setup failures visible without allowing access. |
| Supabase signup | Code removal plus dashboard disable | Blocks registration at both app and provider layers. |
| Verification | Lint/build plus local and production smoke tests | Covers code, stale sessions, and Cloudflare runtime secret drift. |

## Scope

**In scope:**

- Add required `AUTHORIZED_USER_ID` server secret.
- Enforce owner-user ID in sign-in API and middleware.
- Default-deny app routes except sign-in, sign-in POST, sign-out, and static assets.
- Delete signup and confirm-email routes plus unused signup UI.
- Remove signup links and copy from landing, topbar, and sign-in page.
- Disable local Supabase signup and document hosted Supabase signup disablement.
- Update env examples, Wrangler required secrets, CI build env, README, and deployment runbook.

**Out of scope:**

- Implementing the code during this planning step.
- Multi-user access, roles, invites, admin UI, account management, or allowlist tables.
- New automated test framework.
- GitHub Actions deployment.
- Any product surface outside the single-user MVP.

## Architecture / Approach

Supabase remains the credential provider, while MycoHubAI owns authorization. A server-only helper reads `AUTHORIZED_USER_ID` and checks the Supabase `user.id`; `/api/auth/signin` rejects non-owner accounts immediately, and middleware repeats the same check for existing sessions before allowing any non-public route.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Authorization Gate Contract | Required owner secret plus sign-in and middleware enforcement | Getting the public-route allowlist wrong could block sign-in or leak app routes. |
| 2. Registration Surface Removal | Signup UI/API/routes removed and local signup disabled | Deleting routes must also remove every link and stale README expectation. |
| 3. Configuration, Documentation, And Deployment Verification | Secret/docs/runbook alignment plus production smoke checklist | Cloudflare, CI, and local secret drift can make production deny the owner. |

**Prerequisites:** The owner Supabase account already exists and its `auth.users.id` is known.
**Estimated effort:** About 1-2 focused implementation sessions across 3 phases.

## Open Risks & Assumptions

- The owner account exists before implementation begins; otherwise the user ID cannot be configured.
- Cloudflare Worker runtime secrets and GitHub build secrets must be updated manually.
- Hosted Supabase public signup must be disabled manually in the dashboard.
- Static asset allowlisting needs careful verification so sign-in assets load while app pages remain protected.

## Success Criteria (Summary)

- Only the configured Supabase user ID can access app routes.
- Public registration is gone from UI, routes, API, local Supabase config, and docs.
- Local and production smoke tests prove owner login works, non-owner login is denied, and stale non-owner sessions cannot access the app.
