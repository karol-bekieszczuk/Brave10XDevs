# Phase 0 Verification

Date: 2026-05-26

## Scope

`deployment-plan.md` does not define numbered phases. For this pass, Phase 0 was treated as repo-local deployment preflight: verify the Cloudflare Worker deployment shape, local CLI availability, validation gates, and dry-run deploy packaging before relying on external Cloudflare automation.

## Environment

- Local Node: `v24.15.0`.
- Project Node target: `.nvmrc` is `22.14.0`; GitHub Actions uses Node 22.
- Local npm: `11.12.1`.
- Local `.env`: present.
- Local `.dev.vars`: absent.
- Wrangler CLI: `4.94.0`.
- Supabase CLI: `2.98.2`; CLI reported `2.101.0` is available.

## Repo Configuration Checked

- `wrangler.jsonc` Worker name is `myco-hub-ai`.
- `wrangler.jsonc` uses `@astrojs/cloudflare/entrypoints/server` and `./dist` assets.
- `wrangler.jsonc` requires `SUPABASE_URL` and `SUPABASE_KEY`.
- `.github/workflows/ci.yml` is validation-only: `npm ci`, `npx astro sync`, `npm run lint`, and `npm run build`.
- GitHub Actions does not run `cloudflare/wrangler-action` or `wrangler deploy`.
- `package.json` keeps `wrangler` and `supabase` in local dev dependencies.

## Fixes Applied

- Ran `npm.cmd run lint:fix` to normalize CRLF line endings that caused the Phase 0 lint gate to fail.
- Added `.gitattributes` with `* text=auto eol=lf` to keep future Windows checkouts aligned with Prettier and CI.
- Deferred adding `site` to `astro.config.mjs` until the first production Worker URL or custom domain is known.

## Verification Results

- `npx.cmd astro sync`: passed.
  - Astro loaded secrets from `.env` and `process.env`.
- `npm.cmd run lint`: passed.
  - Non-fatal warning remains: `astro-eslint-parser` does not support `projectService` and parses it as `project: true`.
- `npm.cmd run build`: passed.
  - Astro loaded secrets from `.env` and `process.env`.
  - Warning remains: `@astrojs/sitemap` skipped because `astro.config.mjs` has no `site` option.
- `npx.cmd wrangler deploy --dry-run`: passed.
  - Wrangler used redirected config from `dist\server\wrangler.json`.
  - Dry-run packaged 21 worker modules.
  - Total upload was `1911.46 KiB`; gzip size was `390.74 KiB`.
  - Detected bindings: `SESSION`, `IMAGES`, and `ASSETS`.

## Phase 0 Status

Phase 0 repo-local preflight is complete.

Before production deploy validation with real runtime behavior:

- Keep `SUPABASE_URL` and `SUPABASE_KEY` aligned across `.env`, Cloudflare Workers Builds build secrets or variables, and Cloudflare Worker runtime secrets.
- Add `site` to `astro.config.mjs` after the production Worker URL or custom domain is known, so `@astrojs/sitemap` can generate sitemap output without warnings.
