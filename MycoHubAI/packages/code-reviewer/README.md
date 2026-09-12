# code-reviewer

`code-reviewer` is a source-consumed AI SDK 7 ToolLoopAgent for evidence-backed repository reviews. Its structured result is always:

```ts
{ findings: CodeReviewFinding[] }
```

An empty `findings` array means the reviewer found no actionable, evidence-backed issue. This is a breaking change from the prototype: `generateResponse()` now returns `Promise<CodeReviewResult>`, not prose.

## CLI

Export `OPENROUTER_API_KEY` in the shell or process environment. Optionally set `OPENROUTER_MODEL`; it defaults to `openai/gpt-4o`.

From the root of the repository you want to review, invoke the package-local `tsx` binary directly. This preserves that repository as the CLI's `process.cwd()` and therefore as the root available to review tools:

```powershell
$env:OPENROUTER_API_KEY = "..."
& .\packages\code-reviewer\node_modules\.bin\tsx.cmd .\packages\code-reviewer\src\cli.ts "Review this repository for actionable correctness issues"
```

To review a specific small diff, supply it in the request and require a repository read before the final result:

```powershell
$diff = git diff -- src/lib/utils.ts | Out-String
& .\packages\code-reviewer\node_modules\.bin\tsx.cmd .\packages\code-reviewer\src\cli.ts "Review this diff. First inspect src/lib/utils.ts, then report any actionable regression as structured JSON.`n`n$diff"
```

The command serializes the structured result as pretty JSON. Every tool-reported `filePath` is relative to the directory where the command was run. Errors go to stderr and produce a non-zero exit status. `npm run start` remains useful when your current directory is `packages/code-reviewer` itself; it will review that package rather than its parent repository.

## Programmatic use

```ts
import { createReviewer, generateResponse, reviewer } from "./src/index.js";

const result = await generateResponse("Review this repository.");
const injected = createReviewer(model);
const review = await reviewer.generate({ prompt: "Review this repository.", repositoryRoot: process.cwd() });
```

`reviewer` is ready for the configured OpenRouter model. `createReviewer(model)` supports injected models for deterministic tests and future evaluation adapters. Imports are side-effect-free: they do not validate secrets, invoke a provider, print CLI output, or access the filesystem.

Promptfoo is intentionally not configured in this package. The injectable factory makes a future adapter possible without adding Promptfoo dependencies, scripts, datasets, environment variables, or CI in this change.

## Pull request workflow entry point

`npm run review:pr` is the source entry point used by the repository-root AI review composite action. It reads the pull request payload from `GITHUB_EVENT_PATH`, reviews the explicit `REPOSITORY_ROOT`, and uses `GITHUB_TOKEN` only for the current pull request's marked bot comment and labels. `OPENROUTER_API_KEY` must be configured as a GitHub Actions repository secret; never store or print its value. The trusted workflow supplies these variables, so operators should not invoke this command manually against a live pull request.

The workflow accepts same-repository pull requests to `master` on `opened`, `reopened`, `ready_for_review`, and `synchronize`, plus `labeled` events for `ai-cr:review`. Fork and Dependabot pull requests are skipped. The title, body, changed-file manifest, and patch are untrusted data: the body is capped at 8,000 characters and a patch over 100 KiB fails closed. Per-pull-request concurrency cancels superseded runs, and the orchestrator checks the current head SHA before publishing so an older run cannot replace current state.

The PR-specific reviewer scores Documentation, Test coverage, and Test quality and reliability from 1 through 10. `ai-cr:passed` (`#0E8A16`) requires an average of at least 7, every score at least 5, and no `error` finding. `ai-cr:failed` (`#D93F0B`) is the advisory negative result. `ai-cr:error` (`#B60205`) represents an operational failure, while `ai-cr:review` (`#1D76DB`) is the transient retry command. Passed and failed reviews exit successfully; operational failures exit non-zero.

Operational categories distinguish invalid event or diff input, empty or oversized diffs, provider authentication/rate-limit/timeout/availability/request failures, malformed model output, reviewed-SHA mismatch, GitHub permission/rate-limit/API failures, and unclassified internal errors. When publication is available, the workflow updates the marked comment with a redacted category and applies `ai-cr:error`. If GitHub comment or label publication itself fails, consult the workflow log. Correct the underlying configuration or transient failure and re-add `ai-cr:review`; never place a credential in logs, labels, comments, or retry input.

From the `MycoHubAI` directory, reproduce the clean package boundary with:

```bash
npm.cmd --prefix packages/code-reviewer ci
npm.cmd --prefix packages/code-reviewer test
npm.cmd --prefix packages/code-reviewer run typecheck
```

Node 22 or newer is required. These deterministic tests do not call OpenRouter or GitHub; live integration requires a controlled same-repository pull request.
