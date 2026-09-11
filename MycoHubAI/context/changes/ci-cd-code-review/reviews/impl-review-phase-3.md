<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Pull Request AI Code Review Implementation Plan

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Phase 3 of 4
- **Date**: 2026-09-12
- **Verdict**: REJECTED
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | FAIL    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Findings

### F1 — PR-controlled workflow can exfiltrate the review credentials

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: ../.github/workflows/review.yml:3
- **Detail**: The workflow runs on `pull_request` and the secret-bearing job receives `OPENROUTER_API_KEY` plus a `GITHUB_TOKEN` with pull-request and issue write permissions at lines 12-15 and 47-55. GitHub runs a `pull_request` workflow in the pull request merge-ref context. For a same-repository PR—the exact case allowed by lines 23-26—the PR can modify this workflow definition and replace the trusted-checkout steps before the base-SHA action is invoked. Checking out the action from the base SHA therefore protects the action code but not the privileged workflow that chooses what runs. This also means the Phase 3 plan itself encoded an unsafe trust boundary.
- **Fix A ⭐ Recommended**: Change the privileged workflow to a rigorously constrained `pull_request_target` design, retain the data-only head checkout, and update the plan and contract tests to prove no head-controlled code is executed.
  - Strength: The workflow definition comes from the base/default branch and the existing base-trusted, data-only architecture can remain largely intact.
  - Tradeoff: `pull_request_target` is privileged by design, so every future step must preserve the prohibition on executing or building head-controlled content.
  - Confidence: HIGH — GitHub documents that `pull_request_target` runs in the default-branch context specifically to avoid executing a PR-controlled workflow definition.
  - Blind spot: Repository or organization workflow-execution protections were not verified; they could mitigate the current design but are not represented in this repository.
- **Fix B**: Split the flow into an unprivileged `pull_request` producer and a base-trusted `workflow_run` consumer that validates and treats all transferred data as untrusted.
  - Strength: Creates a stronger explicit separation between PR-controlled execution and the secret/write-capable publisher.
  - Tradeoff: Adds another workflow, artifact/event correlation, validation, and cache/artifact-poisoning risks that must be designed and tested.
  - Confidence: MED — the pattern is supported, but the extra protocol has a wider implementation and verification surface than this phase planned.
  - Blind spot: The exact artifact-free handoff design and retry behavior have not been specified.
- **Decision**: SKIPPED

### F2 — Structural tests do not enforce the security-critical action contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: packages/code-reviewer/src/pull-request/workflow-contract.test.ts:44
- **Detail**: The job gate is checked only with four `toContain` assertions at lines 44-52, so appending `|| true` would still pass while allowing fork, Dependabot, and arbitrary-label events into the secret-bearing job. The output check at lines 86-119 verifies the declared output metadata and environment mapping but does not assert the `npm ci`, `review:pr`, Node-version, or `$GITHUB_OUTPUT` producer commands. The current YAML implements those behaviors, but the claimed deterministic contract test would not catch their removal or bypass.
- **Fix**: Assert the complete normalized job condition (or evaluate representative event fixtures) and assert the parsed action steps include the pinned Node version, package-local `npm ci`, `review:pr` invocation, and actual `result` emission to `$GITHUB_OUTPUT`.
- **Decision**: FIXED

### F3 — GitHub-recognition criterion is complete only locally

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/ci-cd-code-review/plan.md:412
- **Detail**: Progress marks criterion 3.7 complete, but the checkout reports `master...origin/master [ahead 11]`. `git ls-tree origin/master` still shows `MycoHubAI/.github/workflows/review.yml` and no repository-root review workflow/action, while only local `HEAD` contains the root files. The diff proves the intended move locally, but GitHub cannot yet recognize the unpushed root workflow, so the external part of the manual claim lacks evidence.
- **Fix**: Return 3.7 to pending until the commits are pushed and GitHub visibly recognizes the repository-root workflow with no nested duplicate; then record that evidence and mark it complete.
- **Decision**: FIXED

## Verification Evidence

### Automated

| Command                                                                                      | Result | Evidence                                   |
| -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------ |
| `npm.cmd --prefix packages/code-reviewer ci`                                                 | PASS   | Added 63 packages; exit code 0.            |
| `npm.cmd --prefix packages/code-reviewer test -- src/pull-request/workflow-contract.test.ts` | PASS   | 1 test file, 5 tests passed.               |
| `npm.cmd --prefix packages/code-reviewer test`                                               | PASS   | 21 test files, 132 tests passed.           |
| `npm.cmd --prefix packages/code-reviewer run typecheck`                                      | PASS   | `tsc --noEmit`; exit code 0.               |
| `npm.cmd run format:check`                                                                   | PASS   | All matched files use Prettier code style. |
| `git diff --check 9ecd853^..794eeed`                                                         | PASS   | No output; exit code 0.                    |

Vitest emitted a non-failing warning that `vitest.config.ts` uses `__dirname`, which is incompatible with Vite's planned future native config loader default. It is outside the Phase 3 implementation scope.

### Manual

- 3.5: Static repository evidence supports the base-SHA action/head-data separation, but F1 shows the workflow-definition trust boundary remains unsafe.
- 3.6: The job condition visibly contains same-repository, Dependabot, and retry-label gates; F2 shows the test does not enforce the complete expression.
- 3.7: Nested files are absent from local `HEAD`, but remote recognition is not established; see F3.

## Scope Evidence

- Reviewed implementation range: `9ecd853^..794eeed`.
- `src/pull-request/cli.ts` and `cli.test.ts` were not named in the Phase 3 file list, but their `REPOSITORY_ROOT` handoff and stdout serialization directly support the planned target-path and action-output contracts; they are justified supporting changes, not unrelated scope creep.
- No archived paths or deployment files were changed.
