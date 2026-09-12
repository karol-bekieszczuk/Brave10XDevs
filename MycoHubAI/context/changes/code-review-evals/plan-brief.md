# Code Review Evals — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`
> Research: `context/changes/code-review-evals/research.md`

## What & Why

Introduce Promptfoo inside `packages/code-reviewer` to compare the same production pull-request review prompt across three models. The suite will use one deliberately flawed React 16-to-19 migration and combine deterministic checks with an independent LLM judge, establishing whether the reviewer catches real behavioral regressions rather than merely producing schema-valid output.

## Starting Point

The PR reviewer already has injected AI SDK models, bounded repository tools, a deterministic prompt builder, strict Zod output, exact-SHA validation, and a deterministic application verdict. Promptfoo, an eval adapter, immutable cases, semantic assertions, and live-eval scripts do not yet exist, and the PR-specific contracts are not exported through the supported barrel.

## Desired End State

A maintainer can run one package-local command to compare `z-ai/glm-5.1`, `deepseek/deepseek-v4-flash`, and `openai/gpt-5.1-codex-mini` against the identical production review case. A second command repeats the uncached matrix three times. Every accepted result is schema-valid, fails the existing review policy because it reports broken behavior, and is judged by `mistralai/mistral-small-2603` to have correctly identified all three seeded defects without inventing another impactful one.

## Key Decisions Made

| Decision           | Choice                                                               | Why                                                                                                 | Source          |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------- |
| Evaluation target  | Production PR reviewer only                                          | It represents the behavior published by CI and includes the scored review contract.                 | Research        |
| Harness boundary   | Thin TypeScript Promptfoo custom provider                            | It preserves the production ToolLoopAgent, tools, prompt builder, schemas, and SHA guard.           | Research        |
| Target models      | GLM 5.1, DeepSeek V4 Flash, GPT-5.1-Codex-Mini                       | Three distinct model families provide a useful comparison while sharing OpenRouter transport.       | Plan            |
| Judge              | Mistral Small 4 (`mistralai/mistral-small-2603`)                     | It is independent of the targets and materially cheaper than the initially considered Claude judge. | Plan            |
| Semantic threshold | All 3 defects, distinct and actionable; no invented impactful defect | The single curated case should provide a strict, interpretable quality signal.                      | Plan            |
| Static gate        | Production schema + exact SHA/path + `error` + verdict `failed`      | Review correctness must not depend solely on a stochastic judge.                                    | Research / Plan |
| Repetition         | One run by default; separate 3-run uncached stability command        | It controls normal cost while preserving an explicit flakiness check.                               | Plan            |
| Execution          | Local only, no CI                                                    | It avoids adding paid secret-bearing code to the unresolved PR-workflow trust boundary.             | Research / Plan |
| Reports            | Ignored local JSON only                                              | It supports comparison/debugging without publishing potentially sensitive output.                   | Plan            |

## Scope

**In scope:**

- Promptfoo dependency, config, scripts, TypeScript provider, assertions, and package-local documentation.
- Narrow public exports for existing PR reviewer/prompt/schema/policy contracts.
- One immutable React 16-to-19 profile-editor migration fixture.
- Three deliberate flaws: stale prop synchronization, destructive Hook state replacement, and mismatched listener cleanup identity.
- Deterministic Vitest coverage and a strict model-graded rubric.
- One-pass and three-repetition local execution modes with ignored JSON output.

**Out of scope:**

- Generic reviewer evals, prompt A/B testing, agent trajectory scoring, synthetic/holdout corpora, or GitHub workflow evaluation.
- CI or scheduled execution, report sharing, HTML/JUnit retention, and committed generated results.
- Changes to reviewer behavior, GitHub publication, application runtime, database, or deployment.

## Architecture / Approach

Promptfoo loads one TypeScript custom provider three times with different model slugs. The provider loads the typed case, confines repository access to the fixture head, injects the selected OpenRouter AI SDK model into the production PR reviewer, and returns serialized output plus safe metadata. Deterministic assertions reuse production schemas and verdict policy; only then does the independently pinned Mistral judge compare semantic content with an oracle stored outside the reviewer-readable repository root.

## Phases at a Glance

| Phase                     | What it delivers                                                                            | Key risk                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Adapter boundary       | Promptfoo dependency, scripts, safe exports, provider, and no-network tests                 | Accidentally bypassing production behavior or leaking provider errors |
| 2. Fixture and assertions | Synchronized migration fixture, exactly-three-defect oracle, and static failed-verdict gate | Oracle leakage or a distracting unintended fourth defect              |
| 3. Live calibration       | Three-model matrix, cheap independent judge, repetition mode, reports, and docs             | Stochastic failures, live cost, or provider-specific incompatibility  |

**Prerequisites:** Node 24.15.0 or another version satisfying Node `>=22.22.0`; an OpenRouter account and process-only `OPENROUTER_API_KEY` for Phase 3.
**Estimated effort:** Approximately 3 focused implementation sessions across 3 gated phases.

## Open Risks & Assumptions

- Each target must support the ToolLoopAgent's tool-call and structured-output sequence through its active OpenRouter endpoint; this remains live-provider evidence, not something mocks can prove.
- A single case is a useful first smoke benchmark but cannot establish general reviewer quality or model ranking.
- The strict 3-of-3 semantic threshold may expose judge or target stochasticity; the separate three-run command measures that rather than weakening the baseline.
- Promptfoo JSON can contain prompts and outputs, so ignored local storage and disabled sharing remain required even without application secrets in the fixture.

## Success Criteria (Summary)

- The same immutable production review case runs once against all three target models, with an explicit three-repetition uncached mode.
- Every passing row validates the production result contract, exact identity, component path, `error` finding, deterministic `failed` verdict, and all three semantic defects.
- The suite remains package-local, import-safe, secret-safe, outside CI, and produces only ignored local JSON reports.
