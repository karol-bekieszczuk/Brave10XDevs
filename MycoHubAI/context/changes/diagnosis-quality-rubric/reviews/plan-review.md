<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Diagnosis Quality Rubric

- **Plan**: `context/changes/diagnosis-quality-rubric/plan.md`
- **Mode**: Deep (local verification)
- **Date**: 2026-05-28
- **Verdict**: SOUND
- **Open Findings**: 0
- **Initial Findings**: 1 critical, 3 warnings, 0 observations; all fixed in plan

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 3/3 existing paths pass, 3/3 planned-new paths pass, 6/6 symbols pass, brief-plan consistency pass.

## Resolved Findings

### F1 - Negative `rg` check will fail when it succeeds

- **Severity**: CRITICAL
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 automated verification, Progress 4.3
- **Detail**: The plan says `rg "diagnosis-quality-rubric|diagnosis-evaluation-cases" src` should return no matches. But `rg` exits with code 1 when it finds no matches, so a correct documentation-only implementation will look like a failed command to `/10x-implement`.
- **Fix**: Replace the command with a PowerShell negative assertion, e.g. `if (rg -q "diagnosis-quality-rubric|diagnosis-evaluation-cases" src) { exit 1 } else { exit 0 }`.
- **Decision**: FIXED - Applied fix in plan.

### F2 - PRD 75% target denominator is not explicit

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Desired End State, Phase 3
- **Detail**: The Desired End State promises future implementers will know "which cases count toward the 75% PRD target," but Phase 3 puts agar, grain, missing-context, mixed-scope, and fully out-of-scope cases into one 10-case file without requiring an explicit eligibility field. `scope_class` helps, but it does not settle whether guardrail/refusal cases are part of the diagnosis-correctness denominator.
- **Fix**: Add a required boolean such as `counts_toward_prd_accuracy` and explain in the rubric how the 75% target is computed.
  - Strength: Removes evaluator ambiguity before S-02.
  - Tradeoff: Slightly more schema detail in a documentation-first change.
  - Confidence: HIGH - the plan itself names this denominator as part of the end state.
  - Blind spot: Final evaluator design is not planned yet.
- **Decision**: FIXED - Applied fix in plan.

### F3 - Case JSON is machine-readable but under-specified

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 - Structured evaluation cases
- **Detail**: The plan says future evaluator work can consume the JSON, but only constrains `stage` values. It does not define types/enums for `scope_class`, `expected_signals`, `critical_missing_context`, or whether fields are strings, arrays, booleans, or objects. That leaves future agents to infer a schema.
- **Fix**: Add a compact "Case schema" contract with field types and allowed `scope_class` values before listing the 10-case coverage requirements.
  - Strength: Keeps the cases consumable without adding a test runner.
  - Tradeoff: More upfront specificity.
  - Confidence: HIGH - this is the exact boundary between readable examples and a stable artifact.
  - Blind spot: None significant.
- **Decision**: FIXED - Applied fix in plan with `stage` limited to `agar` or `grain`.

### F4 - Contract surfaces registry may be invisible to future scanners

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 4 - Contract surfaces registry
- **Detail**: The local plan-review convention extracts contract surface names from H2 headings in `docs/reference/contract-surfaces.md`. The plan only says to create a "concise reference registry" with entries, so an implementer could create a bullet-only file that humans can read but future tooling will not detect.
- **Fix**: Require H2 sections for each registered surface, e.g. `## Diagnosis Quality Rubric` and `## Diagnosis Evaluation Cases`, with the canonical path under each heading.
- **Decision**: FIXED - Applied fix in plan.

## Triage Summary

- Fixed: F1, F2, F3, F4
- Skipped: none
- Accepted: none
- Dismissed: none
- Verdict after fixes: SOUND
