<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Runtime Failure And Smoke Layer Implementation Plan

- **Plan**: context/changes/testing-runtime-failure-smoke-layer/plan.md
- **Scope**: Phase 4 of 5
- **Date**: 2026-08-14
- **Verdict**: APPROVED
- **Findings**: 1 critical, 0 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Full E2E suite fails during Playwright collection

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts:7
- **Detail**: The risk spec imports `seed.spec.ts`, which Playwright discovers as a test file. The required single-spec command passes, but the unfiltered `npm.cmd run test:e2e` used by `.github/workflows/ci.yml:54` fails before running tests with `Error: test file "grow-log-bulk-delete-ssr-persistence.spec.ts" should not import test file "seed.spec.ts"`. This breaks Phase 4 criterion 4.7 and the promoted CI gate. The harness still completed exact fixture and auth cleanup after the failure.
- **Fix A ⭐ Recommended**: Rename the reusable seed helper to a non-test module such as `tests/e2e/seed.ts`, then update the import and plan/rules/prompt references.
  - Strength: Removes Playwright discovery ambiguity while preserving the one reviewed business-risk test and reusable exemplar code.
  - Tradeoff: Changes the planned `seed.spec.ts` filename and requires coordinated reference updates.
  - Confidence: HIGH — the failure is caused directly by importing a filename matched by Playwright test discovery.
  - Blind spot: The renamed helper and all updated references still need both filtered and unfiltered E2E verification.
- **Fix B**: Keep `seed.spec.ts` as a real independently runnable exemplar test and move only its reusable UI helper into a non-test helper module.
  - Strength: Preserves the planned seed filename and gives it valid Playwright test semantics.
  - Tradeoff: Adds another browser scenario to the normal suite, broadening the deliberately narrow Phase 4 runtime and maintenance cost.
  - Confidence: MEDIUM — it resolves the import rule, but the extra seed scenario must be designed and reviewed without duplicating or diluting the risk spec.
  - Blind spot: The plan does not define a separate seed-test business risk or its assertions.
- **Decision**: FIXED via Fix A — renamed the reusable seed helper to `tests/e2e/seed.ts` and updated all code and planning references.
- **Resolution evidence**: Filtered E2E PASS (2 tests), full unfiltered E2E PASS (2 tests), canonical typecheck PASS (0 errors), and exact cleanup completed in both browser runs.

### F2 — Transient and headed verification has no durable evidence

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-runtime-failure-smoke-layer/plan.md:446
- **Detail**: Progress marks the deliberate-break check (4.6) and headed manual run (4.9) complete, but the Phase 4 diff contains no durable command/result note or other observable evidence for those transient checks. The implementation and current green single-spec run support the surrounding claims, but this review cannot independently audit 4.6 or 4.9 from the checkout.
- **Fix**: Record a concise verification note identifying the deliberate break used, its expected failure, the restored green run, and the headed manual observation.
- **Decision**: FIXED — recovered the original Phase 4 session evidence and recorded the baseline, deliberate-break failure, restored green run, and headed manual confirmation in the plan.
- **Resolution evidence**: The recovered log shows the deliberate break disabled the production bulk-delete call while retaining success feedback; the spec failed with expected selected-title count `0` and received `1`, cleanup completed, the break was reverted with no remaining production diff, the spec returned to `2 passed`, and the headed run completed with `2 passed` plus operator confirmation.

## Verification Evidence

- `npm.cmd run test:e2e -- tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts` — PASS; setup plus Chromium risk spec, 2 passed, exact cleanup completed.
- `npm.cmd run typecheck` — PASS; 0 errors, 0 warnings, 4 informational deprecation hints.
- `npm.cmd run test:e2e` — FAIL; Playwright rejects the import of discovered test file `seed.spec.ts`; exact cleanup completed.
- Static review confirmed the intended locator, unique-data, state-wait, dialog, cleanup, local-only CI, and SSR reload contracts. No security, credential-targeting, data-safety, architecture, or substantive pattern violation was found.
