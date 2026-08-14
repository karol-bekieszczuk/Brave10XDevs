We are adding an E2E test for the cross-boundary runtime/SSR risk from `context/foundation/test-plan.md` Phase 3 and `context/changes/testing-runtime-failure-smoke-layer/plan.md` Phase 4.

Research anchor:
An authenticated disposable owner creates two uniquely named grow logs, bulk-deletes exactly one, reloads the SSR list, and still sees the selected log absent while the survivor remains visible.

Business scenario:
The real delete confirmation appears; successful bulk deletion reports controlled feedback, removes only the selected title, preserves the survivor, and the same absence/presence remains after `page.reload()`.

Real boundaries:
Cookie-backed authentication from `storageState`, authorization middleware, Astro pages and API routes, form submission, redirect, disposable local Supabase persistence, and SSR rendering.

Mocked boundaries:
None. The scenario does not reach the diagnosis provider or any other external API.

Write one Playwright test following `tests/e2e/seed.spec.ts` and `tests/e2e/e2e-quality-rules.md`. The test must fail if bulk deletion targets the wrong row, does not persist, or the SSR reread returns stale state. Clean up only rows identified by the generated owner ID and unique titles, with harness owner deletion as the final safety net.
