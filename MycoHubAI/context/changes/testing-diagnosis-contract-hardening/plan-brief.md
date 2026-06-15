# Testing Diagnosis Contract Hardening - Plan Brief

> Full plan: `context/changes/testing-diagnosis-contract-hardening/plan.md`

## What & Why

This plan implements Phase 1 of `context/foundation/test-plan.md`: deterministic hardening for the selected-log diagnosis contract. It protects the three highest diagnosis risks: confident but unsupported answers, malformed provider/API/UI responses, and missing/mixed/out-of-scope prompts being diagnosed instead of narrowed or refused.

## Starting Point

The selected-log diagnosis runtime already exists, with service, provider, API, UI, and evaluator tests. The current checkout is red because accidental `runTestPlan()` calls entered runtime/script/test files, including a parse-breaking call in `src/pages/api/diagnosis/selected-log.ts`.

## Desired End State

The repo has a green deterministic baseline and stronger contract tests across provider, API, UI, service, prompt, and evaluator boundaries. `diagnosis:evaluate` remains a no-live-provider oracle over the 10 prepared F-03 cases, and this rollout does not claim live OpenRouter or production readiness.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Baseline handling | Cleanup first phase | The route currently does not parse, so new tests need a trustworthy green baseline first. |
| Highest coverage priority | Malformed provider/API/UI outputs | Risk #2 is high impact and current API debug/error behavior shows real exposure. |
| Evaluator role | Deterministic contract oracle | Keeps the signal cheap, repeatable, and CI-friendly without provider secrets. |
| Non-diagnosis contamination | Remove all `runTestPlan` injections | The same incident appears outside diagnosis and would keep `test:unit` red. |
| API error contract | Dev-only debug allowed, never unconditional | Preserves local debugging without leaking raw details into production-shaped responses. |
| Grounding coverage | Contract fixtures for service/evaluator | Proves selected-log dependency without live model cost or flakiness. |
| Manual gate | No live provider required | Live smoke belongs to the later runtime failure and smoke rollout. |

## Scope

**In scope:**

- Remove accidental `runTestPlan()` imports/calls from runtime, scripts, and tests.
- Restore green `test:unit`, `lint`, and `build` baseline.
- Harden malformed provider/API/UI response tests.
- Add selected-log grounding and scope contract fixtures.
- Harden `diagnosis:evaluate` as a deterministic oracle.
- Update relevant test-plan cookbook notes after implementation.

**Out of scope:**

- New diagnosis features, model changes, migrations, knowledge content, or UI surfaces.
- Required live OpenRouter smoke.
- Browser/e2e tests for this phase.
- Saved chat history, image analysis, sharing, export, species advice, fruiting advice, or broader cultivation scope.

## Architecture / Approach

The rollout proceeds from baseline repair to boundary hardening: runtime decontamination first, then provider/API/UI malformed-response tests, then service/prompt grounding and scope fixtures, then deterministic evaluator checks. Mandatory verification stays local and deterministic: `npm run test:unit`, `npm run lint`, `npm run build`, and `npm run diagnosis:evaluate`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baseline Decontamination And Green Gates | Removes accidental test-plan runtime calls and restores green gates | New tests are meaningless while the route does not parse. |
| 2. Provider/API/UI Malformed Response Contract | Bad provider/API payloads become controlled errors or safe UI states | Raw debug/provider details can leak or nonsense can render. |
| 3. Selected-Log Grounding And Scope Contract Tests | Deterministic proof of selected-log dependency and rubric scope outcomes | Tests can mirror implementation instead of proving product contract. |
| 4. Deterministic Evaluator Hardening | Stricter `diagnosis:evaluate` oracle over the 10 cases | Evaluator may pass while missing scope or PRD-denominator drift. |
| 5. Rollout Documentation And Manual Gate | Cookbook notes and no-live-provider closeout checks | Rollout could overclaim live provider or production readiness. |

**Prerequisites:** Existing selected-log diagnosis implementation and F-03 rubric/cases remain available.
**Estimated effort:** About 2-3 implementation sessions across 5 phases.

## Open Risks & Assumptions

- The accidental `runTestPlan()` contamination is treated as part of this rollout because it currently blocks the gates.
- Dev-only debug behavior must be explicit; if no reliable dev/prod distinction exists, debug response detail should be removed rather than guessed.
- Existing dirty changes in `context/foundation/test-plan.md` must be preserved and worked with, not reverted.

## Success Criteria (Summary)

- `npm run test:unit`, `npm run lint`, `npm run build`, and `npm run diagnosis:evaluate` pass without live provider secrets.
- Runtime/API paths do not import or execute test-plan/evaluator code.
- Provider/API/UI malformed responses, selected-log grounding, and rubric scope outcomes are covered by deterministic tests.
