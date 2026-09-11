<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Pull Request AI Code Review Implementation Plan

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Phase 2 of 4
- **Date**: 2026-09-11
- **Verdict**: REJECTED
- **Findings**: 1 critical, 6 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | WARNING |
| Safety & Quality    | FAIL    |
| Architecture        | WARNING |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Findings

### F1 — Raw exception text can leak secrets into a public PR comment

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/pull-request/orchestrator.ts:67
- **Detail**: The orchestrator forwards arbitrary `error.message` text to the comment renderer. The regex in `comment.ts:15-16` only redacts simple `token=...`, `secret=...`, or `authorization=...` forms; it does not safely cover bearer headers, quoted JSON credentials, `apiKey`, provider payloads, or the exact configured secret value. Tests use only regex-friendly examples. This violates the plan's requirement that operational comments contain an allowlisted, redacted technical category and no secret/provider payload.
- **Fix**: Publish an allowlisted operational category instead of exception text; retain detailed errors only in controlled logs with value-based and format-aware redaction.
  - Strength: Removes arbitrary provider/GitHub payloads from the public-comment boundary by construction.
  - Tradeoff: Requires a small error-classification contract and corresponding tests across the orchestrator and CLI.
  - Confidence: HIGH — the raw dataflow is direct and the current regex has demonstrable bypass forms.
  - Blind spot: Provider-specific error shapes have not been exercised live.
- **Decision**: FIXED — typed allowlisted operational failure codes and safe metadata; raw exception text removed from PR comments

### F2 — Failure publication bypasses stale-head protection

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/pull-request/orchestrator.ts:59
- **Detail**: The current-head check runs only after successful reviewer generation at lines 53-55. If a provider/schema/reviewer failure occurs after a new head is pushed, the catch path at lines 59-68 can still overwrite the marked comment and result labels with `ai-cr:error` for the obsolete head. The stale-head test covers only the success path.
- **Fix**: Re-check the current head before every publication, including error publication, and fail closed without mutation if the check fails or the SHA differs.
  - Strength: Enforces the plan's state-sequencing invariant uniformly for success and failure.
  - Tradeoff: A GitHub head-lookup outage will leave only a failed workflow log, without an error comment or label.
  - Confidence: HIGH — the catch path calls `publish` without a head check.
  - Blind spot: None significant.
- **Decision**: FIXED — current head is re-checked before failure publication; stale or unverifiable heads fail closed without comment or result-label mutation

### F3 — Input failures bypass the orchestrator error boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: packages/code-reviewer/src/pull-request/cli.ts:23
- **Detail**: The CLI eagerly calls `createPullRequestReviewRequest` before invoking the orchestrator, then injects an already-resolved request at lines 29-30. Malformed events and Git/diff failures therefore reject `runPullRequestCli` rather than flowing through orchestration, returning its promised numeric result, or attempting the plan's input-error publication. The direct entrypoint at lines 42-45 also has no rejection handler.
- **Fix**: Split minimal event identity parsing from diff acquisition, construct the GitHub client from that validated identity, and let the orchestrator acquire the full request inside its error boundary.
  - Strength: Preserves enough PR identity to attempt a categorized error update while keeping all acquisition failures inside one coordinator.
  - Tradeoff: Introduces a small two-stage input contract and requires CLI/orchestrator test updates.
  - Confidence: HIGH — the eager call is visibly outside the orchestrator's try/catch.
  - Blind spot: The Phase 3 action's final output contract may impose additional CLI constraints.
- **Decision**: FIXED — split minimal PR identity from full request acquisition; diff/input failures now remain inside orchestration and the CLI returns controlled numeric failures

### F4 — Binary file contents are embedded in the bounded patch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/pull-request/input.ts:121
- **Detail**: `git diff --binary` emits `GIT binary patch` payloads. The plan requires binary files to be represented explicitly without binary content; encoded payloads can also make an otherwise reviewable PR exceed the 100 KiB limit.
- **Fix**: Remove `--binary`, retain binary flags in the changed-file manifest, and add a real-repository fixture proving no binary payload reaches the request.
- **Decision**: FIXED — removed `--binary`; a disposable-repository test proves binary metadata is retained without `GIT binary patch` payload

### F5 — Diff metadata parsing misses submodules and special filenames

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/pull-request/input.ts:40
- **Detail**: Submodules are detected only when the raw record starts with old mode `160000`, so newly added submodules and regular-file-to-submodule type changes are missed. In addition, `--numstat` and `--raw` are parsed as newline/tab text while only `--name-status` is NUL-delimited, so quoted paths, tabs/newlines, and renamed binary paths can fail to match the manifest.
- **Fix**: Request and parse `--numstat -z` and `--raw -z`, treating either old or new mode `160000` as a submodule, then cover added/modified/deleted submodules and unusual filenames.
  - Strength: Makes the manifest lossless using Git's machine-readable delimiters and satisfies the submodule contract.
  - Tradeoff: Requires a careful parser rewrite and real Git fixtures rather than string-only stubs.
  - Confidence: HIGH — added-submodule raw records start with old mode `000000`, which the current predicate excludes.
  - Blind spot: Git's combined-diff format for unresolved merges remains outside the reviewed happy path.
- **Decision**: FIXED — switched raw and numstat parsing to NUL-delimited records, detect either gitlink mode, and covered gitlink lifecycle, binary rename, unusual paths, and force-pushed heads

### F6 — Rendered summaries omit required evidence and error metadata

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/pull-request/comment.ts:29
- **Detail**: Normal comments render scores and findings but never render criterion rationales or evidence. The operational-error early return renders only marker, heading, raw-derived category, and retry guidance; it omits the reviewed head SHA and diff metadata. This contradicts the stable-comment contract and makes the checked manual fixture claim incomplete.
- **Fix**: Render bounded rationale/evidence for each criterion and pass explicit request identity/diff metadata into the operational-error renderer, using `not available` only where acquisition genuinely failed.
  - Strength: Makes the comment independently auditable and aligns pass, fail, and error fixtures with the plan.
  - Tradeoff: Comments become longer and error rendering needs a typed context distinct from model output.
  - Confidence: HIGH — the result contains rationale/evidence, but no renderer branch reads them.
  - Blind spot: The desired maximum comment length is not specified.
- **Decision**: FIXED — normal comments now render all schema-bounded criterion rationales and file/line evidence; F1 already added typed operational metadata

### F7 — Checked Progress claims materially exceed committed test coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: packages/code-reviewer/src/pull-request/input.test.ts:29
- **Detail**: The requested commands passed at review time, but several scenarios named by the automated criteria were not present. `input.test.ts` lacked submodule and force-push coverage; `github-client.test.ts` did not exercise comment create/update, head, or label mutation methods through the client; `orchestrator.test.ts` lacked failed advisory verdict, malformed model output, GitHub mutation failure, and stale failure-path cases; `cli.test.ts` tested only missing execution inputs. Progress items 2.1-2.4 therefore claimed broader automated coverage than the committed tests demonstrated. Manual items 2.6-2.7 are not part of this finding: the plan requires human inspection, not a separate persisted evidence artifact.
- **Fix**: Add the missing automated behavioral cases before keeping Progress 2.1-2.4 checked, or uncheck only the criteria whose named coverage remains absent.
  - Strength: Converts the phase gate from command-success evidence into proof of the behaviors the plan names.
  - Tradeoff: Requires several new fixtures and may expose additional production defects before Phase 3.
  - Confidence: HIGH — the absence is directly verifiable in the committed test files.
  - Blind spot: The review does not independently repeat the completed human inspection in items 2.6-2.7.
- **Decision**: FIXED — expanded comment, label, GitHub-client, orchestrator, and CLI coverage; Progress 2.1 was reverified after F5 coverage landed in 2bace67

### F8 — Concurrent PRs can race while creating repository labels

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/pull-request/github-client.ts:71
- **Detail**: Two PR runs can both observe a missing repository-global label and race to create it. Per-PR concurrency does not serialize different PRs, so one run can fail on GitHub's already-exists response.
- **Fix**: Preserve HTTP status/error identity and treat the specific already-exists conflict as success, or re-read the label after that conflict.
- **Decision**: PENDING

### F9 — Phase 2 adds an undocumented public API expansion

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: packages/code-reviewer/src/index.ts:9
- **Detail**: Phase 2 adds public barrel exports for the orchestrator, input adapter, comment renderer, and marker although `src/index.ts` is not listed in the phase's planned files. The exports are related and low-risk, but they expand the supported package surface without a stated consumer or contract.
- **Fix**: Remove the exports until a public consumer requires them, or document the barrel expansion in the phase plan before retaining it.
- **Decision**: PENDING
