<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Diagnosis Quality Rubric

- **Plan**: `context/changes/diagnosis-quality-rubric/plan.md`
- **Scope**: Phases 1-4 of 4
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Verification

- `Test-Path context\changes\diagnosis-quality-rubric` passed.
- `Test-Path context\changes\diagnosis-quality-rubric\change.md` passed.
- `Test-Path context\changes\diagnosis-quality-rubric\reference` passed.
- `Test-Path context\changes\diagnosis-quality-rubric\reference\diagnosis-quality-rubric.md` passed.
- `Test-Path context\changes\diagnosis-quality-rubric\reference\diagnosis-evaluation-cases.json` passed.
- `Test-Path context\changes\diagnosis-quality-rubric\reference\contract-surfaces.md` passed.
- `rg "0/1/2|case threshold|critical failure" context\changes\diagnosis-quality-rubric\reference\diagnosis-quality-rubric.md` passed.
- `rg "mixed-scope|out-of-scope|agar|grain|follow-up" context\changes\diagnosis-quality-rubric\reference\diagnosis-quality-rubric.md` passed.
- `node -e "JSON.parse(require('fs').readFileSync('context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json','utf8')); console.log('ok')"` passed with `ok`.
- `node -e "const c=JSON.parse(require('fs').readFileSync('context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json','utf8')); if(!Array.isArray(c.cases)||c.cases.length!==10) process.exit(1); console.log(c.cases.length)"` passed with `10`.
- `rg "diagnosis-quality-rubric|diagnosis-evaluation-cases" context\changes\diagnosis-quality-rubric\reference\contract-surfaces.md` passed.
- `rg -n "diagnosis-quality-rubric|diagnosis-evaluation-cases" src` returned no matches, confirming no diagnosis runtime references were added under `src`.
- `npm run lint` passed. It emitted the existing `astro-eslint-parser` `projectService` notice.
- `npm run build` passed with the Cloudflare adapter.

## Findings

### F1 - Roadmap ID drift in plan

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/diagnosis-quality-rubric/plan.md:9`
- **Detail**: The current roadmap identifies `diagnosis-quality-rubric` as `F-03`, while the plan still calls it `F-02` in several places. `plan-brief.md` already uses `F-03`, so the artifacts disagree.
- **Fix**: Update the diagnosis-quality-rubric roadmap references in `plan.md` from `F-02` to `F-03`.
- **Decision**: FIXED - Updated diagnosis-quality-rubric roadmap references in `plan.md` from `F-02` to `F-03`.

### F2 - Completed progress commands use stale artifact paths

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/diagnosis-quality-rubric/plan.md:276`
- **Detail**: The actual files live under `reference/`, but several completed Progress checkboxes record commands without that segment, for example rubric checks at lines 288-290, case-file check at line 303, and contract-surface checks at lines 318-319. The phase body has the correct paths.
- **Fix**: Rewrite the Progress command text to match the final `reference/...` paths while preserving the commit evidence.
- **Decision**: FIXED - Updated Progress command paths in `plan.md` to use the final `reference/...` artifact locations.

### F3 - Active change paths are brittle as future canonical references

- **Severity**: OBSERVATION
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md:7`
- **Detail**: `contract-surfaces.md` correctly points to active `context/changes/...` paths today. If this change is archived before `selected-log-diagnosis` consumes it, those canonical references become stale, and repo rules forbid modifying archived changes.
- **Fix Recommended**: Add a short archive-path caveat or durable foundation pointer before archiving this change.
  - Strength: Preserves the current handoff while reducing future lookup drift.
  - Tradeoff: Slightly more process/documentation overhead before archive.
  - Confidence: HIGH - this file exists specifically as a future handoff surface.
  - Blind spot: I did not inspect the future S-02 plan beyond current references.
- **Decision**: FIXED - Added an archive-path caveat to `contract-surfaces.md` for future selected-log diagnosis handoff.

## Triage Summary

- **Fixed**: F1, F2, F3
- **Skipped**: None
- **Accepted**: None
- **Remaining pending decisions**: None
