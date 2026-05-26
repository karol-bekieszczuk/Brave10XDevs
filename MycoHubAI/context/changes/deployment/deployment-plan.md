# MycoHubAI Cloudflare Workers Deploy Plan

## Deployment Model

- Runtime: Cloudflare Workers through `@astrojs/cloudflare`.
- Worker name: `myco-hub-ai`.
- Deploy command: `npx wrangler deploy`.
- Do not use `wrangler pages deploy`; this repo is configured as an Astro SSR Worker, not a Pages project.
- Production deploys run automatically after pushes to `master` pass CI.
- Pull requests run validation only: install, Astro sync, lint, and build.

## Required Secrets

Keep the same secret names everywhere:

- `SUPABASE_URL`
- `SUPABASE_KEY`

Local development uses either `.dev.vars` for Worker-style local runtime checks or `.env` for Node/Astro tooling. If `.dev.vars` exists, Wrangler prefers it for local development, so keep it aligned with `.env.example`.

Production Worker secrets are managed through Wrangler or the Cloudflare dashboard. Preferred CLI setup:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler secret list
```

GitHub Actions also needs these repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_KEY`

Use a least-privilege Cloudflare API token scoped to the target account and Worker deploy access.

## Runbook

Local verification:

```bash
npm run lint
npm run build
```

Manual deploy, when needed:

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

- Missing secret during deploy: confirm `wrangler.jsonc` `secrets.required`, GitHub repository secrets, and `npx wrangler secret list` all use the same names.
- GitHub deploy auth failure: verify `CLOUDFLARE_ACCOUNT_ID`, token scope, token expiration, and that the action uses `accountId`.
- Build succeeds but deployed Worker fails: inspect `npx wrangler tail` for unsupported Node API, missing binding, or runtime secret errors.
- Supabase auth or data failures: compare `.env.example`, `.env`, `.dev.vars`, GitHub secrets, Cloudflare Worker secrets, and `astro.config.mjs`.
- Slow external calls: treat Supabase and future AI provider calls as cross-provider network calls; add route-level timeouts and user-visible retry/error states when implementing those flows.
- Preview/private-data risk: do not expose preview deployments against production data unless Cloudflare Access or a separate environment is configured.

## Runtime Guardrails

- Keep Worker-facing code Web API compatible.
- Avoid dependencies requiring filesystem access, native modules, unsupported Node APIs, or long-lived process state.
- Keep grow-log data private to the single-user MVP surface.
- Keep diagnosis work limited to agar and grain stages.
- Future AI integration must add its own server-only env schema, timeout policy, provider failure behavior, and no saved chat history unless the PRD changes.
