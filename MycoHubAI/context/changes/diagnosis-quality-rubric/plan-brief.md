# Diagnosis Quality Rubric - Plan Brief

> Full plan: `context/changes/diagnosis-quality-rubric/plan.md`

## What & Why

MycoHubAI needs a clear diagnosis quality contract before implementing selected-log diagnosis. This change defines how agar/grain troubleshooting answers will be judged, including uncertainty, selected-log dependency, missing context, and scope handling.

## Starting Point

The roadmap marks `diagnosis-quality-rubric` as F-03, a foundation that unlocks `selected-log-diagnosis`. The runtime app currently has auth and a protected dashboard shell, but no diagnosis API, grow-log schema, AI provider, prompts, or evaluator.

## Desired End State

The repo has a readable rubric at `docs/reference/diagnosis-quality-rubric.md` and a structured 10-case evaluation set at `docs/reference/diagnosis-evaluation-cases.json`. Future diagnosis implementation can use these as the source of truth for scoped uncertain answers and the PRD's 75% prepared-case target.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Rubric format | Markdown spec plus machine-readable cases | Humans can review the contract now and future agents can automate against the cases later. |
| Case count | 10 prepared cases | Small enough for MVP speed but broad enough to cover agar, grain, missing context, out-of-scope, and mixed-scope behavior. |
| Correctness model | Rubric score threshold | Measures full answer quality instead of only matching one expected phrase. |
| Missing context | Follow-up when critical stage context is absent | Prevents guessing when the selected log lacks information needed for a responsible diagnosis. |
| Mixed scope | Answer only the agar/grain portion | Keeps the response useful while preserving the MVP boundary. |
| Scoring scale | 0/1/2 per criterion plus case threshold | Captures absent, partial, and complete quality without heavyweight weighted scoring. |
| Runtime scope | Docs and structured cases only | Completes F-03 without prematurely implementing S-02. |

## Scope

**In scope:**

- Create `docs/reference/diagnosis-quality-rubric.md`.
- Create `docs/reference/diagnosis-evaluation-cases.json` with exactly 10 cases.
- Create/update `docs/reference/contract-surfaces.md` so future agents can find the artifacts.
- Define scoring criteria, pass thresholds, critical failures, missing-context behavior, mixed-scope handling, and non-goals.

**Out of scope:**

- Diagnosis API, AI provider setup, prompts, OpenAI secrets, or evaluator runner.
- Grow-log schema, migrations, CRUD, or selected-log UI.
- Saved chat history, photo/image analysis, species-specific advice, sharing, or multi-user product features.

## Architecture / Approach

This is a reference-artifact change. The Markdown rubric owns the human-readable quality contract, the JSON file owns the prepared cases, and `contract-surfaces.md` points future agents to both before they implement `selected-log-diagnosis`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Change Scaffolding And Reference Location | Active change identity and `docs/reference/` location | Accidentally treating F-03 as runtime diagnosis work. |
| 2. Diagnosis Quality Rubric | Human-readable scoring and behavior contract | Rubric could be too vague to guide implementation. |
| 3. Evaluation Case Set | 10 structured prepared cases | Cases could overfit wording or miss key scope failures. |
| 4. Handoff And Verification | Discoverability and final foundation checks | Future agents may miss the rubric unless it is registered clearly. |

**Prerequisites:** None beyond the existing PRD and roadmap.
**Estimated effort:** About 1 focused documentation/reference implementation session across 4 phases.

## Open Risks & Assumptions

- Case quality depends on domain judgment; the first set should be treated as MVP evaluation coverage, not a comprehensive cultivation knowledge base.
- No automated evaluator exists yet, so F-03 proves structure and reviewability rather than live AI correctness.
- The future S-02 implementation must intentionally consume these artifacts; this change only creates the contract.

## Success Criteria (Summary)

- Rubric clearly defines scoped uncertain diagnosis quality for agar/grain grow logs.
- JSON case set contains exactly 10 valid, useful prepared cases across the agreed coverage areas.
- The change remains documentation/reference-only and gives future `selected-log-diagnosis` work a concrete acceptance source.
