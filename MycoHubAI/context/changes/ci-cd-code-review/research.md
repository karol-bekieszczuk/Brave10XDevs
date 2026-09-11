---
date: 2026-09-11T15:48:05.2213883+02:00
researcher: Codex
git_commit: 9056c96cf291f48c1f252e8ad91c2e8750411d7c
branch: master
repository: Brave10XDevs/MycoHubAI
working_tree: "untracked context/changes/ci-cd-code-review artifacts"
topic: "CI/CD code review based on requirements.md"
tags: [research, codebase, github-actions, code-reviewer, composite-action]
status: complete
last_updated: 2026-09-11
last_updated_by: Codex
---

# Research: CI/CD code review based on requirements.md

**Date**: 2026-09-11T15:48:05.2213883+02:00
**Researcher**: Codex
**Git Commit**: 9056c96cf291f48c1f252e8ad91c2e8750411d7c
**Branch**: master
**Repository**: Brave10XDevs/MycoHubAI

## Research Question

How should the repository implement the pull-request AI code-review workflow described in `context/changes/ci-cd-code-review/requirements.md`, and which existing components can be reused?

The requested outcome is a workflow for new pull requests targeting `master`, a composite action for the review, title/description/diff inputs, three scored criteria, a single summary comment, mutually exclusive result labels, and retry when `ai-cr:review` is added.

## Summary

The repository already contains a reusable, bounded, read-only AI reviewer and a draft PR workflow, but the end-to-end feature is not implemented. During this research, a concurrent commit authored outside this task advanced `master` from `3bfc51c` to `9056c96` and added the current composite-action stub. The metadata reflects the new HEAD. Because `9056c96` is one commit ahead of `origin/master`, references to its two changed files are local rather than GitHub permalinks; permalinks for unchanged files remain pinned to the published parent commit.

The current workflow is nonfunctional: it references `twoj-zespol/ai-reviewer@<sha>` rather than the new local action, passes an undeclared uppercase input, and the local action calls a missing `dist/review.js`. It does not implement PR metadata/diff acquisition, explicit permissions or concurrency, comment/label integration, or label-driven retry. The nested reviewer is a separate package with its own lockfile and checks, so a clean runner must install and validate that package explicitly.

The existing reviewer should remain the low-level evidence-gathering engine. Its public contract is intentionally findings-only and explicitly forbids scores, summaries, and verdicts. The new feature therefore needs a separate PR-review contract and orchestration layer that owns scored criteria, pass/fail policy, comment rendering/upsert, label reconciliation, event handling, and GitHub API failures.

Security is a first-class design constraint. The draft workflow checks out pull-request code and then executes repository-controlled code with `OPENROUTER_API_KEY`. A safe design must either execute only base-trusted automation while treating PR title/body/diff as untrusted data, or explicitly skip secret-backed review for untrusted forks. It must not combine `pull_request_target`, a privileged token/secrets, and execution of an untrusted PR checkout.

This workflow is GitHub review automation, not production deployment. The existing Cloudflare Workers Builds deployment ownership should remain unchanged.

## Detailed Findings

### 1. Current workflow does not reach the reviewer

- The workflow listens to pull requests targeting `master`, then checks out the repository and invokes `twoj-zespol/ai-reviewer@<sha>` (`.github/workflows/review.yml:4-16`). `<sha>` is a placeholder, so the action reference is not executable.
- The repository now contains a local composite action at `.github/actions/ai-pr-review/action.yml`, but the workflow does not reference `./.github/actions/ai-pr-review`.
- `packages/code-reviewer` is standalone: it has its own scripts, lockfile, dependencies, and Node `>=22` requirement ([`packages/code-reviewer/package.json:6`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/package.json#L6), [`packages/code-reviewer/package-lock.json:1`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/package-lock.json#L1)). The root package is not configured as an npm workspace, so the composite action needs an explicit package-local install.
- Node compatibility is not a blocker: `.nvmrc` specifies Node 24.15.0 and the reviewer requires Node 22 or newer ([`.nvmrc:1`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/.nvmrc#L1), [`packages/code-reviewer/package.json:12`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/package.json#L12)).

### 1a. Current composite-action stub is also not executable

- Commit `9056c96` adds `.github/actions/ai-pr-review/action.yml:1-30`, but the workflow does not use it. Instead, `.github/workflows/review.yml:13-16` references the placeholder remote action.
- The local action declares only `api-key` (`action.yml:10-13`), while the workflow passes `OPENROUTER_API_KEY` (`review.yml:15-16`). Composite-action inputs must be addressed by their declared input IDs.
- The local action ignores `inputs.api-key` and tries to read `${{ secrets.OPENROUTER_API_KEY }}` directly (`action.yml:27-30`). Secret transfer belongs at the calling workflow boundary; the action should receive it as an input or environment value without embedding the secret value in documentation or logs.
- The only run step calls `${{ github.action_path }}/dist/review.js` (`action.yml:25-30`), but no such file exists. It neither installs nor invokes `packages/code-reviewer`.
- The action exposes `steps.agent.outputs.verdict` (`action.yml:15-19`), but the run step never writes `verdict` to `$GITHUB_OUTPUT`. The existing reviewer also does not produce a verdict.
- The files still lack title/description/diff inputs, scoring outputs, comment/label operations, retry handling, permissions, concurrency, and tests. They are an incomplete draft, not end-to-end implementation evidence.

### 2. Reusable reviewer contract

- `createReviewer(model)` supports deterministic model injection; `Reviewer.generate()` receives both the prompt and a call-scoped `repositoryRoot` ([`packages/code-reviewer/src/agent/reviewer.ts:12`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/agent/reviewer.ts#L12)).
- `generateResponse()` lazily validates environment input and creates the configured OpenRouter model, keeping imports free of provider calls and secret reads ([`packages/code-reviewer/src/generate-response.ts:6`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/generate-response.ts#L6), [`packages/code-reviewer/src/config/environment.ts:3`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/config/environment.ts#L3)).
- The CLI accepts one free-form prompt assembled from argv, uses `process.cwd()` as the repository root, prints pretty JSON, and returns non-zero only when execution throws ([`packages/code-reviewer/src/cli.ts:12`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/cli.ts#L12)). It does not acquire a Git diff.
- Read-only repository tools reject absolute paths, traversal, symlink escape, binary files, and files over 256 KiB; search excludes `.git`, `node_modules`, and `dist` and caps results ([`packages/code-reviewer/src/tools/repository.ts:60`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/tools/repository.ts#L60), [`packages/code-reviewer/src/tools/repository.ts:196`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/tools/repository.ts#L196)).
- The agent permits one repository-tool round, then requires structured output within a three-step loop; provider retries are separately capped at two ([`packages/code-reviewer/src/agent/reviewer.ts:16`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/agent/reviewer.ts#L16)).

### 3. Input contract gaps

- Requirements identify PR title, optional/undecided description, and Git diff as inputs (`requirements.md:6-10`). The reviewer accepts only an unbounded free-form `prompt: string`; there are no separate fields, validation, or size limits ([`packages/code-reviewer/src/agent/reviewer.ts:12`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/agent/reviewer.ts#L12)).
- The CLI joins command-line arguments. This is a fragile transport for large, multiline diffs because it has no stdin/file/JSON request format, truncation strategy, or escaping contract ([`packages/code-reviewer/src/cli.ts:18`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/cli.ts#L18)).
- The README currently places diff acquisition on the caller and embeds the diff in the prompt ([`packages/code-reviewer/README.md:22`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/README.md#L22)). Repository tools expose file read/search, not Git execution ([`packages/code-reviewer/src/tools/repository.ts:284`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/tools/repository.ts#L284)).
- The workflow does not fetch or pass title, description, base/head SHAs, or a diff (`.github/workflows/review.yml:12-16`). Checkout has no explicit history or credential policy, so reliable base-to-head diff acquisition is not established by repository configuration.

### 4. Output contract conflicts with scored criteria

- Requirements define 1-10 scores for Documentation, Test coverage, and Test quality/reliability (`requirements.md:12-41`).
- The current result schema is strictly `{ findings }`, with severity, repository-relative file path, message, and optional line/suggestion ([`packages/code-reviewer/src/schemas/code-review.ts:3`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/schemas/code-review.ts#L3)).
- The system prompt explicitly forbids a verdict, summary, score, or other fields ([`packages/code-reviewer/src/prompts/code-review.ts:11`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/prompts/code-review.ts#L11)). The prompt also lacks the three requirement rubrics and their 1/5/10 anchors.
- CLI exit code cannot choose the result label: any valid structured result, including non-empty findings, exits successfully; exit 1 represents configuration/provider/schema failures ([`packages/code-reviewer/src/cli.ts:20`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/cli.ts#L20)).
- A deliberate new contract is required. The least disruptive option is to keep the generic findings-only API and add a PR-specific request/result plus deterministic policy outside it. Changing the existing public schema would be a breaking change and would invalidate its current prompt and tests.

### 5. GitHub orchestration remains missing

- No code creates or updates a PR comment, adds/removes labels, detects an existing bot comment, handles a GitHub API failure, or consumes `ai-cr:review`. The composite-action stub does not add any of this behavior.
- The workflow has no explicit `permissions:` block and no `concurrency:` group (`.github/workflows/review.yml:1-16`). Concurrent synchronizations/retries could race and leave stale comments or labels.
- There is no `labeled` retry route and no manual-dispatch fallback in the current workflow.
- Current GitHub documentation confirms that branch filters apply to the pull request's target branch, granular `permissions` should be declared explicitly, local composite actions declare inputs under `action.yml`, and PR commenting/labeling requires write-capable repository token permissions. It also warns that `pull_request_target` runs with base-repository trust and that executing untrusted PR code in that context is dangerous. See [GitHub workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [workflow syntax and permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [composite actions](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action), and [`pull_request_target` security](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).

### 6. Security and trust boundary

- The workflow checks out PR code and passes `OPENROUTER_API_KEY` to a placeholder action reference (`.github/workflows/review.yml:12-16`). The trust boundary is undefined. If this is changed to the local action, a same-repository PR could modify code executed from the checkout with the provider secret unless the workflow deliberately uses base-trusted automation.
- Standard `pull_request` runs from forks do not receive repository secrets other than a restricted token; Dependabot PRs are treated similarly. This means external PRs need an explicit skip/approval/two-workflow policy rather than an accidental provider failure. See [GitHub events for forked repositories](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflows-in-forked-repositories).
- A privileged `pull_request_target` workflow may safely label or comment only while it avoids running code from the untrusted head. Checking out the PR head and running its scripts with secrets/write token would cross the trust boundary.
- PR title, description, and diff are untrusted prompt content. They need clear delimiters and must not be interpolated into shell source. A structured request via stdin or file is preferable to argv interpolation.
- The repository read tools reduce filesystem escape risk, but they do not protect shell execution, GitHub mutations, prompt injection, or secret handling.
- Checkout uses a mutable major tag rather than an immutable commit SHA (`.github/workflows/review.yml:12`). Whether to pin actions by SHA should be an explicit supply-chain decision.

### 7. Tests: useful package coverage, missing orchestration coverage

- Package-local tests cover clean structured output, findings, malformed model output, tool use, loop exhaustion, provider/config error propagation, CLI failure, and repository sandbox boundaries ([`packages/code-reviewer/src/agent/reviewer.test.ts:34`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/agent/reviewer.test.ts#L34), [`packages/code-reviewer/src/tools/repository.test.ts:26`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/tools/repository.test.ts#L26)).
- These tests use an injected model and disposable repositories; they establish deterministic code behavior, not live OpenRouter or GitHub behavior ([`packages/code-reviewer/src/agent/reviewer.test.ts:1`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/src/agent/reviewer.test.ts#L1)).
- Root CI does not explicitly install or run the nested package checks ([`.github/workflows/ci.yml:18`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/.github/workflows/ci.yml#L18)). Root Vitest can discover nested tests in a checkout where package dependencies already exist, but a clean root `npm ci` does not install the standalone package. Package-local `npm ci`, `npm test`, and `npm run typecheck` remain the reliable boundary.
- Missing deterministic orchestration tests map directly to requirements: clean review, findings, scored output validation, malformed output, provider failure, GitHub API failure, stable comment update, mutually exclusive label replacement, retry-label handling, event input parsing, empty/oversized diff policy, and concurrency/stale-run behavior.
- A final live manual acceptance should call the real provider and update a real test PR comment/labels. That proves integration; mocks must not be presented as live proof.

### 8. Documentation gaps

- The package README accurately documents the existing findings-only API, shell-secret setup, root-aware invocation, diff prompting, output/errors, package checks, and Node requirement ([`packages/code-reviewer/README.md:3`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/README.md#L3)).
- `.env.example` exposes only safe variable names/placeholders ([`packages/code-reviewer/.env.example:1`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/packages/code-reviewer/.env.example#L1)).
- No README covers workflow setup, composite-action inputs, required repository permissions, the `OPENROUTER_API_KEY` repository secret, comment format, label semantics, retry operation, fork behavior, failure handling, or the manual acceptance boundary.
- The workflow contains no meaningful comment explaining its non-obvious trust and operational decisions. Its first-line filename comment only restates the file path (`.github/workflows/review.yml:1`).

## Requirements-to-Implementation Map

| Requirement              | Current evidence                                                    | Status / implication                                                                                                              |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| PRs targeting `master`   | `review.yml:4-6`                                                    | Partial: event exists, but job cannot invoke reviewer. Decide whether “new” means only `opened` or also `synchronize`/`reopened`. |
| Composite action         | Current stub calls missing JS and is not referenced by the workflow | Incomplete. Keep event/security policy in workflow and reusable execution/orchestration in action.                                |
| PR title                 | No acquisition or typed field                                       | Missing. Treat as untrusted data.                                                                                                 |
| PR description           | Marked `?? cost tradeoff`                                           | Decision required: include, omit, or truncate.                                                                                    |
| Git diff                 | Caller-generated only in README                                     | Missing in workflow. Define base/head, fetch, binary/deletion, and size policies.                                                 |
| Documentation score 1-10 | Existing prompt forbids scores                                      | New PR-specific schema/rubric required.                                                                                           |
| Test coverage score 1-10 | Existing prompt forbids scores                                      | New PR-specific schema/rubric required.                                                                                           |
| Test quality score 1-10  | Existing prompt forbids scores                                      | New PR-specific schema/rubric required.                                                                                           |
| PR summary comment       | No GitHub client/orchestration                                      | Missing. Define stable marker and create-or-update behavior.                                                                      |
| Exactly one result label | No label code                                                       | Missing. Remove stale result labels before adding one.                                                                            |
| Retry on `ai-cr:review`  | No event/filter                                                     | Missing. Define trigger, PR resolution, label consumption, and concurrency.                                                       |
| Failure behavior         | CLI fails only on operational errors                                | Define distinction between review failure and operational failure.                                                                |

## Architecture Insights

### Recommended responsibility split

1. **Workflow (`.github/workflows/review.yml`)**: trusted event selection, branch/activity filters, fork/trust policy, explicit least-privilege permissions, per-PR concurrency, checkout/ref acquisition, and safe transfer of event fields.
2. **Composite action (`.github/actions/code-review/action.yml`)**: declarative inputs, Node/package setup contract, package-local install, invocation of deterministic orchestration, and exported result needed by the workflow.
3. **PR-review orchestration module**: input validation and bounds, prompt construction, scored-output parsing, pass/fail policy, comment renderer/upsert, label reconciliation, retry-label cleanup, and injected reviewer/GitHub boundaries for tests.
4. **Existing `packages/code-reviewer` agent**: evidence-backed repository inspection and provider interaction. Preserve its generic findings-only public contract unless the change explicitly accepts a breaking schema migration.

### Important design properties

- Pass title/body/diff as data, not generated shell code. Prefer a JSON file or stdin to argv for multiline/large input.
- Keep scores and evidence in strict structured output; derive labels deterministically in code rather than asking the model to mutate GitHub or decide workflow control flow.
- Use a stable hidden marker to find and update one bot comment rather than posting duplicates.
- Reconcile result labels as a set: remove `ai-cr:passed` and `ai-cr:failed`, then add exactly one final label.
- Serialize by PR number and prevent an older run from overwriting a newer review.
- Separate “review result failed” from “automation/provider/GitHub failed”; the requirements currently use `ai-cr:failed` ambiguously.
- Keep paid live checks out of default unit tests. Use mocks for deterministic orchestration and a documented real-PR manual gate for the provider/GitHub integration.
- Do not add a deploy step. GitHub Actions remains validation/review automation; production deployment remains Cloudflare-owned ([`README.md:116`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/README.md#L116)).

## Code References

- `.github/workflows/review.yml:4-16` - current trigger and unusable placeholder action reference; commit is not pushed, so no GitHub permalink exists yet.
- `.github/actions/ai-pr-review/action.yml:1-30` - current incomplete local composite-action stub; commit is not pushed, so no GitHub permalink exists yet.
- `package.json:8-29` - root scripts; no `review` command or workspace.
- `packages/code-reviewer/package.json:6-24` - standalone package scripts, engine, and dependencies.
- `packages/code-reviewer/src/cli.ts:12-33` - argv prompt, repository-root selection, output, and exit behavior.
- `packages/code-reviewer/src/agent/reviewer.ts:12-48` - injectable agent and execution contract.
- `packages/code-reviewer/src/schemas/code-review.ts:3-23` - strict findings-only result.
- `packages/code-reviewer/src/prompts/code-review.ts:3-17` - evidence rules and explicit ban on scores/verdicts.
- `packages/code-reviewer/src/tools/repository.ts:60-296` - bounded read-only repository access.
- `packages/code-reviewer/src/agent/reviewer.test.ts:34-118` - structured output, tools, malformed output, and loop-budget tests.
- `packages/code-reviewer/src/tools/repository.test.ts:26-129` - filesystem boundary and deterministic search tests.
- `packages/code-reviewer/README.md:15-29` - current root-aware CLI and caller-supplied diff contract.
- `context/changes/ci-cd-code-review/requirements.md:1-55` - requested behavior and scoring rubrics; local uncommitted change artifact, so no commit permalink exists yet.

## Historical Context (from prior changes)

- The ToolLoopAgent change intentionally kept the package independent from root CI and excluded root workflow integration ([`context/changes/tool-loop-agent/plan.md:27`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/context/changes/tool-loop-agent/plan.md#L27)). The missing integration is therefore deferred scope, not evidence that the reviewer package is incomplete on its own.
- That plan chose credential-free deterministic mocks for structured output, malformed output, and loop exhaustion ([`context/changes/tool-loop-agent/plan.md:156`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/context/changes/tool-loop-agent/plan.md#L156)).
- Its completed manual gate proved a real OpenRouter call and repository-relative evidence, but not GitHub comment/label behavior ([`context/changes/tool-loop-agent/plan.md:329`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/context/changes/tool-loop-agent/plan.md#L329)).
- The archived quality-gates plan established that commands, proof boundaries, and failure handling must be documented accurately ([`context/archive/2026-08-31-quality-gates-and-cookbook/plan.md:29`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/context/archive/2026-08-31-quality-gates-and-cookbook/plan.md#L29)).

## Related Research

- [`context/archive/2026-08-06-testing-runtime-failure-smoke-layer/research.md:30`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/context/archive/2026-08-06-testing-runtime-failure-smoke-layer/research.md#L30) distinguishes deterministic mocked coverage, local runtime evidence, and deployed-service proof.
- [`context/archive/2026-06-15-testing-diagnosis-contract-hardening/research.md:38`](https://github.com/karol-bekieszczuk/Brave10XDevs/blob/3bfc51ceb1862d71ac697ff98496a065bdc151c9/MycoHubAI/context/archive/2026-06-15-testing-diagnosis-contract-hardening/research.md#L38) records the same separation between schema tests and live-provider validation.
- No prior `research.md` directly covers GitHub code-review orchestration.

## Open Questions

1. What does “every new pull request” mean: only `opened`, or also `reopened`, `ready_for_review`, and every `synchronize` update?
2. Is PR description included? If so, what character/token limit and truncation marker apply?
3. What is the diff contract: merge-base-to-head or event base SHA-to-head SHA, and how are force-pushes, deleted/binary files, submodules, generated files, and oversized diffs handled?
4. What scored output schema is required, and must every score include evidence tied to changed files?
5. How do three scores map to pass/fail: minimum, average, per-criterion threshold, or critical-finding override?
6. Does `ai-cr:failed` mean a negative code-review result, an operational/provider/GitHub failure, or both? If both, how does the comment distinguish them?
7. Should `ai-cr:review` be removed when retry starts, when it succeeds, or always in final cleanup?
8. What is the policy for fork and Dependabot PRs where the provider secret is unavailable: skip with neutral explanation, require maintainer approval, or use a split trusted workflow?
9. Should the bot comment be updated in place using a hidden marker, and what exact summary format is expected?
10. Are action dependencies pinned to immutable SHAs, or are approved major tags acceptable?
11. Is this AI review a required branch-protection check or advisory automation?

These questions materially affect the plan and should be decided before `/10x-plan` turns the research into implementation phases.
