# Delete User Account Manual Verification

Use disposable local Supabase data and a disposable owner account. Do not run these checks against real user data.

## Prerequisites

- Local Supabase stack is running.
- Application is pointed at the local Supabase project.
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_ADMIN_KEY`, and `AUTHORIZED_USER_ID` are set in the shell session used for the app.
- You have one disposable owner user that can sign in to the dashboard.
- You have a second disposable auth user for negative and access-control checks.
- You can inspect the deployed Cloudflare Worker settings after deployment.

## Local Environment Setup

1. Start the app against local Supabase.
2. Create or confirm a disposable owner account and a second disposable test account.
3. Seed at least one grow log row owned by the disposable owner.
4. Confirm the owner can view the dashboard and the second account cannot see the owner's private grow logs.

Expected result:

- The app loads normally.
- The owner can reach the dashboard.
- The second account is treated as a separate principal.

## Happy Path

1. Sign in as the disposable owner.
2. Open the account deletion action.
3. Confirm the browser dialog states the account is disabled now and permanently deleted after 30 days.
4. Accept the confirmation.
5. Verify the UI redirects to `/auth/signin`.
6. Verify the message is neutral and indicates the deletion request was recorded.
7. Verify the session is signed out.

Expected result:

- The deletion request is recorded.
- The owner is signed out.
- The redirect lands on sign-in with a neutral success message.

## Missing Admin Key

1. Remove `SUPABASE_ADMIN_KEY` from the local environment.
2. Repeat the owner deletion flow.

Expected result:

- The app fails closed.
- No deletion request is completed.
- The UI shows a clear configuration error instead of pretending deletion succeeded.

## Pending-Deletion Access Block

1. Re-enable `SUPABASE_ADMIN_KEY`.
2. Submit the deletion flow for the disposable owner.
3. Keep the owner JWT/session available for a direct follow-up request.
4. Attempt to reload the dashboard or access any protected route while the deletion request is pending.
5. Attempt to read or mutate grow-log data with the same session.

Expected result:

- Middleware blocks the pending-deletion session.
- Protected routes do not remain usable after the deletion request is recorded.
- Grow-log access is denied for the pending account.

## Sign-In Message Checks

1. Visit `/auth/signin` after the deletion request is recorded.
2. Confirm the sign-in page explains the account was deleted or disabled in a neutral way.
3. Confirm the message does not expose private deletion internals or raw backend error text.

Expected result:

- The sign-in copy is clear and neutral.
- No sensitive implementation detail is shown.

## Forced Due-Purge Check

1. Make the deletion request eligible for purge in the local database.
2. Run the scheduled purge path or invoke the purge service in the local environment.
3. Verify the auth user is hard-deleted.
4. Verify a second purge pass does not fail when the auth user is already gone.

Expected result:

- Due users are permanently removed.
- Re-running purge is safe and idempotent.

## Grow-Log Cascade Verification

1. Seed at least one grow log row for the disposable owner before deletion.
2. Complete the deletion flow.
3. Run the purge path when the user becomes due for hard deletion.
4. Confirm the owner's grow-log rows are removed by cascade.
5. Confirm rows for an unaffected owner remain intact.

Expected result:

- Owner-owned grow logs are deleted with the account lifecycle.
- Unrelated owners' data remains untouched.

## Production Setup Verification

1. Check the production setup docs or deployment notes.
2. Confirm they identify where `SUPABASE_ADMIN_KEY` is configured in Cloudflare.
3. Confirm they identify where the Cloudflare Cron Trigger is configured.
4. After deployment, inspect the Worker settings and verify the Cron Trigger is present.

Expected result:

- The operational docs tell a deployer where to configure the admin secret.
- The deployed Worker visibly has the configured cron schedule.

## Non-Goals

- Do not test against real user accounts or production data.
- Do not validate unsupported product areas outside the account-deletion flow.
- Do not use screenshots or recorded evidence as a substitute for actually checking the live flow.
- Do not treat unit tests alone as proof of manual verification.
