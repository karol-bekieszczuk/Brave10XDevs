# Pull Request AI Code Review Implementation Plan

## Overview

Implement an advisory AI code-review workflow for pull requests targeting `master` in the `Brave10XDevs` monorepo. The workflow will review changes in the `MycoHubAI` scope, score documentation, test coverage, and test quality, publish one update-in-place PR comment, reconcile result labels, and support on-demand retry through `ai-cr:review`.

The implementation replaces the current placeholder workflow and non-executable composite-action stub. It preserves the existing generic `{ findings }` reviewer and adds a separate PR-specific contract and orchestration path.

## Current State Analysis

The Git root is `C:/Users/karol/repos/Brave10XDevs`, while MycoHubAI is stored under the `MycoHubAI/` prefix. The current workflow is therefore tracked as `MycoHubAI/.github/workflows/review.yml`, outside the repository-root `.github/workflows/` discovery location used by GitHub Actions.

The nested workflow references `twoj-zespol/ai-reviewer@<sha>` instead of the local composite action and passes an undeclared uppercase input (`.github/workflows/review.yml:4-16`). The local action declares `api-key`, reads `secrets.OPENROUTER_API_KEY` directly, calls a missing `dist/review.js`, and exposes an output that is never written (`.github/actions/ai-pr-review/action.yml:10-30`).

The standalone `packages/code-reviewer` package already provides an injectable, repository-scoped agent and bounded read-only tools. Its schema and prompt deliberately support findings only and reject scores, summaries, and verdicts (`packages/code-reviewer/src/schemas/code-review.ts:15-50`, `packages/code-reviewer/src/prompts/code-review.ts:3-17`). Root installation and tests do not install or verify this nested package.

## Desired End State

A repository-root workflow reacts to `opened`, `reopened`, `ready_for_review`, `synchronize`, and matching `labeled` events for pull requests targeting `master`. It reviews only changes affecting `MycoHubAI/**` or the AI-review automation itself, skips fork and Dependabot pull requests without attempting to use provider secrets, and serializes runs by pull-request number.

Trusted automation is checked out from the pull request's base SHA into a separate directory. The pull-request head is checked out only as the target repository and is never executed with `OPENROUTER_API_KEY` or a write-capable `GITHUB_TOKEN`. The trusted local composite action invokes a tested PR-specific CLI from the base checkout and supplies `MycoHubAI` as the explicit repository root.

For a completed review, the pull request has exactly one bot-owned summary comment and exactly one of `ai-cr:passed` or `ai-cr:failed`. Operational failures use `ai-cr:error` and fail the workflow. Adding `ai-cr:review` consumes that label immediately and starts a new review. Negative code-review outcomes remain advisory and do not fail the workflow.

### Key Discoveries:

- GitHub cannot discover the current nested workflow because the actual Git root is one directory above MycoHubAI; the integration must live at `../.github/workflows/review.yml`.
- The placeholder `twoj-zespol/ai-reviewer@<sha>` and missing `dist/review.js` are implementation defects, not reusable integration points (`.github/workflows/review.yml:14`, `.github/actions/ai-pr-review/action.yml:27`).
- The package is source-consumed, has `noEmit: true`, and ignores `dist/`; the composite action should run the source CLI through package-local `tsx` rather than introduce an unplanned build artifact (`packages/code-reviewer/tsconfig.json:2-10`, `.gitignore:8`).
- `createReviewer(model)` already supports deterministic model injection and call-scoped repository roots (`packages/code-reviewer/src/agent/reviewer.ts:12-43`).
- The existing CLI joins argv into an unbounded prompt, so it is not a safe transport for multiline PR metadata and diffs (`packages/code-reviewer/src/cli.ts:12-26`).
- Package-local Vitest and type checking are the authoritative deterministic boundary; the current suite passes without an API key or network call (`packages/code-reviewer/package.json:6-10`).
- Current GitHub Actions documentation confirms target-branch filtering, explicit granular permissions, per-workflow concurrency, fork/Dependabot secret restrictions, and the danger of combining privileged triggers with untrusted checkout execution.

## What We're NOT Doing

- Changing the existing generic `CodeReviewResult` or its findings-only prompt and CLI contract.
- Reviewing projects outside `MycoHubAI`, except for changes to the repository-root AI-review workflow/action that operate on MycoHubAI.
- Running AI review for fork or Dependabot pull requests in this MVP.
- Executing scripts, hooks, tests, package installation, or other code from the pull-request head with secrets or write permissions.
- Making a negative AI assessment block merge or configuring branch protection.
- Adding business-alignment or architectural-fit scoring.
- Adding browser E2E tests for workflow-only behavior.
- Making paid provider calls in the default automated test suite.
- Adding deployment steps or changing Cloudflare Workers Builds ownership.
- Reading secrets from `.env`, `.dev.vars`, or another repository file.

## Implementation Approach

Keep the generic reviewer stable and add a parallel `pull-request` module inside `packages/code-reviewer`. Pure schemas, prompt construction, scoring policy, comment rendering, and label reconciliation will be tested independently. Provider, Git, filesystem, and GitHub operations will sit behind injected boundaries so orchestration failures can be covered without live calls.

Move the AI-review workflow and composite action to the actual repository root. The workflow owns event selection, trust policy, permissions, concurrency, and the two-checkout layout. The composite action owns Node setup, package-local installation, and invocation of the trusted PR CLI. The CLI reads GitHub event data from a file and obtains the diff with argument-safe Git process calls; PR title, bounded body, and diff remain data rather than generated shell source.

Use immutable commit SHAs for third-party actions in this security-sensitive workflow, with the corresponding release tag recorded in a nearby comment for maintainability. The workflow grants only the scopes required to read repository content and update PR comments/labels.

## Critical Implementation Details

### Security boundary

The action and all executable TypeScript must come from the base-SHA checkout. The head checkout is an analysis target only. `OPENROUTER_API_KEY` and `GITHUB_TOKEN` are supplied to the trusted action through declared inputs mapped to step environment variables; the action definition must not access the `secrets` context directly or serialize either value.

### State sequencing

Concurrency is grouped by workflow name and PR number with older runs cancelled. Immediately before publishing, orchestration re-reads the PR head SHA and refuses to mutate comments or result labels if it no longer matches the reviewed SHA. A matching `ai-cr:review` label is removed as soon as retry is accepted, making another retry possible after any failure.

### Diff completeness

Diff acquisition uses the merge base of the event base SHA and current head SHA. The request includes the normalized changed-file manifest and textual patch, preserving deletion and submodule metadata and representing binary files explicitly without binary content. A missing/empty diff or a UTF-8 patch above 100 KiB is an operational error rather than a partially scored review; generated files are not silently excluded.

### Failure observability

Successful and negative reviews use one marked comment that includes the reviewed head SHA. Provider, schema, input, or orchestration failures attempt to replace result labels with `ai-cr:error`, update the marked comment with a redacted technical category and retry guidance, and then exit non-zero. If GitHub API mutation itself fails, the workflow can only fail and log a redacted error; the plan does not claim an error label/comment can be guaranteed when its transport is unavailable.

## Phase 1: Define the PR Review Contract and Decision Policy

### Overview

Add the typed request, scored response, prompt, agent, and deterministic pass/fail policy without changing the existing generic reviewer. This phase establishes the stable data contracts used by later GitHub integration.

### Changes Required:

#### 1. Pull-request request and result schemas

**Files**: `packages/code-reviewer/src/pull-request/schema.ts`, `packages/code-reviewer/src/pull-request/schema.test.ts`

**Intent**: Define bounded, strict contracts for PR metadata, diff evidence, three scored criteria, findings, and the reviewed commit identity.

**Contract**: The request requires repository identity, PR number, base/head SHAs, title, changed-file manifest, patch, and retry flag. Body is normalized to at most 8,000 characters with an explicit truncation marker. The patch accepts at most 100 KiB of UTF-8 text. The result requires exactly `documentation`, `testCoverage`, and `testQuality` criteria with integer scores from 1 through 10, concise rationale and bounded evidence, plus bounded actionable findings. Provider-facing nullable fields normalize into an ergonomic public contract, following `schemas/code-review.ts:25-50`.

#### 2. PR-specific prompt and input serialization

**Files**: `packages/code-reviewer/src/pull-request/prompt.ts`, `packages/code-reviewer/src/pull-request/prompt.test.ts`

**Intent**: Encode the three requirement rubrics and delimit all PR-controlled content as untrusted evidence rather than instructions.

**Contract**: Prompt construction is deterministic and preserves title, bounded body, file manifest, and patch as separately delimited data. It includes the 1/5/10 anchors from `requirements.md`, requires repository-backed evidence for negative claims, forbids GitHub mutations and secret requests, and requires only the strict scored result.

#### 3. Injectable PR reviewer

**Files**: `packages/code-reviewer/src/pull-request/reviewer.ts`, `packages/code-reviewer/src/pull-request/reviewer.test.ts`, `packages/code-reviewer/src/pull-request/generate.ts`, `packages/code-reviewer/src/pull-request/generate.test.ts`

**Intent**: Add a PR-specific ToolLoopAgent and provider adapter while retaining the generic `createReviewer()` behavior unchanged.

**Contract**: `createPullRequestReviewer(model)` accepts the typed request and explicit repository root, reuses the bounded repository tools, and returns the PR-specific structured result. The production adapter validates `OPENROUTER_API_KEY` lazily and uses the configured OpenRouter model. Imports remain free of secret validation, I/O, provider calls, and CLI behavior.

#### 4. Deterministic verdict policy

**Files**: `packages/code-reviewer/src/pull-request/policy.ts`, `packages/code-reviewer/src/pull-request/policy.test.ts`

**Intent**: Derive workflow control from validated model output rather than asking the model to choose a label or exit status.

**Contract**: A result is `passed` only when the arithmetic mean of the three integer scores is at least 7, every score is at least 5, and no finding has severity `error`; otherwise it is `failed`. `error` is reserved for operational failures outside scored model output.

### Success Criteria:

#### Automated Verification:

- PR schema boundary and normalization tests pass: `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/schema.test.ts`
- Prompt and injected-reviewer tests pass without credentials or network access: `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/prompt.test.ts src/pull-request/reviewer.test.ts src/pull-request/generate.test.ts`
- Verdict tests cover score averages, minimum-score boundaries, and error-finding override: `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/policy.test.ts`
- Existing generic reviewer tests remain unchanged and pass: `npm.cmd --prefix packages/code-reviewer test`
- Package type checking passes: `npm.cmd --prefix packages/code-reviewer run typecheck`

#### Manual Verification:

- Confirm the PR-specific schema expresses only the three approved criteria and does not modify the generic `{ findings }` API.
- Review representative prompts containing Markdown, shell-looking text, and prompt-injection text and confirm all PR-controlled content remains visibly delimited as data.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Implement Idempotent GitHub Orchestration

### Overview

Build the deterministic comment, label, retry, Git, and GitHub orchestration around injected boundaries. All normal and failure paths remain testable without a provider key or real pull request.

### Changes Required:

#### 1. Diff and event input adapter

**Files**: `packages/code-reviewer/src/pull-request/input.ts`, `packages/code-reviewer/src/pull-request/input.test.ts`

**Intent**: Convert the GitHub event file and target checkout into a validated review request without interpolating untrusted values into shell source.

**Contract**: The adapter accepts explicit event-file and `MycoHubAI` repository-root paths, validates the event is an in-scope PR action, and invokes Git with an argument array to resolve merge base, changed files, and patch. It preserves deletions/submodule metadata, marks binary entries, rejects empty or over-100-KiB patches, truncates the PR body at 8,000 characters, and never executes code from the target checkout.

#### 2. Stable comment renderer

**Files**: `packages/code-reviewer/src/pull-request/comment.ts`, `packages/code-reviewer/src/pull-request/comment.test.ts`

**Intent**: Render one concise, updateable summary for passing, failing, and operational-error outcomes.

**Contract**: Every bot comment contains one stable hidden marker, reviewed head SHA, advisory status, three-score table, average and threshold explanation, evidence/findings, diff metadata, and retry instructions. Operational comments contain a redacted failure category and no secret/provider payload. PR-controlled Markdown cannot remove or counterfeit the leading marker.

#### 3. GitHub API boundary and label reconciliation

**Files**: `packages/code-reviewer/src/pull-request/github-client.ts`, `packages/code-reviewer/src/pull-request/github-client.test.ts`, `packages/code-reviewer/src/pull-request/labels.ts`, `packages/code-reviewer/src/pull-request/labels.test.ts`

**Intent**: Encapsulate authenticated API calls and compute idempotent mutations separately from transport.

**Contract**: The client uses the runtime token without logging it, supports paginated bot-comment lookup, create/update comment, current-head lookup, label creation when absent, and add/remove label operations. Reconciliation converges on exactly one of `ai-cr:passed`, `ai-cr:failed`, or `ai-cr:error`; it creates missing labels with documented colors/descriptions, leaves unrelated labels untouched, and treats `ai-cr:review` as a transient command.

#### 4. Review orchestrator and CLI

**Files**: `packages/code-reviewer/src/pull-request/orchestrator.ts`, `packages/code-reviewer/src/pull-request/orchestrator.test.ts`, `packages/code-reviewer/src/pull-request/cli.ts`, `packages/code-reviewer/src/pull-request/cli.test.ts`

**Intent**: Coordinate retry consumption, input acquisition, model review, stale-head protection, comment upsert, labels, and exit behavior through injected ports.

**Contract**: The orchestrator removes `ai-cr:review` at the start of an accepted retry, obtains and validates the request, invokes the PR reviewer, checks the current head before publication, upserts only the marked bot comment, and reconciles labels. `passed` and `failed` return exit code 0; operational `error` attempts error publication and returns non-zero. A stale reviewed SHA exits without publishing stale state.

### Success Criteria:

#### Automated Verification:

- Event and diff tests cover normal, empty, binary, deleted, submodule, force-pushed, malformed, and oversized inputs: `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/input.test.ts`
- Comment and label tests prove stable-marker upsert and convergence to one result label: `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/comment.test.ts src/pull-request/labels.test.ts`
- GitHub client tests cover pagination, create/update, label creation, redacted errors, and API failures: `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/github-client.test.ts`
- Orchestrator and CLI tests cover pass, fail, malformed model output, provider failure, GitHub failure, retry consumption, irrelevant labels, idempotent rerun, and stale-head rejection: `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/orchestrator.test.ts src/pull-request/cli.test.ts`
- Full package tests and type checking pass: `npm.cmd --prefix packages/code-reviewer test` and `npm.cmd --prefix packages/code-reviewer run typecheck`

#### Manual Verification:

- Inspect rendered fixtures for passed, failed, and error outcomes and confirm the status, reviewed SHA, scores, findings, and retry guidance are unambiguous.
- Review fake-client call traces and confirm human comments and unrelated labels are never mutated and no secret-like value appears in output.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Wire the Trusted Composite Action and Repository-Root Workflow

### Overview

Replace the undiscoverable nested stubs with executable repository-root automation. Keep the main workflow declarative while enforcing the approved event, scope, trust, permission, and concurrency policies.

### Changes Required:

#### 1. Repository-root composite action

**Files**: `../.github/actions/ai-pr-review/action.yml`, delete `.github/actions/ai-pr-review/action.yml`

**Intent**: Replace the current action stub with the real local integration and eliminate the missing `dist/review.js` path.

**Contract**: The action declares every consumed input, including provider token, GitHub token, trusted automation path, target repository path, and event path. It maps secrets only into the executing step's environment, sets up the repository's Node version, runs package-local `npm ci`, invokes the `review:pr` source CLI through `tsx`, and writes its declared `result` output to `$GITHUB_OUTPUT`. It never references the `secrets` context itself.

#### 2. Package execution contract

**Files**: `packages/code-reviewer/package.json`, `packages/code-reviewer/package-lock.json`, `packages/code-reviewer/src/pull-request/workflow-contract.test.ts`

**Intent**: Expose the trusted PR CLI and add a deterministic structural check for the workflow/action contract.

**Contract**: Add `review:pr` without changing `start` or the generic CLI. Synchronize only dependencies required by the chosen implementation. The contract test parses both YAML files and verifies trigger activities, scope paths, permissions, concurrency, local-action path, declared/consumed inputs and outputs, base/head checkout separation, and absence of the placeholder remote action or `dist/review.js`.

#### 3. Repository-root workflow

**Files**: `../.github/workflows/review.yml`, delete `.github/workflows/review.yml`

**Intent**: Place the workflow where GitHub discovers it and make event/security policy explicit at the top level.

**Contract**: Trigger `pull_request` for `opened`, `reopened`, `ready_for_review`, `synchronize`, and `labeled`, targeting `master`, with path scope covering `MycoHubAI/**` and the AI-review workflow/action. A job condition accepts non-label review events plus only `ai-cr:review` labeled events, and skips fork and Dependabot PRs. Declare least-privilege content-read and PR/issue-write permissions, per-PR concurrency with cancellation, separate base-SHA automation and head-SHA target checkouts, and the local `./automation/.github/actions/ai-pr-review` invocation. All third-party actions are pinned to immutable SHAs with release tags documented in comments.

#### 4. Secret-safe handoff

**Files**: `../.github/workflows/review.yml`, `../.github/actions/ai-pr-review/action.yml`

**Intent**: Make the provider and GitHub credentials available only to trusted execution and keep PR metadata out of generated shell code.

**Contract**: The workflow passes `OPENROUTER_API_KEY` and `GITHUB_TOKEN` into declared action inputs; the action maps them to environment variables only for the trusted CLI process. PR metadata is read from `GITHUB_EVENT_PATH`, diff data is obtained from the target checkout by argument-safe Git calls, and logs/errors redact token values.

### Success Criteria:

#### Automated Verification:

- Workflow contract tests confirm the required triggers, filters, permissions, concurrency, paths, and trusted checkout layout: `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/workflow-contract.test.ts`
- Contract tests prove `twoj-zespol/ai-reviewer@<sha>` and `dist/review.js` are absent and the local action inputs/outputs are wired consistently.
- Clean package installation, full package tests, and package type checking pass: `npm.cmd --prefix packages/code-reviewer ci`, `npm.cmd --prefix packages/code-reviewer test`, and `npm.cmd --prefix packages/code-reviewer run typecheck`
- Repository formatting and diff hygiene pass: `npm.cmd run format:check` and `git diff --check`

#### Manual Verification:

- Inspect the workflow checkout paths and confirm only base-SHA automation receives the provider secret and write-capable token; no head-controlled script or action is executed.
- Confirm a fork PR, a Dependabot PR, and a non-`ai-cr:review` label event are visibly skipped by job conditions without attempting a provider call.
- Confirm GitHub recognizes `../.github/workflows/review.yml` from the actual repository root and no nested duplicate workflow/action remains.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Document Operations and Prove the Live Integration

### Overview

Document setup, cost/security boundaries, status semantics, and recovery, then run the only proof that can establish real OpenRouter and GitHub integration: a controlled same-repository pull request.

### Changes Required:

#### 1. Operator documentation

**Files**: `README.md`, `packages/code-reviewer/README.md`

**Intent**: Make repository configuration and day-to-day operation copy-pasteable without documenting secret values.

**Contract**: Document the `OPENROUTER_API_KEY` repository secret name and configuration location, the four labels and their meanings/colors, automatic events, 8,000-character body limit, 100-KiB diff fail-closed policy, score thresholds, advisory result semantics, fork/Dependabot skip, retry procedure, concurrency/stale-run behavior, failure categories, and package-local verification commands. Preserve the existing Cloudflare deployment ownership statement.

#### 2. Workflow intent comments and troubleshooting

**Files**: `../.github/workflows/review.yml`, `../.github/actions/ai-pr-review/action.yml`, `README.md`

**Intent**: Explain the non-obvious trust separation and provide recovery steps for provider, malformed-output, permission, label, and comment failures.

**Contract**: YAML comments explain why base and head use separate paths and why forks/Dependabot are skipped, without restating syntax. Troubleshooting directs maintainers to workflow logs, `ai-cr:error`, and re-adding `ai-cr:review`; it does not suggest exposing or copying the secret.

#### 3. Final regression and live acceptance

**Files**: verification-only; no production deployment files

**Intent**: Re-run deterministic checks, then validate the provider and GitHub side effects on a real test PR without overstating what mocks prove.

**Contract**: Use a same-repository PR targeting `master` with a small, known reviewable change. Verify automatic review, update-in-place comment, score/verdict policy, exactly one result label, retry consumption, concurrent/stale-run behavior, and redacted logs. Exercise a controlled provider failure only if it can be done without exposing or invalidating the production credential.

### Success Criteria:

#### Automated Verification:

- Root static quality gates pass: `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run test:unit`, `npm.cmd run lint`, and `npm.cmd run build`
- Clean package installation and package-local gates pass: `npm.cmd --prefix packages/code-reviewer ci`, `npm.cmd --prefix packages/code-reviewer test`, and `npm.cmd --prefix packages/code-reviewer run typecheck`
- Documentation and YAML contain no secret values, deprecated placeholder action, nested duplicate workflow, or deployment command.
- Final repository diff passes `git diff --check` and contains only the approved change scope.

#### Manual Verification:

- A same-repository test PR to `master` automatically produces one marked comment for the current head SHA and exactly one correct `ai-cr:passed` or `ai-cr:failed` label.
- Adding `ai-cr:review` removes the command label, reruns review, updates the same comment instead of duplicating it, and leaves one result label.
- A negative review remains advisory and the workflow succeeds; a controlled operational failure produces `ai-cr:error` and a failed workflow without exposing credentials.
- Rapid updates or retry cannot leave an older head's result as the current comment/label state, and the live logs contain no provider or GitHub token.
- Confirm Cloudflare deployment configuration and behavior were not changed by this workflow.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- Validate every score at 1, 5, 7, and 10 boundaries and reject zero, eleven, fractions, missing criteria, and undeclared fields.
- Verify body truncation at exactly 8,000 characters and patch acceptance/rejection at exactly 100 KiB.
- Preserve multiline, Unicode, Markdown, shell-looking, and prompt-injection content as inert delimited data.
- Cover all deterministic verdict combinations, including average boundary, per-criterion floor, and severity-error override.
- Test comment escaping, stable-marker uniqueness, deterministic rendering, and head-SHA visibility.
- Test label convergence from every stale combination and ensure unrelated labels remain unchanged.

### Integration Tests:

- Use `MockLanguageModelV4`, real schemas/prompts/tools, and a disposable repository to prove scored structured output without credentials.
- Use injected Git and GitHub fakes to cover event parsing, diff acquisition, comment creation/update, label creation/replacement, retry, stale head, pagination, and partial API failures.
- Parse the real workflow and composite-action YAML to verify the static contract without claiming runner-level proof.
- Retain all existing generic reviewer and repository sandbox tests unchanged.

### Manual Testing Steps:

1. Configure the `OPENROUTER_API_KEY` repository secret and required labels without placing any secret value in the checkout.
2. Open a small same-repository PR targeting `master` and verify the automatic workflow uses the current head SHA.
3. Inspect the single marked comment, all three scores, average/threshold explanation, findings, and the exclusive result label.
4. Push another commit and confirm `synchronize` cancels or supersedes the older run and updates the same comment.
5. Add `ai-cr:review` and confirm it is consumed immediately and produces another in-place update.
6. Confirm fork and Dependabot PR contexts are skipped without attempting the provider call.
7. Exercise a safe provider failure and confirm workflow/error semantics and log redaction.
8. Verify no workflow step deploys or changes the Cloudflare Worker.

## Performance Considerations

The PR body is bounded to 8,000 characters and the textual patch to 100 KiB. Over-limit diffs fail closed instead of generating incomplete scores or unpredictable provider cost. Existing repository reads remain capped at 256 KiB per file and searches at 50 matches. Per-PR concurrency cancels superseded runs, and default tests never make paid calls. No response cache is introduced because review results are tied to an exact head SHA and the retry command intentionally permits reevaluation.

## Migration Notes

This is an additive runtime path for `packages/code-reviewer`; the existing generic public schema, `start` script, CLI, and imports remain compatible. The new `review:pr` script and PR-specific exports are added without turning the root project into an npm workspace.

Move the nested workflow/action stubs to the actual Git root rather than copying them and leaving duplicates. Repository settings must contain `OPENROUTER_API_KEY`; the implementation may create missing labels at runtime, but a maintainer should verify their colors and descriptions before live acceptance. No database or deployment migration is required.

Rollback consists of disabling/removing the repository-root review workflow and restoring no replacement for the obsolete nested stubs. The reviewer package's additive PR modules can remain inert without the workflow, but should be reverted together if the feature is abandoned.

## References

- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Related research: `context/changes/ci-cd-code-review/research.md`
- Current workflow stub: `.github/workflows/review.yml:4-16`
- Current composite-action stub: `.github/actions/ai-pr-review/action.yml:10-30`
- Package scripts and Node boundary: `packages/code-reviewer/package.json:6-24`
- Generic CLI contract: `packages/code-reviewer/src/cli.ts:12-33`
- Generic reviewer factory: `packages/code-reviewer/src/agent/reviewer.ts:12-48`
- Findings-only schema: `packages/code-reviewer/src/schemas/code-review.ts:3-50`
- Findings-only prompt: `packages/code-reviewer/src/prompts/code-review.ts:3-17`
- Repository access boundaries: `packages/code-reviewer/src/tools/repository.ts:6-296`
- Root CI/package separation: `.github/workflows/ci.yml:10-58`
- Deployment ownership: `README.md:116-149`
- GitHub workflow triggers: `https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow`
- GitHub workflow permissions: `https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax`
- GitHub concurrency: `https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency`
- GitHub secure use: `https://docs.github.com/en/actions/reference/security/secure-use`
- GitHub fork behavior: `https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflows-in-forked-repositories`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Define the PR Review Contract and Decision Policy

#### Automated

- [x] 1.1 PR schema boundary and normalization tests pass — b792763
- [x] 1.2 Prompt and injected-reviewer tests pass without credentials or network access — b792763
- [x] 1.3 Verdict tests cover score averages, minimum-score boundaries, and error-finding override — b792763
- [x] 1.4 Existing generic reviewer tests remain unchanged and pass — b792763
- [x] 1.5 Package type checking passes — b792763

#### Manual

- [x] 1.6 Confirm the PR-specific schema expresses only the three approved criteria and does not modify the generic `{ findings }` API — b792763
- [x] 1.7 Review representative prompts containing Markdown, shell-looking text, and prompt-injection text and confirm all PR-controlled content remains visibly delimited as data — b792763

### Phase 2: Implement Idempotent GitHub Orchestration

#### Automated

- [x] 2.1 Event and diff tests cover normal, empty, binary, deleted, submodule, force-pushed, malformed, and oversized inputs — 2bace67
- [x] 2.2 Comment and label tests prove stable-marker upsert and convergence to one result label — 859402a
- [x] 2.3 GitHub client tests cover pagination, create/update, label creation, redacted errors, and API failures — 859402a
- [x] 2.4 Orchestrator and CLI tests cover pass, fail, malformed model output, provider failure, GitHub failure, retry consumption, irrelevant labels, idempotent rerun, and stale-head rejection — 859402a
- [x] 2.5 Full package tests and type checking pass — 859402a

#### Manual

- [x] 2.6 Inspect rendered fixtures for passed, failed, and error outcomes and confirm the status, reviewed SHA, scores, findings, and retry guidance are unambiguous — 859402a
- [x] 2.7 Review fake-client call traces and confirm human comments and unrelated labels are never mutated and no secret-like value appears in output — 859402a

### Phase 3: Wire the Trusted Composite Action and Repository-Root Workflow

#### Automated

- [x] 3.1 Workflow contract tests confirm the required triggers, filters, permissions, concurrency, paths, and trusted checkout layout — 9ecd853
- [x] 3.2 Contract tests prove `twoj-zespol/ai-reviewer@<sha>` and `dist/review.js` are absent and the local action inputs/outputs are wired consistently — 9ecd853
- [x] 3.3 Clean package installation, full package tests, and package type checking pass — 9ecd853
- [x] 3.4 Repository formatting and diff hygiene pass — 9ecd853

#### Manual

- [x] 3.5 Inspect the workflow checkout paths and confirm only base-SHA automation receives the provider secret and write-capable token; no head-controlled script or action is executed — 9ecd853
- [x] 3.6 Confirm a fork PR, a Dependabot PR, and a non-`ai-cr:review` label event are visibly skipped by job conditions without attempting a provider call — 9ecd853
- [x] 3.7 Confirm GitHub recognizes `../.github/workflows/review.yml` from the actual repository root and no nested duplicate workflow/action remains — 9af06d9

### Phase 4: Document Operations and Prove the Live Integration

#### Automated

- [x] 4.1 Root static quality gates pass — 9af06d9
- [x] 4.2 Clean package installation and package-local gates pass — 9af06d9
- [x] 4.3 Documentation and YAML contain no secret values, deprecated placeholder action, nested duplicate workflow, or deployment command — 9af06d9
- [x] 4.4 Final repository diff passes `git diff --check` and contains only the approved change scope — 9af06d9

#### Manual

- [x] 4.5 A same-repository test PR to `master` automatically produces one marked comment for the current head SHA and exactly one correct `ai-cr:passed` or `ai-cr:failed` label — 9af06d9
- [x] 4.6 Adding `ai-cr:review` removes the command label, reruns review, updates the same comment instead of duplicating it, and leaves one result label — 9af06d9
- [x] 4.7 A negative review remains advisory and the workflow succeeds; a controlled operational failure produces `ai-cr:error` and a failed workflow without exposing credentials — 9af06d9
- [x] 4.8 Rapid updates or retry cannot leave an older head's result as the current comment/label state, and the live logs contain no provider or GitHub token — 9af06d9
- [x] 4.9 Confirm Cloudflare deployment configuration and behavior were not changed by this workflow — 9af06d9
