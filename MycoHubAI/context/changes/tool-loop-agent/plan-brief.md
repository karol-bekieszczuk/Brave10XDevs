# Modular ToolLoopAgent Code Reviewer — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Convert the standalone code-reviewer prototype into a modular AI SDK 7 `ToolLoopAgent`. The change creates a reusable, import-safe reviewer with structured findings and read-only repository evidence tools, while making its API suitable for a future Promptfoo adapter without configuring Promptfoo now.

## Starting Point

`packages/code-reviewer/src/index.ts` currently combines environment parsing, OpenRouter setup, unstructured generation, and CLI execution. The standalone package has no review prompt, output schema, tools, tests, or tracked Git history, and root CI does not verify it.

## Desired End State

Consumers can import a ready OpenRouter-backed `reviewer` or call `createReviewer(model)` with another AI SDK model. Every review returns `{ findings: [...] }` validated by Zod, repository reads stay inside a caller-provided root, and the CLI outputs the same contract as JSON without causing side effects during imports.

## Key Decisions Made

| Decision              | Choice                                                      | Why                                                                                     |
| --------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Agent abstraction     | AI SDK 7 `ToolLoopAgent`                                    | It provides the reusable typed agent boundary requested by the change.                  |
| Output mode           | `Output.object({ schema })`                                 | Complete results are schema-validated and directly usable by future evaluators.         |
| Result shape          | Findings array only                                         | Keeps the contract focused; `{ findings: [] }` explicitly represents a clean review.    |
| Finding fields        | Severity, path, optional line, message, optional suggestion | Produces actionable, location-aware findings without a premature score or verdict.      |
| Loop and retry limits | Two steps and two provider retries                          | Bounds agent calls/cost while allowing one evidence round plus final structured output. |
| Tools                 | Read file and literal text search only                      | Gives the reviewer repository evidence without mutation or command execution.           |
| Repository boundary   | Caller-provided root through tool context                   | Makes the agent reusable while enforcing explicit filesystem scope.                     |
| Public API            | `reviewer` plus `createReviewer(model)`                     | Provides convenient default use and dependency injection for tests/future Promptfoo.    |
| Compatibility         | Keep `generateResponse()`, return structured data           | Preserves the documented entry name while adopting the new typed contract.              |
| Testing               | Vitest plus `MockLanguageModelV4`                           | Proves behavior deterministically without network, provider cost, or secrets.           |

## Scope

**In scope:**

- Extract bounded review schemas and inferred TypeScript types.
- Extract reviewer instructions and the default CLI request.
- Add root-scoped, read-only file and text-search tools.
- Export an import-safe default reviewer and injected-model factory.
- Preserve `readEnvironment()` and migrate `generateResponse()` to structured data.
- Separate the CLI from the public barrel and output JSON.
- Add deterministic package-local tests and update package documentation.

**Out of scope:**

- Promptfoo dependencies, configuration, cases, scripts, environment, or CI.
- Write/shell/Git/network tools, streaming/UI APIs, root workspace integration, or publishing/build output.
- Preserving `generateResponse(): Promise<string>` or prose CLI output.

## Architecture / Approach

The package is split into schema, prompt, environment, repository-tool, agent, adapter, CLI, and barrel modules. `createReviewer(model)` composes the same prompts, tools, `Output.object`, and two-step limit used by the exported `reviewer`; callers provide `repositoryRoot` only when invoking the agent. Vitest exercises the real composition with AI SDK's deterministic model mock.

## Phases at a Glance

| Phase                            | What it delivers                                                 | Key risk                                                      |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Contracts, prompts, and tools | Stable typed output plus sandboxed evidence gathering            | Path or symlink handling could escape the selected root.      |
| 2. Reusable reviewer API         | Factory, named reviewer, compatibility adapter, mock-agent tests | A second tool round would consume the final-output step.      |
| 3. CLI and public surface        | Side-effect-free barrel, JSON CLI, docs, final verification      | Existing callers must adapt from string to structured output. |

**Prerequisites:** Node 22+, package dependencies installable, and a shell-only `OPENROUTER_API_KEY` for the final manual smoke test.

**Estimated effort:** About 2–3 focused implementation sessions across three phases.

## Open Risks & Assumptions

- The two-step budget intentionally permits at most one tool-call round; prompts and tests must make that constraint visible and fail closed if the model tries another.
- The ready `reviewer` must defer API-key resolution until generation so imports remain safe for tests and future evaluation adapters.
- File/search caps favor predictable context size over exhaustive inspection of very large repositories.
- Root CI will not cover this standalone package in this change; package-local commands are the source of verification truth.

## Success Criteria (Summary)

- `reviewer`, `createReviewer(model)`, schemas/types, prompts, and the structured adapter are importable without secrets or CLI side effects.
- Deterministic tests prove schema enforcement, repository containment, one tool round plus final output, and the two-step/two-retry configuration.
- Package tests and typecheck pass, and a manual CLI run emits evidence-grounded JSON matching `codeReviewResultSchema`.
