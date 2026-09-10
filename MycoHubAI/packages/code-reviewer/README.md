# code-reviewer

`code-reviewer` is a source-consumed AI SDK 7 ToolLoopAgent for evidence-backed repository reviews. Its structured result is always:

```ts
{ findings: CodeReviewFinding[] }
```

An empty `findings` array means the reviewer found no actionable, evidence-backed issue. This is a breaking change from the prototype: `generateResponse()` now returns `Promise<CodeReviewResult>`, not prose.

## CLI

Export `OPENROUTER_API_KEY` in the shell or process environment. Optionally set `OPENROUTER_MODEL`; it defaults to `openai/gpt-4o`.

```powershell
npm run start -- "Review this repository for actionable correctness issues"
```

The command serializes the structured result as pretty JSON. It supplies the current working directory as the repository root, so every tool-reported `filePath` is relative to the directory where the command was run. Errors go to stderr and produce a non-zero exit status.

## Programmatic use

```ts
import { createReviewer, generateResponse, reviewer } from "./src/index.js";

const result = await generateResponse("Review this repository.");
const injected = createReviewer(model);
const review = await reviewer.generate({ prompt: "Review this repository.", repositoryRoot: process.cwd() });
```

`reviewer` is ready for the configured OpenRouter model. `createReviewer(model)` supports injected models for deterministic tests and future evaluation adapters. Imports are side-effect-free: they do not validate secrets, invoke a provider, print CLI output, or access the filesystem.

Promptfoo is intentionally not configured in this package. The injectable factory makes a future adapter possible without adding Promptfoo dependencies, scripts, datasets, environment variables, or CI in this change.

Run package-local checks with `npm test` and `npm run typecheck`. Node 22 or newer is required.
