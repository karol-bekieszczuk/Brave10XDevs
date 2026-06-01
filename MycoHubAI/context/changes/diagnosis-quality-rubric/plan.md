# Diagnosis Quality Rubric Implementation Plan

## Overview

Define the quality and safety contract for MycoHubAI diagnosis before the selected-log diagnosis feature is implemented. This change creates a readable rubric and a structured evaluation case set so future diagnosis work can be checked against scoped agar/grain answers, uncertainty, missing-context behavior, and mixed-scope handling.

## Current State Analysis

`diagnosis-quality-rubric` is roadmap foundation F-02 and unlocks the later `selected-log-diagnosis` slice. The app currently has Supabase owner-gated auth and a protected dashboard shell, but no grow-log model, diagnosis API, AI provider, prompts, evaluator, or diagnosis UI. The PRD already defines the core product contract: answers must depend on one selected agar or grain grow log, include possible causes/actions/confidence bands with explanatory uncertainty when enough context exists, ask a follow-up question when context is insufficient, and stay inside the agar/grain MVP scope.

## Desired End State

The repository contains a stable diagnosis quality contract in `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md` and a structured 10-case evaluation set in `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`. A future implementer can read these artifacts and know exactly what selected-log diagnosis must satisfy before it is considered done: how to score answers, which cases count toward the 75% PRD target, when to ask follow-up questions, how to handle mixed-scope prompts, and what remains out of scope.

### Key Discoveries:

- `context/foundation/roadmap.md:73` defines F-02 as the diagnosis quality rubric foundation that unlocks S-02.
- `context/foundation/roadmap.md:83` names the main risk: diagnosis can appear complete while missing uncertainty, scope refusal, or prepared-case correctness.
- `context/foundation/prd.md:34` sets the primary target of 75% correct diagnoses on prepared agar/grain troubleshooting test cases.
- `context/foundation/prd.md:57` requires answers to depend on the selected log and stage, ask follow-up questions when context is missing, refuse out-of-scope questions, and include causes/actions/confidence when enough context exists.
- `context/foundation/prd.md:88` repeats the non-functional requirement that diagnostic answers include explanatory uncertainty and no guaranteed outcomes.
- `src/pages/dashboard.astro:7` is still a placeholder; no grow-log or diagnosis UI exists yet.
- `src/pages/api/auth/signin.ts:10` and `src/pages/api/auth/signout.ts:4` are the only API route logic currently present.
- `package.json:5` has lint/build scripts but no test script, so this plan must not assume an existing evaluator runner.

## What We're NOT Doing

- Implementing selected-log diagnosis runtime behavior.
- Adding an AI provider, prompt runner, OpenAI dependency, or `OPENAI_API_KEY`.
- Adding grow-log schema, migrations, CRUD, or stage persistence.
- Adding a test runner or automated diagnosis evaluator.
- Creating saved chat history.
- Supporting photo/image analysis, species-specific advice, fruiting-stage advice, yield optimization, sharing, or social features.
- Changing authentication, deployment ownership, or Supabase runtime secrets.

## Implementation Approach

Create reference artifacts that can be reviewed by a human now and consumed by implementation agents later. The Markdown rubric owns the scoring model and behavioral contract; the JSON case file owns the 10 prepared cases in a machine-readable shape. Keep the work documentation-only and explicitly avoid runtime code so F-02 stays a foundation for S-02 rather than an early implementation of S-02.

## Phase 1: Change Scaffolding And Reference Location

### Overview

Create the active change folder and prepare the reference-document location that will hold the rubric and evaluation cases.

### Changes Required:

#### 1. Change identity

**File**: `context/changes/diagnosis-quality-rubric/change.md`

**Intent**: Establish this as the active planning identity for F-02 so later planning, implementation, review, and archive steps share one stable change ID.

**Contract**: Frontmatter uses `change_id: diagnosis-quality-rubric`, `status: planned`, `created: 2026-05-28`, `updated: 2026-05-28`, and `archived_at: null`. Notes describe a quality/safety rubric foundation, not runtime diagnosis implementation.

#### 2. Reference docs directory

**File**: `context/changes/diagnosis-quality-rubric/reference/`

**Intent**: Introduce the repo-level reference location named by the lesson path contract for load-bearing implementation names and future agent-readable contracts.

**Contract**: Create the directory if absent. Do not create or modify `context/archive/`. This phase may add only the directory or the planned files that live under it in later phases.

### Success Criteria:

#### Automated Verification:

- Change folder exists: `Test-Path context\changes\diagnosis-quality-rubric`
- Change identity exists: `Test-Path context\changes\diagnosis-quality-rubric\change.md`
- Reference directory exists: `Test-Path context\changes\diagnosis-quality-rubric`
- Lint still passes: `npm run lint`

#### Manual Verification:

- `change.md` correctly describes F-02 as a rubric/documentation foundation and not as selected-log diagnosis runtime work.
- No files are created under `context/archive/`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Diagnosis Quality Rubric

### Overview

Write the human-readable diagnosis quality contract that future selected-log diagnosis answers must satisfy.

### Changes Required:

#### 1. Rubric document

**File**: `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md`

**Intent**: Define the behavioral contract for scoped, uncertain agar/grain troubleshooting answers in a format humans and agents can review before implementing S-02.

**Contract**: The document includes these sections: purpose, MVP scope, answer outcomes, scoring model, scoring criteria, pass/fail thresholds, missing-context rule, mixed-scope handling, out-of-scope handling, and non-goals. It names the scoring scale as `0/1/2 per criterion`, where `0` means absent or unsafe, `1` means partial, and `2` means complete.

#### 2. Criteria set

**File**: `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md`

**Intent**: Make correctness concrete enough that later diagnosis work cannot pass by only producing plausible prose.

**Contract**: The rubric criteria cover at minimum: supported stage/scope, selected-log dependency, likely causes, suggested actions, explanatory uncertainty/confidence band, missing-context behavior, and safety/non-guarantee language. The document states that a case is correct only when it reaches the case threshold and has no critical failure for unsafe certainty or unsupported scope expansion.

#### 3. Missing-context and mixed-scope rules

**File**: `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md`

**Intent**: Preserve the user decisions from planning so future implementation knows when to ask a follow-up and when to answer only the in-scope portion of a mixed prompt.

**Contract**: Missing context triggers a follow-up when information critical to the selected stage is absent. Mixed-scope prompts receive a partial answer only for the agar/grain portion and explicitly decline the unsupported portion. Fully out-of-scope prompts are redirected back to agar/grain troubleshooting.

### Success Criteria:

#### Automated Verification:

- Rubric document exists: `Test-Path context\changes\diagnosis-quality-rubric\diagnosis-quality-rubric.md`
- Rubric contains scoring scale text: `rg "0/1/2|case threshold|critical failure" context\changes\diagnosis-quality-rubric\diagnosis-quality-rubric.md`
- Rubric contains scope handling text: `rg "mixed-scope|out-of-scope|agar|grain|follow-up" context\changes\diagnosis-quality-rubric\diagnosis-quality-rubric.md`
- Lint still passes: `npm run lint`

#### Manual Verification:

- Rubric is understandable without reading the planning conversation.
- Rubric preserves the PRD guardrails: uncertainty, no guaranteed diagnosis, agar/grain scope, and selected-log dependency.
- Rubric does not add species-specific advice, image analysis, saved chat history, or multi-user product scope.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Evaluation Case Set

### Overview

Create the machine-readable prepared case set that future diagnosis implementation and evaluator work can consume.

### Changes Required:

#### 1. Structured evaluation cases

**File**: `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`

**Intent**: Capture 10 concrete agar/grain troubleshooting scenarios so the PRD's prepared-case correctness target has a repo-local source of truth.

**Contract**: The file is valid JSON containing exactly 10 case objects. Each object includes a stable `id`, `stage`, `grow_log`, `question`, `expected_outcome`, `expected_signals`, `critical_missing_context`, `scope_class`, `counts_toward_prd_accuracy`, and `notes` field. `stage` values are limited to `agar` or `grain`; fully out-of-scope cases are represented by `scope_class`, not by a third stage value.

The rubric or case file documents this compact case schema: `id` is a stable string, `stage` is `agar` or `grain`, `grow_log` and `question` are strings, `expected_outcome` is a string, `expected_signals` is an array of strings, `critical_missing_context` is an array of strings, `scope_class` is one of `in_scope`, `missing_context`, `mixed_scope`, or `out_of_scope`, `counts_toward_prd_accuracy` is a boolean, and `notes` is a string.

#### 2. Case coverage

**File**: `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`

**Intent**: Ensure the first case set covers the main MVP risks without turning F-02 into a large domain-research project.

**Contract**: The 10 cases include agar diagnosis cases, grain diagnosis cases, missing-context cases, fully out-of-scope cases, and mixed-scope cases where only the agar/grain portion should be answered. At least one case checks selected-log dependency by making the question alone insufficient.

#### 3. Cross-reference to rubric

**File**: `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md`

**Intent**: Keep the Markdown contract and JSON cases connected so future agents do not treat them as independent artifacts.

**Contract**: Add a section referencing `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json` and explaining that the cases are scored using the rubric's 0/1/2 criteria and case threshold. Define how the PRD 75% prepared-case target is computed from cases where `counts_toward_prd_accuracy` is `true`; guardrail-only cases still must pass their scope/safety expectations but do not silently change the diagnosis-accuracy denominator.

### Success Criteria:

#### Automated Verification:

- Evaluation case file exists: `Test-Path context\changes\diagnosis-quality-rubric\diagnosis-evaluation-cases.json`
- Evaluation case file is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json','utf8')); console.log('ok')"`
- Evaluation case file contains 10 cases: `node -e "const c=JSON.parse(require('fs').readFileSync('context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json','utf8')); if(!Array.isArray(c.cases)||c.cases.length!==10) process.exit(1); console.log(c.cases.length)"`
- Lint still passes: `npm run lint`

#### Manual Verification:

- The case set has credible coverage across agar, grain, missing context, out-of-scope, and mixed-scope prompts.
- Cases do not require image analysis, saved chat history, species-specific advice, or multi-log comparison.
- Expected signals are specific enough to guide future implementation without overfitting to exact wording.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Handoff And Verification

### Overview

Make the new quality contract discoverable and verify that it remains a foundation artifact, not runtime implementation.

### Changes Required:

#### 1. Contract surfaces registry

**File**: `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md`

**Intent**: Register the new load-bearing rubric and case artifacts so future agents can find them before implementing diagnosis.

**Contract**: If the file does not exist, create it with a concise reference registry. Add H2 sections for `## Diagnosis Quality Rubric` and `## Diagnosis Evaluation Cases`, with the canonical path under each heading. Name `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md` as the canonical diagnosis quality contract and `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json` as the prepared-case set for S-02.

#### 2. Plan reference cleanup

**File**: `context/changes/diagnosis-quality-rubric/plan.md`

**Intent**: Keep the implementation plan aligned with the artifacts that were actually created.

**Contract**: The plan references the rubric, case file, contract surfaces registry, PRD, roadmap, and package scripts. Progress remains the single checkbox owner and uses the format defined by `.agents/skills/10x-plan/references/progress-format.md`.

### Success Criteria:

#### Automated Verification:

- Contract surfaces registry exists: `Test-Path context\changes\diagnosis-quality-rubric\contract-surfaces.md`
- Contract surfaces registry references the diagnosis artifacts: `rg "diagnosis-quality-rubric|diagnosis-evaluation-cases" context\changes\diagnosis-quality-rubric\contract-surfaces.md`
- No diagnosis runtime code was added under `src`: `if (rg -q "diagnosis-quality-rubric|diagnosis-evaluation-cases" src) { exit 1 } else { exit 0 }`
- Lint still passes: `npm run lint`
- Build still passes: `npm run build`

#### Manual Verification:

- A future implementer can find the rubric and cases from `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md`.
- The change remains documentation/reference-only and does not add diagnosis API, AI provider, grow-log persistence, or saved chat history.
- The final artifacts give enough detail to begin planning or implementing `selected-log-diagnosis`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- No unit tests are introduced in this change because there is no diagnosis runtime or evaluator yet.
- JSON validity and case count are verified with one-line Node commands.

### Integration Tests:

- No integration tests are introduced in this change.
- Future `selected-log-diagnosis` work should use the rubric and cases as the acceptance source for diagnosis behavior.

### Manual Testing Steps:

1. Read `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md` and confirm it can be understood without the planning conversation.
2. Review all 10 JSON cases and confirm each stays within the MVP constraints or explicitly models out-of-scope/mixed-scope behavior.
3. Confirm `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md` points future agents to both diagnosis quality artifacts.

## Performance Considerations

This change adds static reference artifacts only. It has no runtime performance impact. Future evaluator work should avoid live AI calls in ordinary lint/build verification unless explicitly planned, because provider latency and cost are outside this foundation change.

## Migration Notes

No database, Supabase, Cloudflare, or environment migration is required. Do not add AI provider secrets in this change.

## References

- Roadmap F-02: `context/foundation/roadmap.md:73`
- Roadmap risk: `context/foundation/roadmap.md:83`
- PRD success target: `context/foundation/prd.md:34`
- PRD selected-log diagnosis acceptance criteria: `context/foundation/prd.md:57`
- PRD diagnostic uncertainty NFR: `context/foundation/prd.md:88`
- Deployment guardrail for future AI integration: `context/changes/deployment/deployment-plan.md:347`
- Progress format: `.agents/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Change Scaffolding And Reference Location

#### Automated

- [x] 1.1 Change folder exists: `Test-Path context\changes\diagnosis-quality-rubric`
- [x] 1.2 Change identity exists: `Test-Path context\changes\diagnosis-quality-rubric\change.md`
- [x] 1.3 Reference directory exists: `Test-Path context\changes\diagnosis-quality-rubric`
- [x] 1.4 Lint still passes: `npm run lint`

#### Manual

- [x] 1.5 `change.md` correctly describes F-02 as a rubric/documentation foundation and not as selected-log diagnosis runtime work.
- [x] 1.6 No files are created under `context/archive/`.

### Phase 2: Diagnosis Quality Rubric

#### Automated

- [ ] 2.1 Rubric document exists: `Test-Path context\changes\diagnosis-quality-rubric\diagnosis-quality-rubric.md`
- [ ] 2.2 Rubric contains scoring scale text: `rg "0/1/2|case threshold|critical failure" context\changes\diagnosis-quality-rubric\diagnosis-quality-rubric.md`
- [ ] 2.3 Rubric contains scope handling text: `rg "mixed-scope|out-of-scope|agar|grain|follow-up" context\changes\diagnosis-quality-rubric\diagnosis-quality-rubric.md`
- [ ] 2.4 Lint still passes: `npm run lint`

#### Manual

- [ ] 2.5 Rubric is understandable without reading the planning conversation.
- [ ] 2.6 Rubric preserves the PRD guardrails: uncertainty, no guaranteed diagnosis, agar/grain scope, and selected-log dependency.
- [ ] 2.7 Rubric does not add species-specific advice, image analysis, saved chat history, or multi-user product scope.

### Phase 3: Evaluation Case Set

#### Automated

- [ ] 3.1 Evaluation case file exists: `Test-Path context\changes\diagnosis-quality-rubric\diagnosis-evaluation-cases.json`
- [ ] 3.2 Evaluation case file is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json','utf8')); console.log('ok')"`
- [ ] 3.3 Evaluation case file contains 10 cases: `node -e "const c=JSON.parse(require('fs').readFileSync('context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json','utf8')); if(!Array.isArray(c.cases)||c.cases.length!==10) process.exit(1); console.log(c.cases.length)"`
- [ ] 3.4 Lint still passes: `npm run lint`

#### Manual

- [ ] 3.5 The case set has credible coverage across agar, grain, missing context, out-of-scope, and mixed-scope prompts.
- [ ] 3.6 Cases do not require image analysis, saved chat history, species-specific advice, or multi-log comparison.
- [ ] 3.7 Expected signals are specific enough to guide future implementation without overfitting to exact wording.

### Phase 4: Handoff And Verification

#### Automated

- [ ] 4.1 Contract surfaces registry exists: `Test-Path context\changes\diagnosis-quality-rubric\contract-surfaces.md`
- [ ] 4.2 Contract surfaces registry references the diagnosis artifacts: `rg "diagnosis-quality-rubric|diagnosis-evaluation-cases" context\changes\diagnosis-quality-rubric\contract-surfaces.md`
- [ ] 4.3 No diagnosis runtime code was added under `src`: `if (rg -q "diagnosis-quality-rubric|diagnosis-evaluation-cases" src) { exit 1 } else { exit 0 }`
- [ ] 4.4 Lint still passes: `npm run lint`
- [ ] 4.5 Build still passes: `npm run build`

#### Manual

- [ ] 4.6 A future implementer can find the rubric and cases from `context/changes/diagnosis-quality-rubric/reference/contract-surfaces.md`.
- [ ] 4.7 The change remains documentation/reference-only and does not add diagnosis API, AI provider, grow-log persistence, or saved chat history.
- [ ] 4.8 The final artifacts give enough detail to begin planning or implementing `selected-log-diagnosis`.
