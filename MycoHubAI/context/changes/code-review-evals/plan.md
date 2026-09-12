# Code Review Evals Implementation Plan

## Overview

Introduce Promptfoo inside `packages/code-reviewer` as a package-local evaluation harness for the production pull-request reviewer. The first maintained suite will run the same production review instructions and fixture request through three OpenRouter-backed AI SDK models, then combine deterministic contract assertions with an independent LLM judge that checks whether a deliberately flawed React 16-to-19 migration was reviewed correctly.

## Current State Analysis

The package already has the core boundaries needed for evaluation: a deterministic PR prompt builder, an injected `LanguageModel`, bounded repository tools, strict Zod request/result contracts, reviewed-SHA enforcement, and a deterministic pass/fail policy. Promptfoo is not installed or configured, PR-specific contracts are not exposed through the public barrel, TypeScript checking covers only `src/**/*.ts`, and there is no immutable evaluation fixture, semantic oracle, live-eval script, or report-retention policy.

The existing research recommends Promptfoo and establishes that a TypeScript custom provider can wrap the production reviewer. The adapter must call `createPullRequestReviewer()` rather than use Promptfoo's OpenRouter provider for target inference; otherwise the evaluation would bypass the ToolLoopAgent, repository tools, production prompt construction, structured-output normalization, and SHA guard.

## Desired End State

From `packages/code-reviewer`, a maintainer with `OPENROUTER_API_KEY` available only in the process environment can run one command that evaluates the same React migration case once against:

- `z-ai/glm-5.1`
- `deepseek/deepseek-v4-flash`
- `openai/gpt-5.1-codex-mini`

A separate stability command runs the same matrix three times per target with Promptfoo caching disabled. Every result must satisfy the PR review schema, report the fixture head SHA, identify the affected component, and make the existing deterministic application policy return `failed`. The model-graded assertion uses `mistralai/mistral-small-2603` and passes only when the review distinctly identifies all three seeded defects with their consequences and actionable repairs, without inventing another impactful defect. Local JSON reports land only in an ignored output directory and no live eval is added to CI.

### Key Discoveries:

- The PR reviewer already accepts an injected model and validates the requested SHA around a production ToolLoopAgent (`packages/code-reviewer/src/pull-request/reviewer.ts:13-61`).
- The production instructions and typed prompt builder are isolated and deterministic, so the eval must reuse them rather than copy prompt text into YAML (`packages/code-reviewer/src/pull-request/prompt.ts:3-51`).
- The strict public result contains the exact reviewed SHA, three scored criteria, and at most 20 typed findings (`packages/code-reviewer/src/pull-request/schema.ts:76-175`).
- Application failure is deterministic: an average below 7, any criterion below 5, or any `error` finding yields `failed` (`packages/code-reviewer/src/pull-request/policy.ts:3-23`).
- The public barrel omits the PR reviewer, schemas, prompt, and decision policy needed by a maintained adapter (`packages/code-reviewer/src/index.ts:1-20`).
- The package declares Node `>=22` and checks only `src/**/*.ts`; Promptfoo's current runtime floor and the new `evals/` TypeScript surface require those contracts to be tightened (`packages/code-reviewer/package.json:13-24`, `packages/code-reviewer/tsconfig.json:1-13`).

## What We're NOT Doing

- Evaluating the generic findings-only reviewer in this first suite.
- Comparing alternate prompt variants or adding instruction injection to the reviewer factory.
- Calling target models directly through Promptfoo and bypassing the production ToolLoopAgent.
- Evaluating GitHub event acquisition, comments, labels, workflow permissions, or orchestration.
- Measuring tool trajectories or adopting Promptfoo's experimental tracing surface.
- Generating synthetic cases, adding a holdout corpus, or broadening beyond the single curated React migration.
- Running paid or secret-bearing evals in pull-request CI, scheduled CI, or the existing write-capable review workflow.
- Publishing or sharing Promptfoo reports, retaining HTML/JUnit artifacts, or committing generated results.
- Reading, writing, or documenting any real credential value.

## Implementation Approach

Keep Promptfoo outside the reviewer core. Expose a narrow, import-safe PR evaluation surface from `src/index.ts`, then implement one package-local TypeScript custom provider that receives a model slug from each Promptfoo provider entry, loads a validated case by identifier, resolves a repository root beneath the committed fixture directory, constructs the OpenRouter AI SDK model, and invokes the production PR reviewer. The serialized review result becomes Promptfoo output; safe metadata records the target model, case id, and production-prompt fingerprint without including credentials or untrusted exception details.

Keep the semantic oracle outside the directory passed as `repositoryRoot` so the agent cannot read its expected answers. A shared assertion module will parse every output with the production Zod schema and reuse `evaluatePullRequestReview()` for the static failure gate. Promptfoo's separately pinned `llm-rubric` judge will assess semantic recall and precision after those deterministic checks pass.

## Critical Implementation Details

### State sequencing

The fixture request, canonical patch, base component, head repository, expected SHA, and three-entry oracle form one versioned unit. Contract tests must reject drift between them before any paid call runs; the reviewer receives only the head repository plus the PR request, never the oracle.

### Debug & observability

Target-model failures must be returned as redacted Promptfoo provider errors. The local JSON report may contain prompts and model output, so it stays ignored and unshared; credentials must remain process-only and must never be copied into provider metadata, fixtures, config, reports, or logs.

## Phase 1: Establish the Promptfoo Adapter Boundary

### Overview

Add Promptfoo to the standalone package and expose only the production PR contracts required by the adapter. Build and test the provider boundary without making a live model request.

### Changes Required:

#### 1. Package runtime, scripts, and generated-output policy

**File**: `packages/code-reviewer/package.json`

**Intent**: Add Promptfoo as a package-local development dependency and define explicit commands for a one-run comparison and a three-repetition stability run. Align the declared Node floor with Promptfoo while preserving the package's standalone installation boundary.

**Contract**: The package requires Node `>=22.22.0`; `eval` runs the committed config once, while `eval:stability` runs the same config three times with caching disabled. Both write JSON below `evals/output/` and return non-zero when required assertions fail.

**File**: `packages/code-reviewer/package-lock.json`

**Intent**: Lock the Promptfoo dependency graph so local comparisons are reproducible.

**Contract**: The lockfile remains package-local and is generated by the supported Node/npm toolchain.

**File**: `packages/code-reviewer/.gitignore`

**Intent**: Keep generated evaluation reports out of Git without hiding committed configuration, fixtures, or oracles.

**Contract**: Ignore `evals/output/`; do not ignore the wider `evals/` tree.

#### 2. Intentional PR evaluation exports

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Expose the existing PR reviewer, prompt, schema, and verdict contracts through the supported package surface so the adapter does not depend on private deep imports.

**Contract**: Add named exports for `createPullRequestReviewer`, `PullRequestReviewer`, `buildPullRequestReviewPrompt`, `PULL_REQUEST_REVIEWER_INSTRUCTIONS`, the public PR request/result schemas and inferred types, and `evaluatePullRequestReview`. Preserve every existing generic export and the generic `{ findings }` API.

**File**: `packages/code-reviewer/src/index.test.ts`

**Intent**: Prove the expanded barrel remains import-safe and exposes the intended PR evaluation contracts without credentials, filesystem access, provider calls, or CLI behavior.

**Contract**: Import with an empty `OPENROUTER_API_KEY`, assert the new named contracts, and retain all existing public-surface assertions.

#### 3. TypeScript custom provider

**File**: `packages/code-reviewer/evals/provider.ts`

**Intent**: Translate one Promptfoo provider instance into one production PR reviewer invocation using the configured OpenRouter model.

**Contract**: Implement Promptfoo's custom-provider `id()` and `callApi()` contract. Validate provider configuration and test variables, resolve only known committed cases, constrain `repositoryRoot` beneath the fixture root, create the OpenRouter AI SDK model from the configured slug, call `createPullRequestReviewer()`, serialize the public result as JSON, and return safe model/case/prompt-fingerprint metadata. Missing credentials or operational failures become redacted provider errors.

**File**: `packages/code-reviewer/evals/provider.test.ts`

**Intent**: Verify configuration mapping, case loading, safe root resolution, output serialization, metadata, and error redaction without network access.

**Contract**: Inject or mock the model/reviewer boundary; cover unknown cases, malformed provider config, fixture-root escape attempts, missing process credentials, valid normalized output, and secret-like error text. Tests must prove imports alone perform no I/O or provider call.

**File**: `packages/code-reviewer/tsconfig.json`

**Intent**: Make package type checking cover maintained evaluation TypeScript rather than leaving the provider and assertions unchecked.

**Contract**: Include the relevant `evals/**/*.ts` files while excluding generated reports and non-compilation fixture source as needed.

### Success Criteria:

#### Automated Verification:

- Clean package installation succeeds: `npm.cmd --prefix packages/code-reviewer ci`
- Provider and barrel tests pass without a provider credential or network call: `npm.cmd --prefix packages/code-reviewer test -- src/index.test.ts evals/provider.test.ts`
- Full package tests pass: `npm.cmd --prefix packages/code-reviewer test`
- Package type checking covers `src/` and maintained eval TypeScript: `npm.cmd --prefix packages/code-reviewer run typecheck`
- Repository diff hygiene passes: `git diff --check`

#### Manual Verification:

- Inspect the public barrel and confirm the generic reviewer API remains unchanged while only the required PR evaluation contracts were added.
- Inspect the adapter's error and metadata paths and confirm no credential value or raw secret-bearing provider error can enter output.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation of the manual checks before proceeding.

---

## Phase 2: Build the React Migration Fixture and Assertions

### Overview

Create one immutable, realistic React 16 class-to-React 19 function-component migration containing exactly three impactful behavioral defects, along with a model-hidden oracle and deterministic contract assertions.

### Changes Required:

#### 1. Versioned evaluation case and immutable repository fixture

**File**: `packages/code-reviewer/evals/cases/react-16-to-19-profile-editor/request.json`

**Intent**: Define the typed PR identity, changed-file manifest, and complex migration patch supplied equally to all target models.

**Contract**: The request passes `pullRequestReviewRequestSchema`, uses fixed 40-character base/head SHAs, lists only `src/UserProfileEditor.tsx` as changed, and carries the canonical patch without instructions or oracle text.

**File**: `packages/code-reviewer/evals/cases/react-16-to-19-profile-editor/change.patch`

**Intent**: Preserve the canonical React 16-to-19 migration diff independently from the head repository used by tools.

**Contract**: The patch migrates a class component to Hooks while preserving markup and accessibility and introduces exactly these defect families:

- prop resynchronization is lost because the new effect captures only the initial `profile`;
- a partial Hook setter replaces the complete editor object instead of preserving sibling state;
- event-listener cleanup uses a different callback identity from registration.

**File**: `packages/code-reviewer/evals/cases/react-16-to-19-profile-editor/base/src/UserProfileEditor.tsx`

**Intent**: Preserve the correct React 16 side of the migration so fixture synchronization can be verified deterministically.

**Contract**: The class implementation correctly resynchronizes on profile identity change, relies on class `setState` shallow merge, and registers/removes the same online-listener function.

**File**: `packages/code-reviewer/evals/cases/react-16-to-19-profile-editor/repository/src/UserProfileEditor.tsx`

**Intent**: Provide the flawed React 19 head file that the production repository tools may inspect.

**Contract**: The file matches the applied canonical patch and contains no additional intentional runtime, typing, accessibility, or formatting defect.

**File**: `packages/code-reviewer/evals/cases/react-16-to-19-profile-editor/repository/src/UserProfileEditor.contract.test.tsx`

**Intent**: Give the reviewer unchanged repository evidence of expected behavior without placing expected review answers in its readable root.

**Contract**: The tests describe profile rerender synchronization, preservation of the sibling field during editing, and exactly-once online reconnection after rerender/unmount. They are fixture evidence, not part of the changed-file manifest.

#### 2. Hidden semantic oracle

**File**: `packages/code-reviewer/evals/cases/react-16-to-19-profile-editor/oracle.json`

**Intent**: Define stable semantic expectations for deterministic helpers and the LLM rubric without exposing them to repository tools.

**Contract**: Contain exactly three uniquely identified entries—`profile-prop-sync`, `hook-state-replacement`, and `listener-cleanup-identity`—with the expected path, acceptable hunk/range, severity, semantic consequence, repair signals, and forbidden conflations. The provider must never include this file in `repositoryRoot` or the production prompt.

#### 3. Deterministic assertion layer

**File**: `packages/code-reviewer/evals/assertions.ts`

**Intent**: Make structural validity and application failure independent of the subjective judge.

**Contract**: Parse serialized output with `pullRequestReviewResultSchema`; require the fixture head SHA; reject findings outside the allowed fixture path; require at least one `error` on `src/UserProfileEditor.tsx`; and require `evaluatePullRequestReview(result).verdict === "failed"`. Return Promptfoo-compatible grading details without matching exact model prose.

**File**: `packages/code-reviewer/evals/assertions.test.ts`

**Intent**: Prove the static gate detects a review that incorrectly passes, accepts a schema-valid failing review, and rejects identity/path/shape drift.

**Contract**: Cover malformed JSON, schema-invalid output, wrong SHA, forbidden path, no component error, deterministic `passed` verdict, and a valid `failed` result.

#### 4. Fixture integrity contract

**File**: `packages/code-reviewer/evals/fixture-contract.test.ts`

**Intent**: Prevent a fixture edit from silently invalidating the prompt, repository head, or oracle.

**Contract**: Validate the request schema; fixed SHA and changed path; exactly three unique oracle ids; oracle exclusion from the reviewer root; canonical patch/base/head synchronization; and the presence of unchanged behavioral evidence for all three defects. Tests must fail before any paid evaluation if these invariants drift.

### Success Criteria:

#### Automated Verification:

- Fixture and assertion tests pass without a provider credential or network call: `npm.cmd --prefix packages/code-reviewer test -- evals/fixture-contract.test.ts evals/assertions.test.ts`
- The static assertion test proves a review with no `error` or a deterministic `passed` verdict is rejected.
- The fixture contract proves the patch reconstructs the committed head component and the oracle contains exactly three unique defects.
- Full package tests pass: `npm.cmd --prefix packages/code-reviewer test`
- Package type checking passes: `npm.cmd --prefix packages/code-reviewer run typecheck`
- Repository diff hygiene passes: `git diff --check`

#### Manual Verification:

- Review the old component, patch, head component, and unchanged behavioral tests and confirm the migration contains exactly the three approved impactful flaws and no distracting fourth flaw.
- Confirm the semantic oracle is outside the repository root available to reviewer tools and is absent from the generated production prompt.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation of the manual checks before proceeding.

---

## Phase 3: Configure and Calibrate the Live Three-Model Evaluation

### Overview

Wire the three target providers, independent model-graded rubric, execution modes, report output, and operator documentation; then perform a controlled live calibration outside CI.

### Changes Required:

#### 1. Promptfoo model matrix and shared assertions

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: Run one identical production review case through three labeled instances of the custom provider and apply both deterministic and semantic quality gates.

**Contract**: Configure the same provider file and case for `z-ai/glm-5.1`, `deepseek/deepseek-v4-flash`, and `openai/gpt-5.1-codex-mini`. Apply the shared deterministic assertion first, then an `llm-rubric` assertion pinned to OpenRouter model `mistralai/mistral-small-2603`. Disable sharing and remote-generation features through documented local settings; do not embed credentials.

#### 2. Strict semantic judge rubric

**File**: `packages/code-reviewer/evals/rubric.yaml`

**Intent**: Judge review correctness by meaning rather than brittle wording.

**Contract**: Pass only when the review distinctly identifies all three oracle defects, connects each to its concrete behavioral consequence, and recommends an actionable repair. Fail for any missed/conflated defect or any additional unsupported impactful finding. Exact prose and exact line numbers are not required when the correct file and hunk are established.

#### 3. Operator documentation

**File**: `packages/code-reviewer/README.md`

**Intent**: Document safe, repeatable local evaluation without weakening the existing package or workflow guidance.

**Contract**: Describe prerequisites, the three targets and independent judge, process-only `OPENROUTER_API_KEY`, the one-run and three-repetition commands, disabled cache for stability calibration, expected non-zero assertion failure, ignored JSON output, cost/stochasticity boundaries, and the explicit absence of CI integration or report sharing.

### Success Criteria:

#### Automated Verification:

- Promptfoo loads and validates the committed configuration without embedding a credential.
- With a process-only `OPENROUTER_API_KEY`, the one-run matrix completes and all three target rows pass deterministic and semantic assertions: `npm.cmd --prefix packages/code-reviewer run eval`
- With the same process-only credential, the stability matrix performs three uncached repetitions per target and writes the configured local JSON report: `npm.cmd --prefix packages/code-reviewer run eval:stability`
- Full package tests pass: `npm.cmd --prefix packages/code-reviewer test`
- Package type checking passes: `npm.cmd --prefix packages/code-reviewer run typecheck`
- Repository diff hygiene passes: `git diff --check`

#### Manual Verification:

- Inspect the local JSON report and confirm it contains exactly the three labeled target models, one separately labeled Mistral judge, the expected case, and no credential value.
- Compare the three target reviews and confirm the rubric's pass/fail explanations correspond to the approved three-defect oracle rather than exact wording.
- Confirm no eval workflow, shared URL, committed report, HTML/JUnit artifact, or change to the existing PR-review workflow was introduced.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation of the manual checks before closing the change.

---

## Testing Strategy

### Unit Tests:

- Public-barrel import safety and preservation of the generic reviewer contract.
- Provider configuration, case selection, fixture containment, serialization, metadata, missing credential, and redacted failures using injected/mocked boundaries.
- Deterministic assertions for JSON/schema validity, exact SHA, allowed path, required component error, and application verdict `failed`.
- Fixture integrity for patch/base/head synchronization, the fixed request identity, and an oracle of exactly three unique defect ids.

### Integration Tests:

- Promptfoo config discovery and instantiation of the same TypeScript provider under three model labels.
- One live row per target against the production ToolLoopAgent, repository tools, prompt builder, and output schema.
- Independent `mistralai/mistral-small-2603` rubric evaluation combined with deterministic assertions.
- Three uncached repetitions per target through the separate stability command.

### Manual Testing Steps:

1. Set `OPENROUTER_API_KEY` only in the current shell or process; do not inspect or persist its value.
2. Run the one-pass eval command from the package boundary and verify the three target labels appear.
3. Open the ignored JSON report and confirm all three seeded defects are represented distinctly in every passing review.
4. Run the stability command and confirm it performs three uncached repetitions per target.
5. Check judge explanations for missed, conflated, or invented defects and verify the deterministic verdict remains `failed` for every accepted review.
6. Inspect Git status and confirm no generated report or credential-bearing file is tracked.

## Performance Considerations

The default suite makes one target call and one judge call for each of three models. The stability suite multiplies that matrix by three and disables caching intentionally, so it is an explicit, higher-cost calibration command rather than the daily default. Keep the single fixture bounded and do not add concurrency assumptions until provider rate limits and actual runtime are observed.

## Migration Notes

This is additive package-local tooling. Tightening the package Node engine to `>=22.22.0` is compatible with the current Node 24.15.0 development and action runtime, but consumers on older Node 22 patch releases must upgrade. No database, application runtime, Cloudflare deployment, GitHub workflow, or public generic-reviewer contract migration is required.

Rollback consists of removing the Promptfoo scripts/dependency, the `evals/` tree, the added PR barrel exports, the output ignore entry, and the README section. The underlying PR reviewer remains unchanged.

## References

- Related research: `context/changes/code-review-evals/research.md`
- PR reviewer factory: `packages/code-reviewer/src/pull-request/reviewer.ts:13-61`
- Production PR prompt: `packages/code-reviewer/src/pull-request/prompt.ts:3-51`
- PR request/result schemas: `packages/code-reviewer/src/pull-request/schema.ts:39-175`
- Deterministic review policy: `packages/code-reviewer/src/pull-request/policy.ts:3-23`
- Existing policy boundary tests: `packages/code-reviewer/src/pull-request/policy.test.ts:24-44`
- Public package surface: `packages/code-reviewer/src/index.ts:1-20`
- Package scripts and runtime: `packages/code-reviewer/package.json:6-24`
- TypeScript inclusion boundary: `packages/code-reviewer/tsconfig.json:1-13`
- Promptfoo custom provider documentation: `https://www.promptfoo.dev/docs/providers/custom-api/`
- Promptfoo assertions documentation: `https://www.promptfoo.dev/docs/configuration/expected-outputs/`
- Promptfoo LLM-as-a-judge guide: `https://www.promptfoo.dev/docs/guides/llm-as-a-judge/`
- Promptfoo CLI documentation: `https://www.promptfoo.dev/docs/usage/command-line/`
- OpenRouter GLM 5.1: `https://openrouter.ai/z-ai/glm-5.1`
- OpenRouter DeepSeek V4 Flash: `https://openrouter.ai/deepseek/deepseek-v4-flash`
- OpenRouter GPT-5.1-Codex-Mini: `https://openrouter.ai/openai/gpt-5.1-codex-mini`
- OpenRouter Mistral Small 4: `https://openrouter.ai/mistralai/mistral-small-2603`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Establish the Promptfoo Adapter Boundary

#### Automated

- [ ] 1.1 Clean package installation succeeds
- [ ] 1.2 Provider and barrel tests pass without a provider credential or network call
- [ ] 1.3 Full package tests pass
- [ ] 1.4 Package type checking covers source and maintained eval TypeScript
- [ ] 1.5 Repository diff hygiene passes

#### Manual

- [ ] 1.6 Confirm the generic reviewer API remains unchanged and the public barrel adds only required PR evaluation contracts
- [ ] 1.7 Confirm adapter errors and metadata cannot expose credentials or raw secret-bearing provider errors

### Phase 2: Build the React Migration Fixture and Assertions

#### Automated

- [ ] 2.1 Fixture and assertion tests pass without a provider credential or network call
- [ ] 2.2 Static assertions reject reviews that do not produce a deterministic failed verdict
- [ ] 2.3 Fixture contract proves patch synchronization and exactly three unique oracle defects
- [ ] 2.4 Full package tests pass
- [ ] 2.5 Package type checking passes
- [ ] 2.6 Repository diff hygiene passes

#### Manual

- [ ] 2.7 Confirm the migration contains exactly the three approved impactful flaws and no distracting fourth flaw
- [ ] 2.8 Confirm the oracle is unavailable to reviewer tools and absent from the production prompt

### Phase 3: Configure and Calibrate the Live Three-Model Evaluation

#### Automated

- [ ] 3.1 Promptfoo loads and validates the committed configuration without an embedded credential
- [ ] 3.2 One-run live matrix passes deterministic and semantic assertions for all three target models
- [ ] 3.3 Three-repetition uncached stability matrix completes and writes the ignored local JSON report
- [ ] 3.4 Full package tests pass
- [ ] 3.5 Package type checking passes
- [ ] 3.6 Repository diff hygiene passes

#### Manual

- [ ] 3.7 Confirm the local report identifies three target models, the independent Mistral judge, the expected case, and no credential
- [ ] 3.8 Confirm semantic grading follows the approved three-defect oracle rather than exact wording
- [ ] 3.9 Confirm no CI integration, report sharing, committed output, or existing workflow change was introduced
