# Modular ToolLoopAgent Code Reviewer Implementation Plan

## Overview

Refactor the standalone `packages/code-reviewer` prototype into a reusable AI SDK 7 code-review agent. The package will expose an import-safe OpenRouter-backed `reviewer`, an injectable `createReviewer(model)` factory, typed structured findings, isolated prompts and repository tools, a compatibility adapter, and a thin CLI while deliberately leaving Promptfoo setup for a future change.

## Current State Analysis

The package currently concentrates environment validation, OpenRouter construction, an unstructured `generateText()` call, and executable CLI behavior in one 39-line module. It has no review-specific prompt, structured result contract, tools, tests, package export map, or compiled distribution. The entire `packages/code-reviewer/` directory is currently untracked, so there is no package Git history to use as a compatibility baseline; the only stated public promise is the README's description of `readEnvironment()` and `generateResponse()`.

AI SDK `7.0.95` is installed locally. Its bundled, version-matched documentation defines `ToolLoopAgent` as the reusable abstraction, accepts structured output through `Output.object({ schema })`, defaults to 20 steps, and provides `MockLanguageModelV4` from `ai/test` for deterministic tests. The package is independent of the root npm project and CI workflow, so all verification for this change must run explicitly against `packages/code-reviewer`.

## Desired End State

`packages/code-reviewer/src/index.ts` is a side-effect-free public barrel. It exports a ready-to-use `reviewer`, `createReviewer(model)`, the review schemas and inferred types, prompt contracts, `readEnvironment()`, and a structured `generateResponse()` adapter. Importing that barrel neither validates secrets nor executes the CLI.

The reviewer uses two read-only repository tools scoped to a caller-provided repository root, produces `{ findings: CodeReviewFinding[] }` through `Output.object`, and explicitly limits both its agent loop and provider retries to two. The CLI remains runnable through the existing package scripts, emits JSON, and supplies `process.cwd()` as its repository root. Deterministic Vitest coverage proves contracts without network access or credentials.

### Key Discoveries:

- The existing environment, provider, generation, and CLI responsibilities are combined in `packages/code-reviewer/src/index.ts:1-38`.
- `readEnvironment()` and `generateResponse()` are described as stable integration points in `packages/code-reviewer/README.md:9`; this plan retains both names while intentionally changing `generateResponse()` from text to structured data.
- The package uses strict NodeNext ESM and includes `src/**/*.ts`, so internal relative imports must use runtime-correct `.js` specifiers (`packages/code-reviewer/tsconfig.json:2-12`).
- AI SDK documents reusable agent construction and `Output.object` at `packages/code-reviewer/node_modules/ai/docs/03-agents/02-building-agents.mdx:8-35,291-313`.
- ToolLoopAgent defaults to 20 steps, but structured output consumes an additional step when tools are used (`packages/code-reviewer/node_modules/ai/docs/03-agents/04-loop-control.mdx:19-31`; `packages/code-reviewer/node_modules/ai/docs/09-troubleshooting/14-tool-calling-with-structured-outputs.mdx:12-44`).
- AI SDK provides credential-free deterministic model mocks at `packages/code-reviewer/node_modules/ai/docs/03-ai-sdk-core/55-testing.mdx:6-23,102-133`.
- Root CI only installs and verifies the root npm project (`.github/workflows/ci.yml:18-24`); it does not cover this standalone package.
- The package manifest requires Node 22, while the lockfile root metadata still says Node 20; dependency installation must synchronize the lockfile (`packages/code-reviewer/package.json:11-17`; `packages/code-reviewer/package-lock.json:20-22`).

## What We're NOT Doing

- Adding Promptfoo dependencies, configuration, providers, datasets, assertions, scripts, environment variables, or CI jobs.
- Integrating `packages/code-reviewer` into the root npm workspace or root GitHub Actions workflow.
- Adding write, shell-execution, Git-mutation, network-search, or arbitrary-command tools.
- Adding streaming or UI-message APIs; the supported execution path remains non-streaming `generate()`.
- Publishing or bundling the package, adding a compiled `dist/` entrypoint, or creating a package export map for Node package consumers.
- Preserving the old `Promise<string>` return type of `generateResponse()`; the function name and role stay stable, but its result becomes typed structured data.
- Running live model calls as part of automated verification or setting up a live evaluation environment.

## Implementation Approach

Build the package from contracts inward. First establish bounded Zod output types, stable instructions, import-safe environment parsing, and two sandboxed read-only tools. Then compose them into an injectable ToolLoopAgent factory and an OpenRouter-backed exported reviewer, with a compatibility adapter for callers that still use `generateResponse()`. Finally isolate executable behavior in `cli.ts`, turn `index.ts` into a barrel, and update package documentation and scripts.

The structured result is an object because `Output.object` requires an object root:

- `CodeReviewResult`: `{ findings: CodeReviewFinding[] }`, with an empty array meaning no findings.
- `CodeReviewFinding`: required `severity`, `filePath`, and `message`; optional positive integer `line` and optional `suggestion`.
- `CodeReviewSeverity`: `error | warning | suggestion`.

The schema will cap findings at 20, file paths at 500 characters, and message/suggestion fields at 1,000 characters. These are provider-facing constraints as well as runtime validation boundaries.

## Critical Implementation Details

### Timing & lifecycle

Configure both `stopWhen: isStepCount(2)` and `maxRetries: 2`. Since final structured output consumes a step after tool use, the reviewer instructions must tell the model to request every needed read/search operation in one parallel tool-call round and use the second step for the final object. A second tool round cannot be allowed to silently replace the required structured result.

### State sequencing

Repository access is call-scoped, not constructor-scoped. Each tool receives the same required `repositoryRoot` through AI SDK `toolsContext`; `createReviewer(model)` stays model-only and reusable, while CLI and adapter callers supply the root at generation time.

### Security boundary

Containment checks must use normalized absolute paths and resolved real paths, not string-prefix checks alone. Reads must reject absolute inputs, `..` traversal, and symlink escapes; recursive search must not follow symbolic links and must skip `.git`, `node_modules`, and generated `dist` trees.

## Phase 1: Define Contracts, Prompts, and Read-Only Tools

### Overview

Create the stable review contract and safe evidence-gathering layer before introducing the agent. Add the package-local test runner in this phase so every subsequent module can be built against deterministic checks.

### Changes Required:

#### 1. Package test infrastructure

**Files**: `packages/code-reviewer/package.json`, `packages/code-reviewer/package-lock.json`

**Intent**: Add Vitest `4.1.x` as a development dependency and a one-shot package-local test script. Synchronize the lockfile so its root Node engine metadata matches the package's Node 22 requirement.

**Contract**: `npm --prefix packages/code-reviewer test` runs co-located `*.test.ts` files once. No Promptfoo dependency or evaluation script is introduced.

#### 2. Structured review output contract

**Files**: `packages/code-reviewer/src/schemas/code-review.ts`, `packages/code-reviewer/src/schemas/code-review.test.ts`

**Intent**: Extract the provider-facing review schema and inferred consumer types into a dedicated module. Encode actionable findings, bounded output, and an unambiguous empty-review representation.

**Contract**: Export `codeReviewSeveritySchema`, `codeReviewFindingSchema`, `codeReviewResultSchema`, `CodeReviewSeverity`, `CodeReviewFinding`, and `CodeReviewResult`. The root object contains only `findings`; each finding requires `severity`, `filePath`, and `message`, permits optional `line` and `suggestion`, and applies the agreed cardinality and text limits.

#### 3. Reviewer prompts

**Files**: `packages/code-reviewer/src/prompts/code-review.ts`, `packages/code-reviewer/src/prompts/code-review.test.ts`

**Intent**: Move the reviewer role, evidence rules, severity rubric, tool-loop budget, and CLI fallback request out of executable code. Make these values importable for deterministic assertions and future evaluation adapters.

**Contract**: Export stable reviewer instructions plus a default review request. Instructions require evidence-backed findings, exact repository-relative paths, no invented line numbers, an empty findings array when nothing actionable is found, one tool-call round at most, and output matching the schema.

#### 4. Environment configuration

**Files**: `packages/code-reviewer/src/config/environment.ts`, `packages/code-reviewer/src/config/environment.test.ts`

**Intent**: Preserve the existing validation contract while separating secret-dependent runtime configuration from importable agent definitions.

**Contract**: Export `environmentSchema`, `Environment`, `DEFAULT_OPENROUTER_MODEL`, and `readEnvironment(environment = process.env)`. Validation remains call-time only; no module import may require `OPENROUTER_API_KEY`.

#### 5. Repository tools and access boundary

**Files**: `packages/code-reviewer/src/tools/repository.ts`, `packages/code-reviewer/src/tools/repository.test.ts`

**Intent**: Provide only the read capabilities needed to substantiate a review: reading a repository-relative text file and searching repository text. Keep the tools reusable across injected and default agents.

**Contract**: Export a `repositoryTools` set containing `readFile` and `searchText`. Both require call-scoped `repositoryRoot`; `readFile` accepts a relative path and returns bounded text, while `searchText` accepts a non-empty literal query plus an optional relative subtree and returns at most 50 path/line matches. Reads above 256 KiB, binary content, absolute/traversal paths, realpath escapes, and symlink traversal are rejected with controlled tool errors.

### Success Criteria:

#### Automated Verification:

- Contract, prompt, and environment tests pass: `npm --prefix packages/code-reviewer test -- src/schemas/code-review.test.ts src/prompts/code-review.test.ts src/config/environment.test.ts`
- Repository tool tests pass, including traversal and symlink escape cases: `npm --prefix packages/code-reviewer test -- src/tools/repository.test.ts`
- Package type checking passes: `npm --prefix packages/code-reviewer run typecheck`
- Clean dependency installation succeeds from the synchronized lockfile: `npm --prefix packages/code-reviewer ci`

#### Manual Verification:

- Review the schema and prompt exports and confirm they express the selected severity, location, empty-result, and two-step behavior without adding a verdict or summary.
- Review representative tool results and rejection messages to confirm they are useful to the model without exposing content outside the supplied repository root.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation of the manual checks before proceeding.

---

## Phase 2: Build the Reusable Reviewer API

### Overview

Compose the contracts and tools into the reusable ToolLoopAgent surface, preserving an ergonomic default export path while enabling model injection for deterministic tests and future Promptfoo use.

### Changes Required:

#### 1. Reviewer factory and default reviewer

**Files**: `packages/code-reviewer/src/agent/reviewer.ts`, `packages/code-reviewer/src/agent/reviewer.test.ts`

**Intent**: Define the agent once, independently of CLI execution, and expose both the requested ready-to-use reviewer and a factory for alternate models.

**Contract**: Export `createReviewer(model)` and `reviewer`. Both use the same instructions, `repositoryTools`, `Output.object({ schema: codeReviewResultSchema })`, `stopWhen: isStepCount(2)`, and `maxRetries: 2`. The named `reviewer` uses OpenRouter plus the configured/default model but does not validate or capture an API key during import.

#### 2. Structured compatibility adapter

**Files**: `packages/code-reviewer/src/generate-response.ts`, `packages/code-reviewer/src/generate-response.test.ts`

**Intent**: Preserve `generateResponse()` as the simple call boundary documented by the current README while migrating it to the typed agent result.

**Contract**: `generateResponse(prompt, environment = process.env, repositoryRoot = process.cwd()): Promise<CodeReviewResult>` validates the supplied environment, constructs an OpenRouter model through `createReviewer`, supplies identical repository context to both tools, calls `generate({ prompt })`, and returns `result.output`. It does not serialize the result or swallow provider/schema errors.

#### 3. Deterministic agent behavior tests

**Files**: `packages/code-reviewer/src/agent/reviewer.test.ts`, `packages/code-reviewer/src/generate-response.test.ts`

**Intent**: Verify composition and lifecycle behavior without OpenRouter, network access, or secrets.

**Contract**: Use `MockLanguageModelV4` from `ai/test` to cover direct structured output, a single tool round followed by structured output, schema rejection, the two-step ceiling, and injected-model isolation. Use controlled module/provider mocks for the adapter and prove that importing the reviewer module with no API key has no side effects.

### Success Criteria:

#### Automated Verification:

- Reviewer and adapter unit tests pass without credentials or network access: `npm --prefix packages/code-reviewer test -- src/agent/reviewer.test.ts src/generate-response.test.ts`
- Tests prove one evidence-gathering round can produce validated structured findings within the two-step ceiling.
- Tests prove invalid structured output and attempts to exceed the two-step budget fail rather than returning unchecked data.
- Full package tests pass: `npm --prefix packages/code-reviewer test`
- Package type checking passes: `npm --prefix packages/code-reviewer run typecheck`

#### Manual Verification:

- Inspect the exported API from a consumer's perspective and confirm `reviewer` is convenient for normal use while `createReviewer(model)` is sufficient for a future Promptfoo adapter.
- Confirm importing the reviewer with `OPENROUTER_API_KEY` absent does not throw, perform I/O, or start a model request.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation of the manual checks before proceeding.

---

## Phase 3: Separate CLI and Finalize the Public Surface

### Overview

Finish the modular boundary by moving process behavior into a dedicated CLI, converting the old entrypoint into a barrel, and documenting the structured runtime contract.

### Changes Required:

#### 1. Side-effect-free public barrel

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Replace the monolithic implementation with the stable import surface future integrations and evaluations can consume.

**Contract**: Re-export `reviewer`, `createReviewer`, `generateResponse`, environment helpers, prompt exports, schemas, and inferred review types. The module contains no argv handling, logging, process exit mutation, provider call, or secret validation.

#### 2. Dedicated executable CLI

**Files**: `packages/code-reviewer/src/cli.ts`, `packages/code-reviewer/src/cli.test.ts`

**Intent**: Preserve command-line usage while keeping process concerns out of the reusable module graph.

**Contract**: The CLI joins argv into a raw review prompt, falls back to the exported default review request, calls `generateResponse()` with `process.cwd()` as `repositoryRoot`, writes pretty JSON for the `CodeReviewResult`, and maps failures to stderr plus a non-zero exit code. Direct-execution behavior lives only here.

#### 3. Package scripts and documentation

**Files**: `packages/code-reviewer/package.json`, `packages/code-reviewer/package-lock.json`, `packages/code-reviewer/README.md`, `packages/code-reviewer/.env.example`

**Intent**: Point existing commands at the new CLI and document both programmatic and command-line usage accurately.

**Contract**: `dev` and `start` execute `src/cli.ts`; `test` remains the deterministic Vitest gate. README documents JSON output, required environment, repository-root behavior, `reviewer`/factory/adapter imports, the breaking structured return type, and the explicit Promptfoo-ready-but-not-configured boundary. `.env.example` contains names/placeholders only.

### Success Criteria:

#### Automated Verification:

- CLI tests pass for argv/default prompt selection, JSON serialization, and controlled failure exit behavior: `npm --prefix packages/code-reviewer test -- src/cli.test.ts`
- Public barrel import-safety and named-export tests pass with no provider credentials.
- Full package tests pass: `npm --prefix packages/code-reviewer test`
- Package type checking passes: `npm --prefix packages/code-reviewer run typecheck`
- A clean package install and repeated verification pass: `npm --prefix packages/code-reviewer ci`, then `npm --prefix packages/code-reviewer test`, then `npm --prefix packages/code-reviewer run typecheck`
- Git diff contains no Promptfoo configuration, dependency, dataset, script, or environment addition.

#### Manual Verification:

- With `OPENROUTER_API_KEY` set only in the shell, run `npm --prefix packages/code-reviewer run start -- "Review this repository for actionable correctness issues"` and confirm it emits valid JSON matching `codeReviewResultSchema`.
- Run the CLI from a small disposable repository and confirm every reported `filePath` is relative to that repository and every supplied line is evidence-backed.
- Import `reviewer` and `createReviewer` from `src/index.ts` in a small TypeScript consumer and confirm no CLI output or secret validation occurs at import time.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation of the manual checks before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- Exercise every Zod enum, required field, optional field, empty-findings case, maximum boundary, and one-over-limit rejection.
- Assert stable prompt guardrails without snapshotting the entire prose, so wording can evolve without weakening behavior.
- Test environment trimming, defaults, missing-key failure, and import-time secret independence.
- Test repository path containment against absolute paths, `..`, sibling-prefix confusion, and symlinks that point outside the root.
- Test bounded file/search results, ignored directories, binary/oversized files, no-match behavior, and the 50-match ceiling.
- Use AI SDK's deterministic model mock for valid structured output, one tool round, invalid JSON/schema output, and loop exhaustion.
- Test the compatibility adapter and CLI through injected/module-mocked dependencies, never live OpenRouter.

### Integration Tests:

- Treat a ToolLoopAgent run with `MockLanguageModelV4`, real repository tools, a temporary repository fixture, and `result.output` parsing as the package-local integration seam.
- Verify that the same caller-provided root reaches both tools and that tool evidence can be converted into the final `CodeReviewResult` within two steps.
- Verify the public barrel can be imported in an environment with no API key and exposes the selected named contracts.

### Manual Testing Steps:

1. Export `OPENROUTER_API_KEY` in the current shell without writing it to a file.
2. Run the package CLI against the current working repository with an explicit review request.
3. Validate the emitted JSON with `codeReviewResultSchema` and inspect each path/line against source.
4. Repeat from a small disposable repository containing one known defect and one symlink pointing outside the root; confirm the defect is grounded and the external target is inaccessible.
5. Import the public module from a TypeScript consumer without invoking it; confirm there is no output, secret error, or filesystem access.

## Performance Considerations

The two-step limit bounds model-call amplification, while `maxRetries: 2` bounds provider retries separately. Tool output limits prevent a single read or broad search from consuming the model context: individual reads stop at 256 KiB and search stops at 50 matches, with generated/dependency directories excluded. The output schema caps both finding count and text sizes. This change does not add caching, indexing, streaming, or parallel filesystem workers.

## Migration Notes

The source-level public name `generateResponse()` remains available, but its return type changes from `Promise<string>` to `Promise<CodeReviewResult>`. CLI consumers likewise move from prose to a JSON object containing `findings`. Update README examples in the same phase so callers use `result.findings` or call `reviewer.generate()` and read `result.output`.

No database, persisted-data, deployment, or environment migration is required. `npm install`/`npm ci` work is limited to adding Vitest and synchronizing the package lockfile. The package remains private and source-consumed; adding a compiled package/export-map contract is deferred.

## References

- Task source: `packages/code-reviewer/src/index.ts:1-38`
- Current package contract: `packages/code-reviewer/README.md:5-9`
- Package scripts and dependencies: `packages/code-reviewer/package.json:6-22`
- Version-matched AI SDK skill: `packages/code-reviewer/.agents/skills/ai-sdk/SKILL.md:13-27,55-59`
- ToolLoopAgent guide: `packages/code-reviewer/node_modules/ai/docs/03-agents/02-building-agents.mdx:8-35,215-225,291-313,416-443`
- Loop control: `packages/code-reviewer/node_modules/ai/docs/03-agents/04-loop-control.mdx:15-53`
- Structured tool-loop caveat: `packages/code-reviewer/node_modules/ai/docs/09-troubleshooting/14-tool-calling-with-structured-outputs.mdx:12-44`
- Structured output contract: `packages/code-reviewer/node_modules/ai/docs/07-reference/01-ai-sdk-core/28-output.mdx:1-112`
- AI SDK testing utilities: `packages/code-reviewer/node_modules/ai/docs/03-ai-sdk-core/55-testing.mdx:1-133`
- Existing repository schema/prompt/provider separation: `src/lib/diagnosis/schema.ts:1-47`, `src/lib/diagnosis/prompt.ts:1-62`, `src/lib/diagnosis/provider.ts:69-117`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Define Contracts, Prompts, and Read-Only Tools

#### Automated

- [x] 1.1 Contract, prompt, and environment tests pass
- [x] 1.2 Repository tool tests pass, including traversal and symlink escape cases
- [x] 1.3 Package type checking passes
- [x] 1.4 Clean dependency installation succeeds from the synchronized lockfile

#### Manual

- [x] 1.5 Review the schema and prompt exports and confirm they express the selected severity, location, empty-result, and two-step behavior without adding a verdict or summary
- [x] 1.6 Review representative tool results and rejection messages to confirm they are useful to the model without exposing content outside the supplied repository root

### Phase 2: Build the Reusable Reviewer API

#### Automated

- [ ] 2.1 Reviewer and adapter unit tests pass without credentials or network access
- [ ] 2.2 Tests prove one evidence-gathering round can produce validated structured findings within the two-step ceiling
- [ ] 2.3 Tests prove invalid structured output and attempts to exceed the two-step budget fail rather than returning unchecked data
- [ ] 2.4 Full package tests pass
- [ ] 2.5 Package type checking passes

#### Manual

- [ ] 2.6 Inspect the exported API from a consumer's perspective and confirm `reviewer` is convenient for normal use while `createReviewer(model)` is sufficient for a future Promptfoo adapter
- [ ] 2.7 Confirm importing the reviewer with `OPENROUTER_API_KEY` absent does not throw, perform I/O, or start a model request

### Phase 3: Separate CLI and Finalize the Public Surface

#### Automated

- [ ] 3.1 CLI tests pass for argv/default prompt selection, JSON serialization, and controlled failure exit behavior
- [ ] 3.2 Public barrel import-safety and named-export tests pass
- [ ] 3.3 Full package tests pass
- [ ] 3.4 Package type checking passes
- [ ] 3.5 A clean package install and repeated verification pass
- [ ] 3.6 Git diff contains no Promptfoo configuration, dependency, dataset, script, or environment addition

#### Manual

- [ ] 3.7 With `OPENROUTER_API_KEY` set only in the shell, run the CLI and confirm it emits valid JSON matching `codeReviewResultSchema`
- [ ] 3.8 Run the CLI from a small disposable repository and confirm every reported `filePath` is relative to that repository and every supplied line is evidence-backed
- [ ] 3.9 Import `reviewer` and `createReviewer` from `src/index.ts` in a small TypeScript consumer and confirm no CLI output or secret validation occurs at import time
