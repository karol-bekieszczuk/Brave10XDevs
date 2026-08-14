---
change_id: testing-runtime-failure-smoke-layer
title: Prove controlled runtime and provider failure behavior
status: implementing
created: 2026-08-06
updated: 2026-08-14
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Runtime Failure And Smoke Layer".
Risks covered: #5, cross-cutting. Test types planned: targeted smoke, limited browser/manual.
Risk response intent:

- Risk #5: prove that missing secrets and provider failures surface a controlled failure and do not persist bad state.
  After creating the folder, follow the downstream continuation rule.

Planning decisions: use a vendor-neutral public provider error, do not assert a specific HTTP status for the failure response, keep all runtime assurance in the existing local and CI environments, and do not test Supabase outages or predict upstream OpenRouter/Cloudflare status codes.
