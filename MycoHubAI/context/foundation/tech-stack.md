---
starter_id: 10x-astro-starter
package_manager: npm
project_name: myco-hub-ai
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

MycoHubAI is a small, after-hours web MVP with a 3-week timeline and an AI-assisted diagnosis flow tied to user grow logs. The standard JavaScript/TypeScript recommendation, 10x Astro Starter, gives a typed and convention-based full-stack foundation with Astro, React, Supabase, and Cloudflare deployment already aligned. Cloudflare Workers matches the current Astro Cloudflare adapter and `wrangler.jsonc` deployment target. GitHub Actions keeps lint/build checks simple, and the first-class bootstrapper confidence means scaffolding should be mostly smooth with only occasional manual steps.