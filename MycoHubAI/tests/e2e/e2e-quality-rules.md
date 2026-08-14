# MycoHubAI E2E Quality Rules

- Start authenticated tests through `npm run test:e2e`; the setup project owns sign-in and writes `storageState`. Never drive the sign-in UI in a scenario.
- Keep the authenticated session, middleware, Astro routes, local Supabase, redirects, and SSR rendering real. Mock only external, expensive, or nondeterministic providers when a scenario reaches them.
- Locate controls with `getByRole`, `getByLabel`, or `getByText`. Do not use CSS, XPath, DOM structure, or `getByTestId` when an accessible name exists.
- Use web-first assertions and state transitions such as `toBeVisible`, `toHaveCount`, `toHaveURL`, `waitForEvent`, and `page.reload`. Never use `waitForTimeout`.
- Put one risk-bound test in each generated spec. Every test must create unique data, execute its complete flow, assert the user-visible business outcome, and clean up only its own records in `finally`.
- Accept real confirmation dialogs and assert their type and message before accepting them.
- Do not use `test.skip`, `test.fixme`, screenshots, pixel assertions, or shared rows to make a functional scenario pass.
- A generated spec is complete only after it passes alone and fails under a temporary deliberate break of the exact behavior it protects.

The seed exemplar is `tests/e2e/seed.ts`. The harness creates and hard-deletes one disposable owner, removes temporary auth/binding artifacts, and refuses non-loopback Supabase targets.
