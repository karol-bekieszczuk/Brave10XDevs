## Overall concept

- GHA workflow run for every new pull request to master
- composite action for the review itself so that main workflow is easy to reason about

## Input parameters

- pull request title
- pull request description (?? cost tradeoff)
- git diff

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the best.

### Documentation

- Check whether changes to public behavior, configuration, environment variables, commands, workflow operation, or failure handling are documented in the nearest relevant README.
- Documentation must be consistent with the implementation, concise, and copy-pasteable where it provides commands.
- Secret values must never be documented; only variable names, configuration locations, and safe placeholders are allowed.
- Non-obvious workflow security and operational decisions should be explained close to the relevant YAML or action definition. Comments should explain intent rather than restate syntax.
- Do not penalize self-explanatory internal refactors that do not change setup, behavior, contracts, or operations.
- Score 1 when required documentation is missing or materially misleading; score 5 when the main path is documented but important setup, edge cases, or troubleshooting are missing; score 10 when all documentation affected by the diff is complete, accurate, scoped, and actionable.

### Test coverage

- Every changed behavior should have coverage at the lowest reliable layer: Vitest for isolated TypeScript, API, React, and orchestration logic; Playwright only for user-visible browser flows; a runtime smoke test for behavior that depends specifically on Cloudflare Workers or external infrastructure.
- Bug fixes should include a regression test that would fail without the fix.
- Cover meaningful success, empty, boundary, malformed-input, and failure paths introduced or changed by the diff.
- Changes inside `packages/code-reviewer` must be covered by that package's own Vitest suite because the root test command does not execute it.
- Do not require browser E2E tests for workflow-only or server-side changes with no browser-visible risk.
- Score 1 when important changed behavior has no credible test coverage; score 5 when the happy path is covered but significant risks are not; score 10 when tests cover the material risks at appropriate layers without redundant E2E coverage.

### Test quality and reliability

- Tests should assert observable contracts rather than private implementation details.
- Tests must be deterministic, independent, and responsible for cleanup; mocks must not be presented as proof of live provider, GitHub, Supabase, or Cloudflare behavior.
- Playwright tests must use user-facing locators, web-first assertions and state-based waits; do not use CSS/XPath selectors or fixed timeout waits.
- Workflow orchestration tests should cover clean review output, findings, malformed reviewer output, provider failure, GitHub API failure, label replacement, comment update, and on-demand retry without making paid live calls by default.
- A live manual acceptance check is appropriate for the final secret-backed provider call and real PR comment/label integration.
- Score 1 when tests are flaky, misleading, or unable to detect the claimed regression; score 5 when tests are useful but brittle or overly mocked; score 10 when tests are stable, risk-focused, and their proof boundary is explicit.

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added
