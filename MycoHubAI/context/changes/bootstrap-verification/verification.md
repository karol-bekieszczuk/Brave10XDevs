---
bootstrapped_at: 2026-05-23T10:37:47.3019648+02:00
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: myco-hub-ai
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
---
starter_id: 10x-astro-starter
package_manager: npm
project_name: myco-hub-ai
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---
```

### Why this stack

MycoHubAI is a small, after-hours web MVP with a 3-week timeline and an AI-assisted diagnosis flow tied to user grow logs. The standard JavaScript/TypeScript recommendation, 10x Astro Starter, gives a typed and convention-based full-stack foundation with Astro, React, Supabase, and Cloudflare deployment already aligned. Cloudflare Pages matches the starter default, GitHub Actions with auto-deploy keeps the release path simple, and the first-class bootstrapper confidence means scaffolding should be mostly smooth with only occasional manual steps.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | skipped because the starter command uses `git clone`, not an npm `create-*` CLI |
| GitHub repo | not run | unavailable | `gh api repos/przeprogramowani/10x-astro-starter --jq '.pushed_at'` failed because GitHub CLI is not authenticated |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: git-clone

**Exit code**: 0

**Files moved**: 19 top-level entries moved: `.github`, `.husky`, `.vscode`, `node_modules`, `public`, `src`, `supabase`, `.env.example`, `.nvmrc`, `.prettierrc.json`, `astro.config.mjs`, `CLAUDE.md`, `components.json`, `eslint.config.js`, `package-lock.json`, `package.json`, `README.md`, `tsconfig.json`, `wrangler.jsonc`

**Conflicts (.scaffold siblings)**: none

**.gitignore handling**: append-merged

**.bootstrap-scaffold cleanup**: deleted after removing the cloned starter `.git`

## Post-scaffold audit

**Tool**: `npm audit --json`

**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW

**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0

### CRITICAL findings

None.

### HIGH findings

- `devalue`, transitive, range `5.6.3 - 5.8.0`: Svelte devalue DoS via sparse array deserialization (`GHSA-77vg-94rm-hx3p`). Fix available.

### MODERATE findings

- `@astrojs/check`, direct, range `>=0.9.3`: via `@astrojs/language-server`. Fix available by changing `@astrojs/check` to `0.9.2`, marked semver-major by npm.
- `@astrojs/language-server`, transitive, range `>=2.14.0`: via `volar-service-yaml`.
- `@cloudflare/vite-plugin`, transitive, range `<=0.0.0-fff677e35 || 0.0.7 - 1.37.2`: via `miniflare`, `wrangler`, and `ws`. Fix available.
- `miniflare`, transitive, range `<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260518.0`: via `ws`. Fix available.
- `volar-service-yaml`, transitive, range `<=0.0.70`: via `yaml-language-server`.
- `wrangler`, direct, range `<=0.0.0-kickoff-demo || 3.108.0 - 4.93.0`: via `miniflare`. Fix available.
- `ws`, transitive, range `8.0.0 - 8.20.0`: uninitialized memory disclosure (`GHSA-58qx-3vcg-4xpx`). Fix available.
- `yaml`, transitive, range `>=2.0.0 <2.8.3`: stack overflow via deeply nested YAML collections (`GHSA-48c2-rrv3-qjmp`).
- `yaml-language-server`, transitive, range `1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0`: via `yaml`.

### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | false |
| has_payments | false |
| has_realtime | false |
| has_ai | true |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified.

Useful manual steps in the meantime:

- `git init` if you have not already, to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance. The full breakdown is in this log.
