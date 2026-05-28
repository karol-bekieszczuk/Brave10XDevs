# Single-User Access Gate Implementation Plan

## Overview

Implement a hard single-user access gate for MycoHubAI. Public registration will be removed, sign-in will be accepted only for one configured Supabase user ID, and any other Supabase account or stale session will be signed out and denied access.

## Current State Analysis

The app currently uses the starter Supabase auth surface. It exposes public sign-up UI and API routes, lets any valid Supabase account sign in, and only protects `/dashboard` through `src/middleware.ts`. This is weaker than the change requirement, which says no one except the one authorized user should access the application even if Supabase contains other users or old sessions.

## Desired End State

Only the configured Supabase user ID can access the application. `/auth/signin`, the sign-in POST endpoint, sign-out, and static assets remain reachable without an authorized session; every other app route redirects unauthenticated or unauthorized requests to sign-in. Registration routes are removed from the app, local Supabase signup is disabled, and production setup includes a manual dashboard step to disable public signup in hosted Supabase.

### Key Discoveries:

- `src/middleware.ts:4` currently protects only `/dashboard`; the new gate must move from route-specific auth to default-deny app routing.
- `src/pages/api/auth/signin.ts:13` accepts any Supabase-valid email/password today; it must reject non-authorized identities after Supabase authentication.
- `src/pages/api/auth/signup.ts:13` calls `supabase.auth.signUp`; this route must be removed because hiding UI is not enough.
- `src/components/Welcome.astro:48`, `src/components/Topbar.astro:30`, and `src/pages/auth/signin.astro:18` expose signup links that must disappear.
- `supabase/config.toml:169` and `supabase/config.toml:204` currently enable signup in local Supabase config.
- `wrangler.jsonc:18`, `astro.config.mjs:20`, `.env.example:1`, and `.github/workflows/ci.yml:22` define the current secret surface and need the new `AUTHORIZED_USER_ID` contract.
- `context/foundation/infrastructure.md:79` warns about `.env`, `.dev.vars`, Cloudflare Worker secrets, and Astro env schema drifting; the plan must keep the new gate secret aligned across those surfaces.

## What We're NOT Doing

- No implementation in this planning step.
- No new user-management UI, admin screen, invitations, roles, or account settings.
- No app database table for users or allowlists.
- No support for multiple authorized users.
- No social, sharing, collaboration, saved chat history, photo storage, or image analysis.
- No GitHub Actions deployment job; Cloudflare Workers Builds remain the production deploy owner.
- No feature flag for this gate. The change is intended as the production access policy, not a temporary rollout branch.

## Implementation Approach

Use Supabase Auth as the credential provider but make the application authorization boundary explicit in MycoHubAI. Add a required `AUTHORIZED_USER_ID` secret, centralize the check in a small server-only helper, enforce it in both the sign-in API and middleware, then delete the registration surface and update docs/deployment setup. This keeps the app single-user-first without expanding into account management.

## Critical Implementation Details

### State sequencing

The sign-in API must authenticate with Supabase first, inspect the returned user ID, and immediately call `signOut()` before redirecting when the ID does not match `AUTHORIZED_USER_ID`. Middleware must repeat the same authorization check for every request carrying an existing session so old cookies for non-authorized accounts cannot continue to work.

## Phase 1: Authorization Gate Contract

### Overview

Define the owner secret and enforce it at the server boundary for sign-in and stale sessions.

### Changes Required:

#### 1. Environment contract

**File**: `astro.config.mjs`

**Intent**: Add `AUTHORIZED_USER_ID` as a required server secret so builds and runtime fail clearly when the single-owner contract is not configured.

**Contract**: The Astro env schema includes `AUTHORIZED_USER_ID` with `context: "server"` and `access: "secret"`. It should not be exposed to client code.

#### 2. Runtime env resolution

**File**: `src/lib/runtime-env.ts`

**Intent**: Extend the existing Cloudflare-first env lookup to return the authorized owner ID alongside Supabase values.

**Contract**: Export a function or extend the existing runtime-env API so server code can read `AUTHORIZED_USER_ID` from Cloudflare Worker `env` first, falling back to `astro:env/server`.

#### 3. Central authorization helper

**File**: `src/lib/access-control.ts`

**Intent**: Keep the single-user rule in one server-side place so middleware and API routes cannot drift.

**Contract**: Provide helpers that determine whether access config is present and whether a Supabase user matches the configured `AUTHORIZED_USER_ID`. The matching contract is Supabase `user.id` only, not email.

#### 4. Sign-in API owner gate

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Keep credential verification in Supabase but reject any authenticated account whose `user.id` is not the configured owner ID.

**Contract**: On missing `AUTHORIZED_USER_ID`, redirect to `/auth/signin` with a configuration error. On unauthorized user ID, call Supabase `signOut()` and redirect to `/auth/signin?error=Access%20denied` or the encoded equivalent. Authorized users redirect to the app entry route.

#### 5. Middleware default-deny gate

**File**: `src/middleware.ts`

**Intent**: Protect the whole app surface by default while preserving sign-in and static assets for bootstrapping.

**Contract**: Replace the current `PROTECTED_ROUTES`-only behavior with an explicit public allowlist: `/auth/signin`, `POST /api/auth/signin`, `POST /api/auth/signout`, `/_astro/*`, `/favicon.png`, and `/template.png`. Every other app route and API route requires a present user matching `AUTHORIZED_USER_ID`. Unauthorized sessions are signed out before redirecting to `/auth/signin?error=Access%20denied`; unauthenticated sessions redirect to `/auth/signin`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes with `AUTHORIZED_USER_ID`, `SUPABASE_URL`, and `SUPABASE_KEY` configured: `npm run build`

#### Manual Verification:

- `/auth/signin` remains reachable while signed out.
- A valid Supabase account with a non-matching user ID is signed out and shown a generic access-denied error.
- A stale non-owner session cannot reach `/`, `/dashboard`, or any non-asset app route.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Registration Surface Removal

### Overview

Remove public registration from the app code and local Supabase development config.

### Changes Required:

#### 1. Signup routes

**File**: `src/pages/auth/signup.astro`

**Intent**: Delete the public signup page so the app no longer presents account creation as part of the product surface.

**Contract**: The route file is removed. Any links to it must be removed or replaced with sign-in-only copy.

#### 2. Signup API route

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Delete the public registration endpoint so direct POST requests cannot create accounts through MycoHubAI.

**Contract**: The route file is removed. There is no replacement POST endpoint for registration.

#### 3. Confirm-email route

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Delete the registration-success page because the app no longer supports public signup.

**Contract**: The route file is removed and no app flow links to `/auth/confirm-email`.

#### 4. Signup React island

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Remove now-unused registration UI to avoid dead starter code suggesting signup remains supported.

**Contract**: Delete the component once no import references remain.

#### 5. Public UI links and copy

**File**: `src/components/Welcome.astro`

**Intent**: Remove the signup call-to-action and starter auth marketing copy that claims sign-up is available.

**Contract**: The landing experience must not link to `/auth/signup` and should route unauthenticated users toward sign-in only.

**File**: `src/components/Topbar.astro`

**Intent**: Remove the signup link from the signed-out topbar state.

**Contract**: Signed-out users see sign-in only.

**File**: `src/pages/auth/signin.astro`

**Intent**: Remove the "Don't have an account? Sign up" link.

**Contract**: The sign-in page contains no route or copy inviting public registration.

#### 6. Local Supabase signup config

**File**: `supabase/config.toml`

**Intent**: Align local development with production access policy by disabling local auth signup.

**Contract**: Every `enable_signup` setting in `supabase/config.toml` is set to `false`, including `[auth].enable_signup`, `[auth.email].enable_signup`, and `[auth.sms].enable_signup`. Do not leave any local Supabase signup provider surface enabled for this app.

### Success Criteria:

#### Automated Verification:

- No signup route files remain: `src/pages/auth/signup.astro`, `src/pages/api/auth/signup.ts`, and `src/pages/auth/confirm-email.astro` are absent.
- No source link or form action references `/auth/signup` or `/api/auth/signup`: `rg "/auth/signup|/api/auth/signup|confirm-email" src` returns no app references.
- All local Supabase signup switches are disabled: `rg "enable_signup = true" supabase/config.toml` returns no results and `rg "enable_signup = false" supabase/config.toml` confirms the `[auth]`, `[auth.email]`, and `[auth.sms]` entries.
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Navigating to `/auth/signup` no longer shows a registration form.
- Direct POST attempts to `/api/auth/signup` cannot create a user through the app.
- The landing page, topbar, and sign-in page expose sign-in only.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Configuration, Documentation, And Deployment Verification

### Overview

Document the new owner-secret contract, update verification guidance, and include the manual hosted-Supabase and Cloudflare checks required before production smoke testing.

### Changes Required:

#### 1. Local env example

**File**: `.env.example`

**Intent**: Add `AUTHORIZED_USER_ID` next to existing Supabase variables so local `.env` and `.dev.vars` setup is discoverable.

**Contract**: The example file includes `AUTHORIZED_USER_ID=###` without real IDs or secrets.

#### 2. Worker required secret declaration

**File**: `wrangler.jsonc`

**Intent**: Make Cloudflare runtime configuration declare the owner secret as required.

**Contract**: `AUTHORIZED_USER_ID` is added to the existing `secrets.required` array with `SUPABASE_URL` and `SUPABASE_KEY`.

#### 3. CI build env

**File**: `.github/workflows/ci.yml`

**Intent**: Keep validation builds aligned with Astro's required server env schema.

**Contract**: The build step receives `AUTHORIZED_USER_ID` from repository secrets in addition to `SUPABASE_URL` and `SUPABASE_KEY`. CI remains validation-only and does not deploy.

#### 4. README auth documentation

**File**: `README.md`

**Intent**: Replace starter public signup guidance with single-owner access setup and verification instructions.

**Contract**: Auth route documentation lists sign-in and sign-out/protected access only, explains `AUTHORIZED_USER_ID`, removes signup/confirm-email setup guidance, and instructs disabling public signup in the hosted Supabase dashboard.

#### 5. Deployment runbook note

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Keep the live deployment runbook aligned with the new production secret and manual Supabase setting.

**Contract**: Add `AUTHORIZED_USER_ID` wherever required runtime/build secrets are listed and add a manual verification step for disabling hosted Supabase public signup. Do not change deployment ownership from Cloudflare Workers Builds.

### Success Criteria:

#### Automated Verification:

- Secret references are aligned across `.env.example`, `astro.config.mjs`, `wrangler.jsonc`, `.github/workflows/ci.yml`, and README.
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Hosted Supabase dashboard has public signup disabled.
- Cloudflare Worker runtime secrets include `AUTHORIZED_USER_ID`, `SUPABASE_URL`, and `SUPABASE_KEY`.
- GitHub repository secrets include `AUTHORIZED_USER_ID`, `SUPABASE_URL`, and `SUPABASE_KEY` for validation builds.
- After deployment, production smoke test confirms owner login works, non-owner login is denied with generic error, and stale non-owner sessions cannot access app routes.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the production smoke testing was successful before marking the change implemented.

---

## Testing Strategy

### Unit Tests:

- No unit test runner is currently configured in `package.json`; do not add one in this change unless implementation discovers a low-cost existing test harness.
- Keep gate logic simple enough to verify through lint, build, and manual route checks.

### Integration Tests:

- Use Astro build as the automated integration boundary: `npm run build`.
- Use route-level manual tests for unauthorized sign-in, owner sign-in, signup route absence, and stale-session rejection.

### Manual Testing Steps:

1. Configure `AUTHORIZED_USER_ID`, `SUPABASE_URL`, and `SUPABASE_KEY` locally.
2. Start the app and visit `/auth/signin` while signed out; confirm it renders.
3. Try signing in with a valid non-owner Supabase account; confirm the app signs out and shows generic `Access denied`.
4. Use a stale non-owner session cookie, then visit `/`, `/dashboard`, and another app route; confirm redirect to sign-in and no private page render.
5. Sign in with the configured owner Supabase user ID; confirm access to `/` and `/dashboard`.
6. Visit `/auth/signup`, `/auth/confirm-email`, and attempt a POST to `/api/auth/signup`; confirm no registration is available through the app.
7. After production deploy, repeat owner, non-owner, and stale-session smoke tests against the Worker URL.

## Performance Considerations

The gate adds a small per-request authorization check after Supabase user resolution. This is acceptable for the low-QPS single-user MVP. Avoid additional database lookups or allowlist tables; the configured Supabase user ID is enough.

## Migration Notes

Before deploying the code, identify the intended owner account's Supabase `auth.users.id` and configure it as `AUTHORIZED_USER_ID` in local `.env`, local `.dev.vars`, GitHub repository secrets, Cloudflare build variables/secrets as needed, and Cloudflare Worker runtime secrets. Disable public signup in the hosted Supabase dashboard. Existing non-owner Supabase accounts do not need to be deleted for the app gate to work, but they will no longer be able to access MycoHubAI.

## References

- Change identity: `context/changes/single-user-access-gate/change.md`
- Product access scope: `context/foundation/prd.md:82`
- Single-user privacy rule: `AGENTS.md:7`
- Middleware entrypoint: `src/middleware.ts:4`
- Sign-in API: `src/pages/api/auth/signin.ts:13`
- Signup API to remove: `src/pages/api/auth/signup.ts:13`
- Signup UI references: `src/components/Welcome.astro:48`, `src/components/Topbar.astro:30`, `src/pages/auth/signin.astro:18`
- Local Supabase signup settings: `supabase/config.toml:169`, `supabase/config.toml:204`
- Secret drift warning: `context/foundation/infrastructure.md:79`
- Progress contract: `.agents/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Authorization Gate Contract

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — b85d093
- [x] 1.2 Build passes with `AUTHORIZED_USER_ID`, `SUPABASE_URL`, and `SUPABASE_KEY` configured: `npm run build` — b85d093

#### Manual

- [x] 1.3 `/auth/signin` remains reachable while signed out. — b85d093
- [x] 1.4 A valid Supabase account with a non-matching user ID is signed out and shown a generic access-denied error. — b85d093
- [x] 1.5 A stale non-owner session cannot reach `/`, `/dashboard`, or any non-asset app route. — b85d093

### Phase 2: Registration Surface Removal

#### Automated

- [x] 2.1 No signup route files remain: `src/pages/auth/signup.astro`, `src/pages/api/auth/signup.ts`, and `src/pages/auth/confirm-email.astro` are absent. — ce66239
- [x] 2.2 No source link or form action references `/auth/signup` or `/api/auth/signup`: `rg "/auth/signup|/api/auth/signup|confirm-email" src` returns no app references. — ce66239
- [x] 2.3 All local Supabase signup switches are disabled: `rg "enable_signup = true" supabase/config.toml` returns no results and `rg "enable_signup = false" supabase/config.toml` confirms the `[auth]`, `[auth.email]`, and `[auth.sms]` entries. — ce66239
- [x] 2.4 Lint passes: `npm run lint` — ce66239
- [x] 2.5 Build passes: `npm run build` — ce66239

#### Manual

- [x] 2.6 Navigating to `/auth/signup` no longer shows a registration form. — ce66239
- [x] 2.7 Direct POST attempts to `/api/auth/signup` cannot create a user through the app. — ce66239
- [x] 2.8 The landing page, topbar, and sign-in page expose sign-in only. — ce66239

### Phase 3: Configuration, Documentation, And Deployment Verification

#### Automated

- [x] 3.1 Secret references are aligned across `.env.example`, `astro.config.mjs`, `wrangler.jsonc`, `.github/workflows/ci.yml`, and README.
- [x] 3.2 Lint passes: `npm run lint`
- [x] 3.3 Build passes: `npm run build`

#### Manual

- [x] 3.4 Hosted Supabase dashboard has public signup disabled.
- [x] 3.5 Cloudflare Worker runtime secrets include `AUTHORIZED_USER_ID`, `SUPABASE_URL`, and `SUPABASE_KEY`.
- [x] 3.6 GitHub repository secrets include `AUTHORIZED_USER_ID`, `SUPABASE_URL`, and `SUPABASE_KEY` for validation builds.
- [x] 3.7 After deployment, production smoke test confirms owner login works, non-owner login is denied with generic error, and stale non-owner sessions cannot access app routes.
