---
project: MycoHubAI
researched_at: 2026-05-25
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 SSR with React islands
  runtime: Cloudflare Workers
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare Workers is the best MVP target because the repo is already configured for Astro 6 SSR through `@astrojs/cloudflare`, `astro.config.mjs`, and `wrangler.jsonc`. The interview constraints do not require persistent server processes, cost and DX are balanced, Cloudflare familiarity is a tie-breaker, and external Supabase/OpenAI services are expected.

Use Workers, not Cloudflare Pages, for this project. Astro's current Cloudflare adapter path for Astro 6 SSR targets Workers, and the repo already has a Worker-shaped `wrangler.jsonc`.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5/5 |
| Vercel | Pass | Pass | Pass | Pass | Partial | 4.5/5 |
| Netlify | Partial | Pass | Pass | Partial | Pass | 4/5 |
| Railway | Partial | Partial | Pass | Partial | Pass | 3.5/5 |
| Render | Partial | Partial | Pass | Partial | Pass | 3.5/5 |
| Fly.io | Pass | Partial | Pass | Partial | Partial | 3.5/5 |

Cloudflare Workers fits the current stack without an adapter swap, has `wrangler` deploy/log/rollback commands, a strong free/low-cost request model, official docs with agent-readable sources, and active Cloudflare MCP/server-side agent tooling. It does not provide a persistent process model, but the MVP does not need one.

Vercel is viable for low-QPS Astro SSR and has strong CLI support including deploy, logs, and rollback, but it requires changing the adapter to `@astrojs/vercel`. Vercel MCP and related agent features were treated as beta during research.

Netlify is viable through `@astrojs/netlify` and has strong AI-facing docs and MCP support, but it also requires an adapter change. Its rollback path is less CLI-first than Cloudflare/Vercel, and SSR runs through Netlify Functions rather than the already-configured Workers runtime.

Railway, Render, and Fly.io are technically viable, but each pushes the app toward Node/container-style SSR. That creates unnecessary migration work for this repo and introduces resource-based cost/ops tradeoffs that do not help the current MVP.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Cloudflare wins because it is already the selected deployment target in `tech-stack.md`, the Astro adapter and Wrangler config are present, and the operational loop is CLI-first: `npx wrangler deploy`, `npx wrangler tail`, and `wrangler rollback`.

#### 2. Vercel

Vercel is the strongest fallback if Workers becomes blocked. It has good Astro support, predictable CLI workflows, and clear rollback/log commands, but switching would require replacing the Cloudflare adapter and deployment assumptions.

#### 3. Netlify

Netlify is the third option because it supports Astro SSR and has strong agent-readable docs and MCP support. It ranks below Vercel because rollback is not as cleanly CLI-first and the platform would still require an adapter migration.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate - Weaknesses

1. Workers is not full Node.js. `nodejs_compat` helps, but packages that rely on unsupported Node APIs, filesystem access, native modules, or long-lived in-memory state can fail at runtime.
2. The edge runtime does not co-locate Supabase or OpenAI. Most valuable requests still cross provider boundaries, so network latency and provider limits can dominate response time.
3. The Astro 6 Cloudflare path is version-sensitive. Pages-era deploy guidance or stale adapter examples can produce a wrong deploy plan.
4. Secrets can drift between `.env`, `.dev.vars`, Cloudflare Worker secrets, and Astro's `astro:env/server` schema.
5. Worker rollback only restores deployed code. It does not undo Supabase schema changes, prompt changes, model/provider changes, or secret rotations.

### Pre-Mortem - How This Could Fail

The team deployed the MVP to Cloudflare Workers because the starter already had the Cloudflare adapter. Early deploys worked, but the implementation gradually pulled in Node-oriented libraries for auth, AI streaming, validation, or logging. Local builds passed, yet production requests failed under Workers because one dependency expected unavailable Node APIs. To move fast, secrets were patched manually in several places, leaving `.env`, `.dev.vars`, and Worker secrets out of sync. Diagnosis calls then became slow or flaky because every useful request depended on both Supabase and OpenAI from the edge runtime, and no timeout or fallback policy had been planned. When a bad release reached production, `wrangler rollback` restored Worker code, but the real regression was a changed prompt, data shape, or secret. The team lost time debugging platform behavior when the root issue was an unmanaged operational contract around external services and runtime compatibility.

### Unknown Unknowns

- Astro 6 with `@astrojs/cloudflare` v13 should be treated as a Workers deployment, not a Pages deployment.
- `wrangler dev` and `astro dev` are not interchangeable checks for every runtime behavior; final confidence should come from `npm run build` and Worker deployment verification.
- Supabase region choice can matter more than Cloudflare's global edge for authenticated/database-heavy requests.
- AI responses may hit provider timeout, streaming, or token-cost limits before Cloudflare request volume becomes the bottleneck.
- Cloudflare preview/deploy behavior should be documented before the first production release so the agent does not infer Pages-style commands or add a duplicate GitHub Actions deploy job.

## Operational Story

- **Preview deploys**: Production deploys are owned by Cloudflare Workers Builds, connected to the GitHub repo. GitHub Actions remains validation-only (`npx astro sync`, lint, build) and must not run `wrangler deploy` unless deployment ownership intentionally moves from Cloudflare to GitHub Actions. Branch protection must require GitHub CI before merge to `master`, because Cloudflare auto-deploys after the selected branch changes. Protect public Worker preview URLs with Cloudflare Access before sharing, especially when preview URLs expose private test data or prompts.
- **Secrets**: Local Node tooling uses `.env`; local Worker-style development uses `.dev.vars`; production secrets live in Cloudflare Worker secrets. The current deploy contract only requires `SUPABASE_URL` and `SUPABASE_KEY`; keep those names aligned across `.env.example`, `.dev.vars`, `astro.config.mjs`, `wrangler.jsonc`, and Cloudflare. AI provider secrets are deferred until the diagnosis route is implemented.
- **Rollback**: Use `wrangler rollback <VERSION_ID>` after identifying a known-good Worker version. Treat database migrations, Supabase policy changes, prompt changes, and secret rotations as separate rollback procedures.
- **Approval**: An agent may run read-only checks, builds, logs, and preview deploy commands. Production deploys, primary secret rotation, database destructive actions, and billing/account changes require human approval.
- **Logs**: Read runtime logs with `npx wrangler tail`; read CI logs through GitHub Actions. Use read-only Cloudflare dashboard/MCP access only after scoped credentials are configured.

## Deployment Ownership Contract

- **Deploy owner**: Cloudflare Workers Builds.
- **Production branch**: `master`.
- **Worker name**: `myco-hub-ai`, matching `wrangler.jsonc`.
- **GitHub Actions role**: validation-only; do not add a GitHub Actions deploy job unless this contract changes.
- **Cloudflare-side verification before first production release**: confirm the Git integration points to the correct GitHub repo, production deploys are triggered from `master`, the build/deploy command matches the Astro Workers setup, runtime secrets exist in Cloudflare Worker secrets, and Worker preview URLs are disabled or protected.

Cloudflare Access is the preview protection mechanism for this MVP. It is acceptable on the free Cloudflare Zero Trust plan while the authenticated Access user count stays within the free-plan seat limit. Configure it from the Worker preview URL settings and allow only the owner email or a small explicit test group. Do not rely on preview runtime logs for debugging: Workers preview URLs do not support Workers Logs, `wrangler tail`, or Logpush.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Unsupported Node API appears in a dependency | Devil's advocate | Medium | High | Keep runtime-facing code Web API compatible, run `npm run build`, and verify deployed Worker behavior before production release. |
| External Supabase/OpenAI latency dominates requests | Pre-mortem | Medium | Medium | Pick a Supabase region deliberately, add request timeouts, and keep diagnosis UX tolerant of slow AI responses. |
| Deployment ownership is inferred incorrectly | Unknown unknowns | Medium | High | Keep Cloudflare Workers Builds as the documented deploy owner and GitHub Actions validation-only; do not add `wrangler deploy` to CI unless the ownership contract changes. |
| Secret values drift across local and production environments | Devil's advocate | Medium | High | Maintain `.env.example`, `.dev.vars` locally, and Cloudflare Worker secrets with the same required key names; current required keys are `SUPABASE_URL` and `SUPABASE_KEY`. |
| Secret rotation silently creates a new production Worker version | Devil's advocate | Medium | High | Treat secret rotation as a production deployment. Prefer `npx wrangler versions secret put <KEY>` followed by an intentional `npx wrangler versions deploy` instead of an immediate `npx wrangler secret put <KEY>` on production secrets. |
| Rollback restores code but not external state | Pre-mortem | Medium | High | Record migration, prompt, model, and secret changes in deployment notes; avoid bundling risky external-state changes with routine code deploys. |
| Cloudflare MCP/agent tooling is over-trusted | Research finding | Low | Medium | Start with audited CLI commands; add MCP only for repeated read-only discovery or structured logs/state queries. |

## Getting Started

1. Confirm `wrangler.jsonc` uses Worker name `myco-hub-ai`.
2. Connect Cloudflare Workers Builds to the GitHub repo and configure production deploys from `master`.
3. Add production Worker secrets for `SUPABASE_URL` and `SUPABASE_KEY`. For production rotations, prefer `npx wrangler versions secret put <KEY>` followed by an intentional `npx wrangler versions deploy`; plain `npx wrangler secret put <KEY>` creates and deploys a new Worker version immediately.
4. Build the project with `npm run build`.
5. Deploy the Worker with `npx wrangler deploy`.
6. Keep GitHub Actions validation-only and require it through branch protection before merge to `master`.
7. Verify runtime behavior after Cloudflare deploys with `npx wrangler tail` and a smoke test of sign-in, grow-log CRUD, and one diagnosis request.

When the AI diagnosis route lands, add the chosen provider secret in the same change across `.env.example`, `astro.config.mjs`, `wrangler.jsonc` `secrets.required`, and Cloudflare Worker secrets. If OpenAI is the chosen provider, use `OPENAI_API_KEY` unless the implementation documents a different name.

## Evidence Links

- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Wrangler Workers commands: https://developers.cloudflare.com/workers/wrangler/commands/workers/
- Astro Cloudflare adapter: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Cloudflare MCP: https://github.com/cloudflare/mcp
- Vercel CLI deploy/logs/rollback: https://vercel.com/docs/cli
- Vercel Astro support: https://vercel.com/docs/frameworks/frontend/astro
- Netlify Astro support: https://docs.netlify.com/build/frameworks/framework-setup-guides/astro/
- Netlify MCP: https://docs.netlify.com/welcome/build-with-ai/netlify-mcp-server/
- Railway Astro guide: https://docs.railway.com/guides/astro
- Fly.io Astro guide: https://fly.io/docs/js/frameworks/astro/
- Render Astro guide: https://render.com/docs/deploy-astro

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture, including multi-region HA or disaster recovery
