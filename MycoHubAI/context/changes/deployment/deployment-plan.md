# MycoHubAI Cloudflare Workers Deploy Plan

## Deployment Model

- Runtime: Cloudflare Workers through `@astrojs/cloudflare`.
- Worker name: `myco-hub-ai`.
- Production deployment owner: Cloudflare Workers Builds / Git integration.
- Production branch: `master`.
- Production trigger: every push to `master` after Cloudflare is connected to this GitHub repository.
- GitHub Actions is validation-only. It must not run `wrangler deploy` or use `cloudflare/wrangler-action`.
- Wrangler CLI is still required. Cloudflare installs it from this repo's `devDependencies` during the build and runs it through `npx wrangler deploy`.
- Manual fallback deploy command: `npx wrangler deploy`.
- Do not use `wrangler pages deploy`; this repo is configured as an Astro SSR Worker, not a Pages project.

## Required Secrets And Variables

Keep the same Supabase names everywhere:

- `SUPABASE_URL`
- `SUPABASE_KEY`

Local development uses either `.dev.vars` for Worker-style local runtime checks or `.env` for Node/Astro tooling. If `.dev.vars` exists, Wrangler prefers it for local development, so keep it aligned with `.env.example`.

Cloudflare needs Supabase values in two places:

- Worker runtime secrets: available to deployed Worker code.
- Workers Builds build secrets or variables: available while Cloudflare runs `npm run build`.

GitHub Actions only needs `SUPABASE_URL` and `SUPABASE_KEY` if the validation workflow continues to run `npm run build`. GitHub Actions does not need `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` because GitHub Actions is not responsible for deployment.

## Prerequisites

Before relying on automatic deploys from `master`, configure the Cloudflare account, Cloudflare Git integration, Worker build settings, Worker runtime secrets, Supabase project, and optional local CLIs.

Current setup status:

- [x] Wrangler CLI is available locally.
- [x] Cloudflare account is configured.
- [x] Supabase Cloud project is configured.
- [x] GitHub repository is configured.

### 1. Install Local CLI Dependencies

Wrangler CLI is not removed from the project. It must stay in `package.json` `devDependencies`, because both local fallback deployment and Cloudflare Workers Builds use the repo-local CLI through `npx`.

This repo uses local CLI packages from `package-lock.json`. Install them first so local verification uses the project-pinned `wrangler` and `supabase` versions:

```bash
npm ci
```

Check that both CLIs resolve:

```bash
npx wrangler --version
npx supabase --version
```

On Windows PowerShell, keep using `npx ...` from the repo root. Do not rely on globally installed Wrangler or Supabase CLI versions when configuring deployment for this project.

Expected local CLI pattern:

```bash
npx wrangler --version
npx wrangler deploy --dry-run
npx wrangler deploy
```

The only thing removed from GitHub Actions is GitHub-owned deployment. The Wrangler CLI itself remains the deployment tool; it is just executed by Cloudflare Workers Builds instead of by a GitHub Actions runner.

### 2. Configure The Cloudflare Worker And Git Integration

Create or choose the Cloudflare account that will own production.

Find the Cloudflare Account ID:

1. Open the Cloudflare dashboard.
2. Select the target account, not only a zone/domain.
3. Copy the Account ID from the account dashboard sidebar, or from the Workers & Pages account context.

Connect the repository to Cloudflare Workers Builds:

1. Open Cloudflare dashboard.
2. Go to Workers & Pages.
3. If the Worker already exists, open `myco-hub-ai`, then go to Settings -> Builds and connect a Git repository.
4. If the Worker does not exist yet, choose Create application -> Import a repository.
5. Select this GitHub repository.
6. Set the production branch to `master`.
7. Set the root directory to `/` unless this app is moved into a monorepo subdirectory.
8. Save and deploy.

The Worker name in Cloudflare must match the `name` field in `wrangler.jsonc`:

```jsonc
{
  "name": "myco-hub-ai"
}
```

If the dashboard Worker name and `wrangler.jsonc` name differ, Cloudflare Workers Builds can fail or deploy the wrong target.

### 3. Configure Cloudflare Build Settings

In Cloudflare dashboard, open:

```text
Workers & Pages -> myco-hub-ai -> Settings -> Build
```

Use these production build settings:

- Git repository: this repository.
- Git branch / production branch: `master`.
- Root directory: `/`.
- Install command: `npm ci`.
- Build command: `npm run build`.
- Deploy command: `npx wrangler deploy`.

That deploy command is the Wrangler CLI. Cloudflare runs it after `npm ci`, so `wrangler` must remain installed from this repository's `package-lock.json`.

Keep non-production branch builds disabled unless preview deployments are explicitly planned. This MVP should not expose preview deployments against production Supabase data.

If Cloudflare asks for build variables or build secrets, add:

- `SUPABASE_URL`
- `SUPABASE_KEY`

These build-time values are required because Astro validates server env during `npm run build`. Build variables are not a substitute for Worker runtime secrets.

### 4. Configure Cloudflare Worker Runtime Secrets

Set runtime secrets for the deployed Worker in Cloudflare:

1. Open Cloudflare dashboard.
2. Go to Workers & Pages -> `myco-hub-ai`.
3. Open Settings -> Variables & Secrets.
4. Add encrypted runtime secrets:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`

CLI equivalent for local/manual setup:

```bash
npx wrangler login
npx wrangler whoami
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler secret list
```

If local Wrangler sees multiple accounts, bind the current PowerShell session before writing secrets:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID="<CLOUDFLARE_ACCOUNT_ID>"
npx wrangler whoami
```

Do not paste placeholder values from `.env.example`. Do not commit `.dev.vars` or `.env`.

### 5. Remove GitHub Actions Deployment

GitHub Actions must not deploy this Worker while Cloudflare Workers Builds owns production deployment.

The CI workflow should contain validation only:

```yaml
jobs:
  ci:
    steps:
      - run: npm ci
      - run: npx astro sync
      - run: npm run lint
      - run: npm run build
```

Do not add:

- `cloudflare/wrangler-action`
- `npx wrangler deploy`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

If GitHub branch protection is enabled, require the `ci` check before merging to `master`. Cloudflare still performs the deployment after the merge/push to `master`; GitHub Actions only gates the merge.

### 6. Configure The Supabase Project

Create or choose the hosted Supabase project for production.

Get the required values from the Supabase dashboard:

1. Open the Supabase project.
2. Go to Project Settings -> API.
3. Copy the Project URL into `SUPABASE_URL`.
4. Copy the key that the SSR server code should use into `SUPABASE_KEY`.

Keep `SUPABASE_KEY` aligned across:

- local `.env`
- local `.dev.vars`
- GitHub Actions repository secret, if CI build remains enabled
- Cloudflare Workers Builds build secret or variable
- Cloudflare Worker runtime secret

Local files should look like this, with real values:

```bash
SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
SUPABASE_KEY="<SUPABASE_KEY>"
```

Configure Supabase Auth URL settings before testing production login:

1. Open Supabase dashboard.
2. Go to Authentication -> URL Configuration.
3. Set Site URL to the production Worker URL or custom domain.
4. Add the same production URL to Redirect URLs.
5. Keep local development redirects as separate entries, for example:
   - `http://localhost:4321/**`
   - `http://127.0.0.1:4321/**`

Use the deployed Worker URL after the first successful deploy. Until a custom domain is attached, this will usually be the `*.workers.dev` URL for `myco-hub-ai`.

### 7. Configure Supabase CLI

Log in to the Supabase CLI:

```bash
npx supabase login
```

Find the project ref:

1. Open the hosted Supabase project in the dashboard.
2. Copy it from the project URL:

```text
https://supabase.com/dashboard/project/<PROJECT_REF>
```

Link the local `supabase/` directory to that hosted project:

```bash
npx supabase link --project-ref <PROJECT_REF>
```

If the hosted project already has schema changes made through the dashboard, pull them into a migration before pushing anything from local:

```bash
npx supabase db pull
```

Review the generated migration before committing it. This repo currently has `supabase/config.toml` but no committed `supabase/migrations/` directory, so there is currently nothing database-related to push unless a migration is added.

When migrations exist and have been reviewed, apply them to the linked hosted project:

```bash
npx supabase db push
```

Do not tie `supabase db push` to Cloudflare auto deploy unless the release explicitly includes database migration work. Worker rollback does not undo Supabase schema changes.

### 8. Final Pre-Merge Verification

Before merging to `master`, verify local build and deployment configuration:

```bash
npm run lint
npm run build
npx wrangler deploy --dry-run
```

Check Cloudflare dashboard before relying on auto deploy:

- Worker `myco-hub-ai` is connected to this GitHub repository.
- Production branch is `master`.
- Build command is `npm run build`.
- Deploy command is `npx wrangler deploy`.
- Runtime secrets include `SUPABASE_URL` and `SUPABASE_KEY`.
- Build secrets or variables include `SUPABASE_URL` and `SUPABASE_KEY`.

After merge, Cloudflare Workers Builds should trigger on the push to `master` and deploy the Worker. GitHub Actions should only report validation status.

### Reference Docs

- Cloudflare Workers Builds: `https://developers.cloudflare.com/workers/ci-cd/builds/`
- Cloudflare Workers Builds configuration: `https://developers.cloudflare.com/workers/ci-cd/builds/configuration/`
- Cloudflare Workers build branches: `https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/`
- Cloudflare Wrangler configuration: `https://developers.cloudflare.com/workers/wrangler/configuration/`
- Supabase CLI local development and project linking: `https://supabase.com/docs/guides/local-development/overview`
- Supabase Auth redirect URLs: `https://supabase.com/docs/guides/auth/redirect-urls`

## Runbook

Local validation:

```bash
npm run lint
npm run build
```

Manual deploy, only as a fallback when Cloudflare Git integration is unavailable:

```bash
npx wrangler deploy
```

Runtime logs:

```bash
npx wrangler tail
```

Rollback:

```bash
npx wrangler rollback <VERSION_ID>
```

Worker rollback restores Worker code only. It does not undo Supabase schema or policy changes, prompt/model changes, or secret rotations. Track those separately in deployment notes before release.

## Support Steps

- No deploy after merge to `master`: check Workers & Pages -> `myco-hub-ai` -> Settings -> Build -> Branch control and confirm production branch is `master`.
- Cloudflare build cannot find the app: confirm root directory is `/`.
- Cloudflare build succeeds but deploy fails: confirm deploy command is `npx wrangler deploy`, `wrangler.jsonc` name is `myco-hub-ai`, and Worker runtime secrets exist.
- Build fails with missing Supabase env: add `SUPABASE_URL` and `SUPABASE_KEY` to Cloudflare build secrets or variables and Worker runtime secrets.
- Supabase auth redirects to localhost: update Supabase Authentication -> URL Configuration with the Worker production URL.
- GitHub Actions deploys unexpectedly: remove `cloudflare/wrangler-action`, `npx wrangler deploy`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` from workflows and repository secrets.
- Preview/private-data risk: do not enable non-production branch builds against production Supabase data unless Cloudflare Access or a separate environment is configured.

## Runtime Guardrails

- Keep Worker-facing code Web API compatible.
- Avoid dependencies requiring filesystem access, native modules, unsupported Node APIs, or long-lived process state.
- Keep grow-log data private to the single-user MVP surface.
- Keep diagnosis work limited to agar and grain stages.
- Future AI integration must add its own server-only env schema, timeout policy, provider failure behavior, and no saved chat history unless the PRD changes.
