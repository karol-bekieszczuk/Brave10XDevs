# Frame Brief: Enforced Typecheck Quality Contract

> Framing step before `/10x-plan`. This document separates the observed
> failure from the initial explanation and defines the actual planning target.

## Reported Observation

The application works in local manual testing and focused tests pass, while
`npm.cmd run astro -- check` reports 26 errors. The 10x workflow can still mark
implementation phases complete and create commits despite that red result.

## Initial Framing (preserved)

- **User's stated cause or approach**: The checker appears unable to see the runtime types that the working application uses, and the 10x workflow should have caught that discrepancy while creating the code.
- **User's proposed direction**: Make a durable correction rather than silence or narrow the hook.
- **Pre-dispatch narrowing**: The leading concern is preventing recurrence across the repository and 10x workflow, not merely clearing one hook result.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Cloudflare type environment** — runtime types may not be generated for the static checker.
2. **Application type contracts** — local SDK interfaces may not describe the real runtime objects.
3. **Executable verification chain** — package scripts, CI, hooks, and phase gates may enforce different definitions of green.
4. **10x completion semantics** — agents may be allowed to close phases using only commands explicitly listed in a plan.

## Hypothesis Investigation

| Hypothesis                               | Evidence                                                                                                                                                                                                                                                                       | Verdict |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Cloudflare types are absent              | `wrangler.jsonc` defines a Worker, but no `worker-configuration.d.ts` exists and package scripts never run `wrangler types`. This accounts for 11 errors involving Worker globals and `cloudflare:workers`.                                                                    | STRONG  |
| Local SDK types contradict runtime       | `src/lib/supabase.ts` replaces the inferred client with `as unknown as SupabaseServerClient`; consumers later require the full client. `DiagnosisRetrievalClient.rpc()` promises a native `Promise`, while Supabase returns an awaitable builder. This accounts for 10 errors. | STRONG  |
| Remaining narrowing errors are real      | The live evaluator indexes an undiscriminated response union, category filtering does not narrow the later property, authorization returns a boolean rather than a type predicate, and the provider key remains optional. This accounts for 5 errors.                          | STRONG  |
| Phase 2 introduced the red baseline      | Git history places every current error-producing line before the Phase 2 commit; the Phase 2 diff did not modify those lines.                                                                                                                                                  | NONE    |
| Verification has one canonical authority | `package.json`, pre-commit, CI, the Codex hook, and 10x plans run different gates. Only the PostToolUse hook runs `astro check`.                                                                                                                                               | NONE    |
| 10x completion requires typecheck        | The active plan requires focused Vitest in Phase 2 and tests/lint/build in Phase 5. Neither phase requires `astro check`; Astro build transpiles without type checking.                                                                                                        | NONE    |

## Narrowing Signals

- The user manually exercised the diagnosis flow successfully; this rules out a broad runtime outage.
- A fresh `astro check` reproduces exactly 26 deterministic errors, so the red state is not stale terminal output.
- The quality strategy declares lint plus typecheck required locally and in CI, while neither a canonical typecheck script nor a CI typecheck step exists.
- Offending code predates the PostToolUse hook; the hook was installed on an already-red baseline.
- Independent technical, verification-chain, and history investigations converged on the same boundary failure.

## Cross-System Convention

Astro documents that `astro dev` and `astro build` transpile without performing
type checking. `astro check` is the dedicated CI-capable diagnostic command.
The Cloudflare adapter documentation expects Wrangler-generated runtime types.
A durable quality contract therefore needs an executable repository command
and an authoritative CI gate; editor or post-edit feedback cannot be the sole
source of truth.

## Reframed Problem Statement

> **The actual problem to plan around is**: MycoHubAI has no enforceable,
> baseline-zero definition of static correctness shared by local scripts, CI,
> hooks, and 10x phase completion.

Typecheck is declared required in planning prose but is absent from the
canonical scripts and CI. Agents can therefore satisfy every enumerated phase
criterion while knowingly leaving the only full checker red. The current 26
errors are the accumulated evidence of that process defect, not its complete
definition.

## Confidence

- **HIGH** — the failure reproduces locally, all 26 errors have identified technical causes, history disproves a Phase 2 regression, official Astro guidance confirms build is not a typecheck, and three independent investigations converged.

## What Changes for `/10x-plan`

The plan must establish and prove one baseline-zero static-quality contract
across repository scripts, CI, agent hooks, and 10x completion rules. Clearing
the current 26 errors is a prerequisite to enforcing that contract, not a
substitute for correcting the workflow that allowed them to accumulate.

## References

- `package.json:6-17`
- `.github/workflows/ci.yml:19-22`
- `.codex/hooks.json:5-11`
- `.codex/hooks/post-tool-use-astro-check.mjs:3-13`
- `context/foundation/test-plan.md:124-136`
- `context/changes/testing-ownership-abuse-mutation-boundaries/plan.md:186-195`
- `context/changes/testing-ownership-abuse-mutation-boundaries/plan.md:401-407`
- `src/lib/supabase.ts:27-52`
- `src/lib/diagnosis/retrieval.ts:28-34`
- `src/lib/runtime-env.ts:1-31`
- `src/pages/api/diagnosis/selected-log.ts:119-125`
- `scripts/evaluate-diagnosis-cases-live.ts:343-356`
- `scripts/evaluate-diagnosis-cases-live.ts:477-484`
- Investigation tasks: `type_system_hypothesis`, `verification_chain_hypothesis`, `history_process_hypothesis`
