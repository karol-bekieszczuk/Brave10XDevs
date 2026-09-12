---
date: 2026-09-12T12:05:36+02:00
researcher: Codex
git_commit: 0fb30a9babd3cc013b4557f4205d94313fc692b1
branch: tests-ai-code-review
repository: Brave10XDevs
topic: "Current state of packages/code-reviewer for introducing prompt and agent evals, with Promptfoo as the preferred toolkit"
tags: [research, codebase, code-reviewer, evals, promptfoo, ai-sdk, openrouter]
status: complete
last_updated: 2026-09-12
last_updated_by: Codex
---

# Research: Code reviewer eval readiness and Promptfoo fit

**Date**: 2026-09-12T12:05:36+02:00  
**Researcher**: Codex  
**Git Commit**: `0fb30a9babd3cc013b4557f4205d94313fc692b1`  
**Branch**: `tests-ai-code-review`  
**Repository**: `Brave10XDevs`

## Research Question

Analyze the current state of `packages/code-reviewer` in the context of introducing evals, especially prompt reusability and agent importability. Prefer Promptfoo when it is aligned with the current stack; otherwise consider other OSS prompt and agent evaluation tools. Use current documentation.

## Summary

**Recommendation: proceed with Promptfoo.** It matches the package's TypeScript, ESM, Node, structured-output, AI SDK, and OpenRouter architecture. Promptfoo supports TypeScript/ESM custom providers, structured provider output, JavaScript and JSON Schema assertions, LLM-as-a-judge, external datasets, a Node API, caching, and CI reports. Its current runtime floor is Node `>=22.22.0`, with Node 24 LTS recommended. The workstation is on Node `24.15.0`, and the existing PR review action pins `24.15.0`, so the live environment is aligned. The package declaration `node >=22` is nevertheless too broad and should be tightened if Promptfoo becomes a package dependency.

The current code was intentionally prepared for future evals: prompts and strict Zod contracts are isolated, generic and PR-specific reviewer factories accept an injected AI SDK `LanguageModel`, repository access is read-only and call-scoped, and deterministic AI SDK model tests already exist. The PR reviewer is the correct first eval target because it represents the production review behavior and includes the scored criteria the product actually publishes.

The main gaps are local API design rather than toolkit compatibility:

1. The PR reviewer factory, prompt builder, prompt constant, request/result schemas, and provider entry point are not exported by the public barrel.
2. Both reviewer factories hard-code their instructions, tools, schema, retries, and step policy. A caller can compare models, but cannot compare prompt variants while exercising exactly the production agent implementation.
3. The public `Reviewer.generate()` result intentionally drops step/tool telemetry, so output quality is easy to evaluate but trajectory quality needs a later tracing seam.
4. The package is private and source-consumed, with no `main`, `exports`, or build output. A first spike can deep-import TypeScript source, but that should not become the stable eval contract.
5. The existing same-repository secret-bearing PR workflow has an unresolved trust-boundary finding. Paid evals must not execute PR-controlled custom-provider code with secrets under that workflow design.

Promptfoo should therefore be introduced as a thin, package-local adapter around the importable PR reviewer, not as a replacement for the agent and not as a direct `openrouter:*` target. A direct OpenRouter target would bypass the ToolLoopAgent, tools, production prompt construction, structured output validation, and SHA check—the very behavior the eval is meant to measure.

## Detailed Findings

### 1. Two distinct reviewer contracts must remain separate

The package contains two related but non-interchangeable evaluation surfaces:

- The generic reviewer accepts an arbitrary prompt plus `repositoryRoot` and returns only `{ findings }` (`packages/code-reviewer/src/agent/reviewer.ts:12-14`, `packages/code-reviewer/src/schemas/code-review.ts:15-23`).
- The PR reviewer accepts a strict `PullRequestReviewRequest`, constructs the user prompt itself, and returns `reviewedCommitSha`, three scored criteria, and findings (`packages/code-reviewer/src/pull-request/reviewer.ts:13-15`, `packages/code-reviewer/src/pull-request/schema.ts:128-147`).
- Pass/fail remains deterministic application policy and is not model output (`packages/code-reviewer/src/pull-request/policy.ts:3-23`).

The first useful Promptfoo suite should target the PR reviewer because it exercises the production CI review contract. The generic reviewer can have a separate suite later. Combining them would either weaken the generic `{ findings }` contract or lose PR scoring and identity guarantees.

### 2. Prompt reuse is good for baselines, incomplete for experiments

The generic instructions and default request are standalone exports (`packages/code-reviewer/src/prompts/code-review.ts:1-17`). The PR instructions and deterministic prompt builder are also isolated (`packages/code-reviewer/src/pull-request/prompt.ts:3-51`). The PR builder validates its typed input and serializes identity, title, body, changed-file manifest, and patch into separately delimited untrusted JSON sections. That is a strong basis for fixture-driven eval cases and avoids duplicating the production prompt in Promptfoo YAML.

However, the instructions are monolithic string constants with no version/id metadata. Both private ToolLoopAgent builders hard-code the instructions (`packages/code-reviewer/src/agent/reviewer.ts:16-29`, `packages/code-reviewer/src/pull-request/reviewer.ts:17-30`). The current prompt tests mostly assert that selected substrings exist (`packages/code-reviewer/src/prompts/code-review.test.ts:5-35`, `packages/code-reviewer/src/pull-request/prompt.test.ts:17-50`).

Consequences:

- A baseline eval can reuse the production prompt without duplication.
- A model comparison is already possible through injected `LanguageModel` instances.
- An A/B comparison of instruction variants cannot use the same production factory today. Copying the whole factory or prompt into an eval adapter would create drift.
- Prompt version/hash should be part of eval metadata and any later cache key.

Recommended minimal seam: preserve current defaults but allow `createPullRequestReviewer(model, { instructions? })`. Do not expose every ToolLoopAgent knob initially. Add tool/step policy injection only when there is a concrete experiment that requires it.

### 3. Agent injection is strong; stable importability is incomplete

Both agent implementations accept an injected AI SDK model (`packages/code-reviewer/src/agent/reviewer.ts:32-43`, `packages/code-reviewer/src/pull-request/reviewer.ts:33-62`). Existing `MockLanguageModelV4` tests prove direct structured responses, one tool round, invalid-output rejection, step-budget failure, and reviewed-SHA enforcement (`packages/code-reviewer/src/agent/reviewer.test.ts:34-112`, `packages/code-reviewer/src/pull-request/reviewer.test.ts:73-139`). This is the most important precondition for evals.

The stable package surface is weaker:

- `src/index.ts` exports the generic factory, generic prompts/schemas, PR orchestration, PR input acquisition, and comment rendering (`packages/code-reviewer/src/index.ts:1-20`).
- It does not export `createPullRequestReviewer`, `PullRequestReviewer`, `buildPullRequestReviewPrompt`, `PULL_REQUEST_REVIEWER_INSTRUCTIONS`, PR request/result schemas and types, or `generatePullRequestReview`.
- `package.json` declares a private ESM package but has no `main`, `exports`, or build script (`packages/code-reviewer/package.json:2-13`). The README therefore documents source-relative imports (`packages/code-reviewer/README.md:31-39`).

A package-local Promptfoo TypeScript provider can deep-import `src/pull-request/*` for a proof of concept. Before making evals a maintained gate, expose an intentional PR-eval surface through the barrel or a subpath export.

There is also a nuance in the current import-safety claim. Imports do not validate credentials, access the filesystem, call a provider, or print CLI output, as tested in `packages/code-reviewer/src/index.test.ts:3-19`. But importing the root barrel evaluates the default generic singleton: it reads `OPENROUTER_MODEL`, creates an OpenRouter provider, and constructs `reviewer` at module load (`packages/code-reviewer/src/agent/reviewer.ts:45-48`). The PR factory module itself has no equivalent singleton. Eval adapters should import/use explicit factories, never the default `reviewer` singleton, so each model/config is controlled per provider instance.

### 4. Structured outputs are highly eval-friendly

The generic public/provider schemas are strict and bounded and normalize nullable transport keys into optional domain keys (`packages/code-reviewer/src/schemas/code-review.ts:3-50`). The PR request and result schemas validate repository identity, SHA format, bounded body/patch/files, criterion scores, evidence, severities, paths, lines, and finding counts (`packages/code-reviewer/src/pull-request/schema.ts:5-58`, `packages/code-reviewer/src/pull-request/schema.ts:60-142`). Provider results are normalized and reparsed (`packages/code-reviewer/src/pull-request/schema.ts:149-175`), then the reviewer independently rejects a result whose reviewed SHA differs from the requested head (`packages/code-reviewer/src/pull-request/reviewer.ts:43-56`).

This supports a layered assertion strategy:

1. Contract: valid JSON and schema-conformant result.
2. Identity: exact `reviewedCommitSha`.
3. Detection: required finding(s) for seeded defects and zero forbidden false positives for clean cases.
4. Localization: repository-relative path and expected line/hunk.
5. Classification: acceptable severity set rather than brittle exact wording.
6. Scoring: bounded criteria plus calibration bands for known fixture quality.
7. Semantics: a pinned LLM judge only where deterministic assertions cannot express evidence quality or actionability.

Do not assert exact finding prose. It is needlessly brittle and obscures whether the underlying review remained correct.

### 5. Real agent evals require immutable repository fixtures

Both reviewers bind the same repository tools through call-scoped `toolsContext` (`packages/code-reviewer/src/agent/reviewer.ts:20-27`, `packages/code-reviewer/src/pull-request/reviewer.ts:21-29`). The tools enforce repository-relative paths, containment and symlink rejection, a 256 KiB file limit, a 50-match limit, and ignored `.git`, `node_modules`, and `dist` directories (`packages/code-reviewer/src/tools/repository.ts:6-15`, `packages/code-reviewer/src/tools/repository.ts:60-133`, `packages/code-reviewer/src/tools/repository.ts:153-194`, `packages/code-reviewer/src/tools/repository.ts:216-297`).

A prompt-only dataset would test structured generation but not the production reviewer's evidence gathering. Each PR eval row should resolve to a small immutable fixture repository and a matching typed PR request. Fixture contents, patch, expected defect labels, expected/forbidden paths, and head SHA must move together. Avoid using the live working tree as a golden dataset because line numbers and evidence change over time.

Suggested package-local structure for a later implementation:

```text
packages/code-reviewer/
  evals/
    promptfooconfig.yaml
    provider.ts
    assertions.ts
    cases/
      smoke.yaml
      holdout.yaml
    fixtures/
      missed-error/
      clean-change/
      prompt-injection/
```

Start with curated cases derived from known defects and clean controls. Maintain a development set and a holdout set. Synthetic case generation can expand coverage later but should not define the initial oracle.

### 6. Promptfoo fits the stack

Current official Promptfoo documentation establishes the following:

- Custom providers support JavaScript, ESM, and TypeScript; their minimal interface is `id()` plus `callApi()`. The provider output may be text or structured data and can report the actual generated prompt, token usage, cost, and metadata. TypeScript providers execute in Node, and the docs recommend running from the relevant project root or compiling when imports depend on bundler-only behavior ([custom JavaScript provider](https://www.promptfoo.dev/docs/providers/custom-api/)).
- Promptfoo's Node package exposes `evaluate()` and typed configuration/results for programmatic use ([Node package](https://www.promptfoo.dev/docs/usage/node-package/), [Node API reference](https://www.promptfoo.dev/docs/usage/node-api-reference/)).
- Tests can live in YAML, JSON, JSONL, CSV, TypeScript, or JavaScript and can be grouped and filtered through metadata ([test cases](https://www.promptfoo.dev/docs/configuration/test-cases/)).
- Assertions include JSON/schema validation, JavaScript functions, thresholds, metrics, and model-graded rubrics. Official guidance recommends deterministic checks before progressively more expensive judges ([assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/), [JSON evals](https://www.promptfoo.dev/docs/guides/evaluate-json/), [LLM as a judge](https://www.promptfoo.dev/docs/guides/llm-as-a-judge/)).
- Promptfoo has a built-in OpenRouter provider using `OPENROUTER_API_KEY`, suitable for the judge or a direct-model baseline ([OpenRouter provider](https://www.promptfoo.dev/docs/providers/openrouter/)). It should not be the main target for this suite because it bypasses the local agent.
- CLI/CI output supports JSON, HTML, and JUnit, and evaluation failures have a distinct exit code. Promptfoo also supports pass-rate thresholds and explicit result processing ([CI/CD integration](https://www.promptfoo.dev/docs/integrations/ci-cd/), [CLI](https://www.promptfoo.dev/docs/usage/command-line/)).
- Promptfoo currently requires Node `>=22.22.0` and recommends Node 24 LTS ([installation](https://www.promptfoo.dev/docs/installation/)). This checkout runs Node `24.15.0`, while the PR review action also pins `24.15.0` (`../.github/actions/ai-pr-review/action.yml:31-41`).

Promptfoo also maintains an official Vercel AI SDK integration example. It demonstrates an AI SDK call behind a custom provider, not a native AI SDK 7 `ToolLoopAgent` integration. Compatibility here is therefore architectural through the custom provider interface, not a claim that Promptfoo directly understands this agent class ([AI SDK example](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-vercel/ai-sdk)).

### 7. Recommended adapter boundary

The Promptfoo target should be a thin TypeScript custom provider with this responsibility:

1. Read a fixture/case identifier and typed PR request from Promptfoo test vars.
2. Parse the request with `pullRequestReviewRequestSchema`.
3. Resolve `repositoryRoot` only beneath the committed eval fixture root.
4. Create the chosen OpenRouter AI SDK model from provider config and process-only `OPENROUTER_API_KEY`.
5. Call `createPullRequestReviewer(model, { instructions })`.
6. Return `JSON.stringify(result)` as `output`, plus prompt/model/case metadata where safe.
7. Convert operational failure into a Promptfoo provider error without leaking raw provider exception text or secrets.

Although Promptfoo can return structured output objects, serializing the review result makes `is-json`, JSON Schema, exports, and JavaScript assertions unambiguous.

The adapter must not call `runPullRequestOrchestrator()`: that layer acquires/publishes GitHub state and applies labels/comments (`packages/code-reviewer/src/pull-request/orchestrator.ts:10-17`, `packages/code-reviewer/src/pull-request/orchestrator.ts:67-101`). Evals should call the reviewer directly.

### 8. Metrics and rollout

Recommended first metrics:

- `contract_valid`: result passes the PR result schema.
- `identity_exact`: reviewed SHA exactly matches the fixture request.
- `defect_recall`: known actionable defect was found.
- `clean_precision`: no actionable finding on clean controls.
- `location_accuracy`: expected path and acceptable line/hunk.
- `severity_accuracy`: severity falls within an allowed set.
- `evidence_quality`: criterion evidence points to the fixture and supports the rationale.
- `score_calibration`: documentation/test scores remain in expected bands.
- `injection_resistance`: PR title/body/patch instructions do not override the reviewer contract.
- `operational_success`: no provider/schema/step-budget failure.

Roll out in three layers:

1. **Adapter contract (Vitest, no provider):** schema parsing, safe fixture-root resolution, output serialization, error redaction, and config mapping.
2. **Small live Promptfoo smoke suite:** deterministic assertions, `--no-cache` during calibration, explicitly pinned target model/config, repeated runs for flaky rows, and JSON/JUnit artifacts.
3. **Semantic and trajectory suite:** pinned OpenRouter judge for actionability/evidence rubrics; later add AI SDK telemetry and Promptfoo trajectory assertions if tool-use behavior must be measured. Promptfoo's trace integration is experimental, so it should not block the first eval version.

Caching should initially be disabled. A later cache key must include fixture content/diff, prompt id or hash, agent policy, target model/config, and package commit. Do not assume Promptfoo automatically caches provider calls hidden inside a custom agent adapter.

### 9. CI, security, privacy, and cost boundaries

Promptfoo can emit CI-friendly artifacts and enforce thresholds, but a live LLM eval is stochastic, paid, and secret-bearing. Recommended execution split:

- Run adapter/schema/unit checks in ordinary package CI.
- Run a very small live smoke set only from a trusted workflow definition.
- Run fuller model-graded suites manually, on a schedule, or behind an explicitly trusted gate.
- Pin target and judge providers/models/configurations. Use deterministic assertions as the primary gate and pass-rate thresholds for subjective rows.
- Keep all credentials process-only. Do not place keys in YAML, datasets, exports, comments, or committed fixture metadata.
- Do not use `--share`. For a strict local posture, set `PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_REMOTE_GENERATION=true`, and `PROMPTFOO_DISABLE_SHARING=1`; note that disabling remote generation is not general network isolation ([Promptfoo data handling](https://www.promptfoo.dev/docs/red-team/troubleshooting/data-handling/)).
- Treat JSON/HTML exports as potentially sensitive: Promptfoo warns that config redaction is best-effort and non-sensitive config values can remain in exports ([output formats](https://www.promptfoo.dev/docs/configuration/outputs/)). Prefer JUnit when CI needs only pass/fail detail, and inspect artifact contents before retention or publication.

The unresolved workflow-definition trust issue is directly relevant. The current implementation review found that a same-repository PR can modify the secret-bearing, write-capable `pull_request` workflow; checking out a base-SHA local action does not secure the workflow definition (`context/changes/ci-cd-code-review/reviews/impl-review-phase-3.md:24-41`). That finding was skipped, not fixed. Adding Promptfoo's custom provider to that execution context would increase the amount of attacker-controlled code running with provider credentials.

### 10. Alternatives

No material incompatibility justifies changing the first choice:

- **Vitest only** preserves perfect TypeScript fidelity and should test adapter/schema code, but it would require building dataset loading, result comparison, judges, caching, CLI reporting, and experiment UX. It complements Promptfoo rather than replacing it.
- **DeepEval** is Python-first and would add a cross-language bridge around a TypeScript agent.
- **OpenAI Evals** is also Python-oriented and less natural for the existing OpenRouter + AI SDK abstraction.

A deeper tool bake-off would add research cost without changing the decision. Revisit alternatives only if implementation discovers a concrete Promptfoo blocker, such as unstable loading of the package's TypeScript source or insufficient trace fidelity.

## Code References

- `packages/code-reviewer/package.json:2-27` - Private NodeNext ESM package, Node engine, scripts, and dependencies; no Promptfoo or build/export map.
- `packages/code-reviewer/src/index.ts:1-20` - Current public barrel; generic eval surface is exported, PR agent contracts are not.
- `packages/code-reviewer/src/prompts/code-review.ts:1-17` - Importable generic instructions and default request.
- `packages/code-reviewer/src/agent/reviewer.ts:12-48` - Generic reviewer interface/factory, hard-coded ToolLoopAgent policy, and default singleton.
- `packages/code-reviewer/src/pull-request/prompt.ts:3-51` - PR system instructions and deterministic untrusted-data prompt builder.
- `packages/code-reviewer/src/pull-request/reviewer.ts:13-62` - Injectable PR reviewer and reviewed-SHA enforcement.
- `packages/code-reviewer/src/pull-request/schema.ts:39-175` - Typed PR input, provider/public output contracts, bounds, and normalization.
- `packages/code-reviewer/src/tools/repository.ts:6-15` - Tool bounds and ignored directories.
- `packages/code-reviewer/src/tools/repository.ts:60-133` - Path containment and symlink protections.
- `packages/code-reviewer/src/tools/repository.ts:153-297` - Read/search implementations and AI SDK tool declarations.
- `packages/code-reviewer/src/pull-request/orchestrator.ts:67-101` - GitHub-state orchestration boundary that evals should bypass.
- `../.github/actions/ai-pr-review/action.yml:31-41` - Existing Node 24.15.0 runtime and package-local installation.

## Architecture Insights

The package already follows an eval-friendly core pattern: typed input -> deterministic prompt construction -> injected model + bounded tools -> strict provider schema -> normalized domain result -> deterministic application policy. Preserve those boundaries.

The best eval architecture is an outside-in harness, not Promptfoo-specific code inside the reviewer. Promptfoo owns cases, repetitions, assertions, reports, and judge configuration. The package owns prompt construction, ToolLoopAgent behavior, schemas, repository access, and result normalization. A thin adapter translates between those contracts.

Prompt evaluation and agent evaluation are different layers:

- A prompt eval measures final output for fixed evidence.
- An agent eval also measures whether the model selected and used repository tools effectively within the one-tool-round/three-step policy.
- A workflow eval would additionally exercise GitHub input/publication, which is out of scope for the initial quality suite and belongs in deterministic integration tests.

## Historical Context (from prior changes)

Future Promptfoo compatibility was an explicit design goal of the ToolLoopAgent change. Its brief calls for extracted prompts/schemas, an exported reusable reviewer, and injected models, while explicitly excluding Promptfoo dependencies, datasets, scripts, environment variables, and CI (`context/changes/tool-loop-agent/change.md:12`, `context/changes/tool-loop-agent/plan-brief.md:21-47`). The plan also requires the generic contract to remain `{ findings }` and imports to avoid secret validation, filesystem access, provider calls, and CLI behavior (`context/changes/tool-loop-agent/plan.md:44-50`, `context/changes/tool-loop-agent/plan.md:102-104`, `context/changes/tool-loop-agent/plan.md:191-213`).

The later CI change deliberately introduced a separate PR request/result/prompt/reviewer while preserving the generic reviewer (`context/changes/ci-cd-code-review/plan.md:5-7`, `context/changes/ci-cd-code-review/plan.md:74-112`). Its research recommends layered workflow/action/orchestration/agent boundaries and keeps paid live calls out of default deterministic tests (`context/changes/ci-cd-code-review/research.md:61-104`, `context/changes/ci-cd-code-review/research.md:134-147`).

Earlier diagnosis work provides a useful eval precedent: keep a machine-readable case corpus separate from the human rubric and define denominator/guardrail semantics (`context/archive/2026-05-28-diagnosis-quality-rubric/plan.md:133-165`); distinguish deterministic contract proof from live provider quality (`context/archive/2026-06-15-testing-diagnosis-contract-hardening/plan.md:43-57`, `context/archive/2026-06-15-testing-diagnosis-contract-hardening/plan.md:233-312`). That research also documents why schema validity alone cannot establish semantic answer quality (`context/archive/2026-06-15-testing-diagnosis-contract-hardening/research.md:60-68`, `context/archive/2026-06-15-testing-diagnosis-contract-hardening/research.md:165-169`).

Historical step-count descriptions conflict: the older ToolLoopAgent plan refers to two steps, while later artifacts and current code use a three-step budget. Current code is authoritative (`packages/code-reviewer/src/agent/reviewer.ts:27`, `packages/code-reviewer/src/pull-request/reviewer.ts:28`).

## Related Research

- `context/changes/ci-cd-code-review/research.md` - Current PR reviewer/workflow architecture, trust boundaries, and live-proof boundaries.
- `context/archive/2026-06-15-testing-diagnosis-contract-hardening/research.md` - Deterministic contract checks versus semantic/live-provider quality.
- `context/archive/2026-05-28-diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md` - Human-readable rubric precedent.
- `context/archive/2026-05-28-diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json` - Machine-readable case corpus precedent.
- `context/archive/2026-05-28-diagnosis-quality-rubric/reference/contract-surfaces.md` - Evaluation contract inventory precedent.

## Verification

Fresh package verification on 2026-09-12:

- `npm.cmd --prefix packages/code-reviewer test` - passed: 21 test files, 132 tests.
- `npm.cmd --prefix packages/code-reviewer run typecheck` - passed.
- Vitest emitted one non-blocking warning that root `vitest.config.ts` uses `__dirname`, which is unsupported by Vite's planned native config loader.
- `node --version` - `v24.15.0`.

The metadata commit was not reported by `git branch -r --contains HEAD`, so this document intentionally uses local `file:line` references rather than GitHub permalinks.

## Open Questions

1. Should the first maintained suite evaluate only the PR reviewer, or should the generic reviewer receive a separate smoke suite in the same change?
2. Which seeded defects and clean controls should define the initial development and holdout corpora? Known historical reviewer misses are the best starting candidates if their fixture code can be safely minimized.
3. Is prompt A/B testing required in version one? If yes, add instruction injection before the adapter; if no, keep the factory unchanged and establish a baseline first.
4. What live-eval budget and repetition count are acceptable per target model, and which model should grade semantic assertions independently of the target?
5. Which trusted CI event or manual/scheduled workflow should own provider secrets, given the unresolved same-repository PR workflow trust finding?
6. Should Promptfoo reports be retained locally only, or may sanitized JUnit/JSON artifacts be uploaded under an explicit retention policy?
