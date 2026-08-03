# Enforced Typecheck Quality Contract Implementation Plan

## Overview

MycoHubAI currently has no enforceable, baseline-zero definition of static correctness shared by local scripts, CI, hooks, and 10x phase completion. This plan first clears the 26 deterministic Astro/TypeScript errors and establishes a canonical, non-mutating `npm run typecheck`; it then makes that command the shared authority for commits, CI, Codex feedback, and phase-closing workflow.

The implementation deliberately separates recovery from enforcement. Phase 1 must reach zero errors before its first commit because the approved contract forbids committing a red intermediate baseline. Phase 2 wires the already-green command into every durable repository enforcement point and proves that a controlled type error is rejected.

## Current State Analysis

`npm.cmd run astro -- check` currently reports 26 errors across 84 files. Eleven come from missing Wrangler-generated Cloudflare runtime declarations, ten from local Supabase/RPC interfaces that contradict the actual SDK client and awaitable builders, and five from genuine TypeScript narrowing or optional-value gaps. Focused tests and `astro build` can pass while this checker remains red because Astro development and build transpile without performing the dedicated static check.

The verification chain has five inconsistent definitions of green. `package.json` exposes tests, lint, and build but no typecheck; GitHub Actions runs sync, tests, lint, and build; Husky runs only lint-staged; the Codex hook calls raw `astro check`; and 10x phase drivers trust plan-enumerated checks. `context/foundation/test-plan.md` already declares lint plus typecheck required locally and in CI, demonstrating that documentation without an executable gate is insufficient.

The installed `.agents/skills/**` files are ignored, untracked, and managed by 10x-cli, while `AGENTS.md` contains a CLI-managed rules surface. They are not durable storage for this repository-specific contract. By contrast, `/10x-implement`, `/10x-tdd`, and `/10x-e2e` all read and internalize the tracked, append-only `context/foundation/lessons.md` before executing phases.

## Desired End State

The repository has one canonical command, `npm run typecheck`, that makes no file changes and exits nonzero when Wrangler declarations are stale or Astro/TypeScript reports an error. `worker-configuration.d.ts` is generated from `wrangler.jsonc`, committed, and checked for drift. The command reports zero errors; warnings and hints remain informational under the approved initial threshold.

GitHub Actions, Husky, and the Codex post-edit hook delegate to the canonical command rather than reconstructing it. Every 10x execution path receives an append-only lesson that typecheck is a phase-closing invariant: it must pass before automated verification is reported complete, the manual gate opens, staging begins, or a commit is proposed. A reversible failure probe proves the local command, pre-commit path, and Codex feedback path reject a deliberate type error, after which all existing gates return green.

### Key Discoveries:

- Astro's current TypeScript guidance confirms that `astro dev` and `astro build` transpile without type checking; `astro check` is the dedicated diagnostic command, and `astro sync` is invoked by it automatically.
- Wrangler 4.94 supports `wrangler types` and the non-mutating `wrangler types --check`; the default committed output is `worker-configuration.d.ts`, including runtime and environment types.
- `src/lib/supabase.ts:27-52` replaces the real SSR client with a handwritten facade through `as unknown as`, which causes nine downstream full-client incompatibilities.
- `src/lib/diagnosis/retrieval.ts:28-34` requires a native `Promise`, while Supabase RPC returns an awaitable PostgREST builder; the consumer only requires an honest awaitable result.
- The remaining errors are localized to `scripts/evaluate-diagnosis-cases-live.ts:343-484`, `src/pages/api/auth/signin.ts:35-41`, `src/middleware.ts:48-63`, and `src/pages/api/diagnosis/selected-log.ts:119-125`.
- `.github/workflows/ci.yml:19-22`, `.husky/pre-commit:1-2`, and `.codex/hooks/post-tool-use-astro-check.mjs:3-13` currently enforce different command sets.
- `context/foundation/lessons.md` is the durable policy surface read by all three installed Progress-writing execution skills; `AGENTS.md` and `.agents/skills/**` are excluded because 10x-cli manages them.

## What We're NOT Doing

- Not accepting, subtracting, or snapshotting the current 26 errors as a permanent baseline.
- Not making warnings or hints blocking in this change; only errors fail the initial contract.
- Not generating Worker declarations as a side effect of `npm run typecheck`.
- Not maintaining handwritten substitutes for Wrangler runtime globals or Cloudflare module declarations.
- Not changing runtime authentication, account-deletion, diagnosis, or grow-log behavior while correcting their type contracts.
- Not editing ignored or CLI-managed `.agents/skills/**` files.
- Not storing this repository-specific phase rule in `AGENTS.md`.
- Not modifying reviewed Progress titles in existing plans or any content under `context/archive/`.
- Not expanding this change into an upstream 10x-cli release; that is separate work.
- Not marking the broader Quality Gates And Cookbook rollout phase complete unless all of its independent goals are actually satisfied.

## Implementation Approach

Treat the checker output as three prerequisite clusters within one recovery phase: generate authoritative Cloudflare declarations; replace dishonest Supabase/RPC facades with types that match the runtime SDK and the narrow capabilities consumers need; then correct the five local narrowing and optional-value errors with focused regression tests. Add the canonical package scripts during the same phase and make the phase's only commit conditional on a zero-error `npm run typecheck` plus the existing test, lint, and build gates.

Once the baseline is green, delegate every durable consumer to the package command. CI and Husky provide hard failure boundaries, while the Codex hook remains immediate advisory feedback through its existing block payload. Record the phase-closing rule as an append-only lesson because every installed 10x execution skill reads that file. Prove enforcement with a uniquely named temporary TypeScript probe, require each expected failure signal, remove the probe in guaranteed cleanup, and rerun the complete green gate.

## Critical Implementation Details

### Timing & Lifecycle

Phase 1 cannot be split into commits by error category: the approved every-phase rule means the first commit is allowed only after all 26 diagnostics are cleared. Generate `worker-configuration.d.ts` before evaluating application diagnostics, but keep the final `typecheck` command non-mutating by using `wrangler types --check` rather than generation.

### Debug & Observability

The Codex hook intentionally communicates failure through its JSON `decision: "block"` payload while exiting zero so the host can consume feedback; do not misrepresent it as a hard process gate. The reversible failure probe must separately assert nonzero exits from the canonical command and Husky path, the hook's block payload, cleanup of the probe, and a final green rerun.

## Phase 1: Restore A Baseline-Zero Canonical Typecheck

### Overview

Eliminate every current static diagnostic without changing product behavior, commit authoritative Cloudflare declarations, and expose one non-mutating package command that defines static correctness.

### Changes Required:

#### 1. Cloudflare Runtime Declaration Contract

**File**: `worker-configuration.d.ts`, `wrangler.jsonc`, `tsconfig.json`, `package.json`

**Intent**: Replace the missing ambient Worker/runtime types with declarations generated from the actual Wrangler compatibility date, flags, bindings, and required secrets.

**Contract**: Add `types:generate` using the local Wrangler CLI and commit its default `worker-configuration.d.ts` output. Ensure the generated declaration participates in the Astro TypeScript project without excluding Astro, Node, Vitest, or package-provided types. Add canonical `typecheck` as a non-mutating sequence of `wrangler types --check` followed by `astro check`; generation remains an explicit maintenance command.

#### 2. Worker Entrypoint Type Adoption

**File**: `src/lib/runtime-env.ts`, `src/worker.ts`, `src/worker.test.ts`

**Intent**: Make the Worker entrypoint, scheduled handler, execution context, and `cloudflare:workers` import resolve through the generated runtime contract rather than handwritten ambient substitutes.

**Contract**: Existing fetch delegation, scheduled purge behavior, aggregate-only logging, optional runtime secrets, and test behavior remain unchanged. Worker-facing types must be compatible with the generated declarations and the current `wrangler.jsonc`; no casts may recreate the missing globals.

#### 3. Honest Supabase SSR Client Contract

**File**: `src/lib/supabase.ts`, `src/lib/auth-session.ts`, `src/lib/account-deletion/repository.ts`, `src/lib/grow-logs/repository.ts`

**Intent**: Remove the `as unknown as SupabaseServerClient` boundary and align consumers with the real `@supabase/ssr`/`@supabase/supabase-js` client while retaining narrow, mockable repository contracts.

**Contract**: `createClient` exposes its actual SSR client shape or an honestly assignable derived type. Downstream helpers accept only the capabilities they use when a full SDK client is unnecessary. Authentication, table operations, cookie handling, owner filtering, and null-on-missing-config behavior stay unchanged; no consumer may rely on a facade that omits runtime client members while claiming full compatibility.

#### 4. Awaitable Diagnosis Retrieval Contract

**File**: `src/lib/diagnosis/retrieval.ts`, `src/lib/diagnosis/service.ts`

**Intent**: Describe the Supabase RPC boundary as the awaitable operation it actually returns instead of requiring a native `Promise` implementation.

**Contract**: `DiagnosisRetrievalClient.rpc()` accepts the real Supabase PostgREST awaitable and deterministic test doubles, with the same `{ data, error }` result and mapping behavior. The contract must not require native `catch`, `finally`, or `Symbol.toStringTag` members that `await` does not use.

#### 5. Local Narrowing And Optional-Value Corrections

**File**: `src/lib/access-control.ts`, `src/middleware.ts`, `src/lib/diagnosis/provider.ts`, `src/pages/api/auth/signin.ts`, `src/pages/api/diagnosis/selected-log.ts`, `scripts/evaluate-diagnosis-cases-live.ts`

**Intent**: Correct the five genuine narrowing categories without changing public responses, authorization decisions, provider failure timing, or evaluator classification.

**Contract**: Authorization establishes a type predicate for an accepted user; middleware explicitly proves the client exists before owner-dependent work; the provider factory accepts the optional key it already validates; evaluator error-code typing selects the failure response member; and optional failure categories are narrowed before Map access. Existing controlled missing-key/provider behavior and live evaluator categories remain stable.

#### 6. Focused Regression Coverage

**File**: `src/worker.test.ts`, `src/lib/auth-session.test.ts`, `src/lib/account-deletion/repository.test.ts`, `src/lib/grow-logs/repository.test.ts`, `src/lib/diagnosis/retrieval.test.ts`, `src/lib/diagnosis/provider.test.ts`, `src/middleware.test.ts`, `src/pages/api/auth/signin.test.ts`, `src/pages/api/account/delete.test.ts`, `src/pages/api/diagnosis/selected-log.test.ts`

**Intent**: Preserve behavior at every adjusted capability boundary and add direct protection only where the type correction represents a runtime-relevant branch.

**Contract**: Tests cover undefined provider keys, authorized/null-user branching, SSR client capability use, RPC awaitable compatibility, Worker fetch/scheduled behavior, and unchanged controlled responses. Compile-only evaluator narrowing may remain protected by the canonical checker unless extracting helpers would independently improve production structure.

### Success Criteria:

#### Automated Verification:

- Cloudflare declarations generate successfully: `npm.cmd run types:generate`.
- Committed Cloudflare declarations are current without regeneration: `npx.cmd wrangler types --check`.
- Canonical static verification reports zero errors: `npm.cmd run typecheck`.
- Focused Worker, auth, Supabase, retrieval, provider, middleware, and route tests pass.
- Full unit and integration suite passes: `npm.cmd run test:unit`.
- Lint passes: `npm.cmd run lint`.
- Production build passes: `npm.cmd run build`.
- Search confirms no `as unknown as SupabaseServerClient` boundary or handwritten Cloudflare ambient fallback remains.

#### Manual Verification:

- Review `worker-configuration.d.ts` and confirm it contains type declarations only, no secret values or local credentials.
- Confirm the changed type contracts preserve existing authentication, account-deletion, Worker scheduling, and diagnosis error behavior.

**Implementation Note**: Complete all error clusters before opening this phase's manual gate or proposing its single commit. A partially reduced diagnostic count is not an acceptable intermediate baseline.

---

## Phase 2: Enforce The Contract Across Repository Workflows

### Overview

Make the green Phase 1 command authoritative in CI, pre-commit, Codex feedback, and every 10x phase-closing workflow, then prove both rejection and recovery paths.

### Changes Required:

#### 1. GitHub Actions Typecheck Gate

**File**: `.github/workflows/ci.yml`

**Intent**: Prevent pull requests and master pushes from passing when Worker declarations are stale or application diagnostics contain errors.

**Contract**: Run `npm run typecheck` after dependency installation/Astro sync and before tests, lint, and build. CI delegates to the package script and does not duplicate Wrangler or Astro subcommands. Existing build environment values and validation steps remain intact.

#### 2. Pre-Commit Phase Boundary

**File**: `.husky/pre-commit`

**Intent**: Reject every local commit that would preserve a stale declaration or TypeScript/Astro error, including commits from 10x phase drivers.

**Contract**: Retain lint-staged behavior, then run the canonical `npm run typecheck` against the resulting working tree. Any nonzero exit aborts the commit; there is no baseline override or warning-only escape hatch.

#### 3. Canonical Codex Feedback Hook

**File**: `.codex/hooks/post-tool-use-astro-check.mjs`, `.codex/hooks.json`

**Intent**: Give agents immediate feedback from the same command enforced by commits and CI rather than maintaining a second static-check recipe.

**Contract**: Replace the hook's direct Astro-check invocation with `npm.cmd run typecheck` while preserving normalized/truncated output, the existing JSON block payload, timeout, and host-compatible exit behavior. Keep unrelated-test feedback separate. Do not broaden the hook matcher or turn type generation into an edit-time side effect.

#### 4. Durable 10x Phase-Closing Lesson

**File**: `context/foundation/lessons.md`

**Intent**: Make every installed Progress-writing execution skill internalize the same phase rule from a tracked, append-only artifact that 10x-cli does not own as generated skill content.

**Contract**: Append a lesson named `Typecheck Is A Phase-Closing Invariant`. It requires `npm run typecheck` before reporting automated verification passed, opening the manual gate, staging, or committing any 10x phase. Failure blocks completion and must be fixed; agents must not accept, subtract, or grandfather a diagnostic baseline.

#### 5. Quality Strategy Reconciliation

**File**: `context/foundation/test-plan.md`

**Intent**: Reconcile the existing lint-plus-typecheck strategy with the command and enforcement points that now exist.

**Contract**: Name `npm run typecheck`, generated-type drift, local pre-commit, and CI enforcement in the Quality Gates/cookbook guidance, with `checked: 2026-08-01` for current Astro/Wrangler claims. Preserve unrelated rollout statuses and do not mark the broader Quality Gates And Cookbook phase complete solely because this static contract lands.

#### 6. Reversible Failure-Probe Verification

**File**: temporary `src/__typecheck_contract_probe__.ts` during verification only; no delivered file

**Intent**: Prove enforcement detects a real repository diagnostic rather than merely confirming command strings exist.

**Contract**: Create a uniquely named deliberate type error, assert `npm.cmd run typecheck` and direct Husky execution fail, and assert the Codex hook emits its block payload with the canonical failure. Remove the probe in guaranteed cleanup, verify it is absent, then rerun the complete green contract. Do not stage or commit the probe.

### Success Criteria:

#### Automated Verification:

- CI invokes `npm run typecheck` after Astro sync and before tests, lint, and build.
- Husky retains lint-staged and rejects a deliberate type error through the canonical typecheck command.
- The Codex hook delegates to `npm.cmd run typecheck` and emits a block payload for the deliberate type error.
- The reversible probe is removed and absent from Git status before final verification.
- `context/foundation/lessons.md` contains the phase-closing invariant read by implement, TDD, and E2E workflows.
- `context/foundation/test-plan.md` names the canonical static gate without falsely completing the broader rollout phase.
- Canonical static verification returns to zero errors: `npm.cmd run typecheck`.
- Full unit and integration suite passes: `npm.cmd run test:unit`.
- Lint passes: `npm.cmd run lint`.
- Production build passes: `npm.cmd run build`.
- Repository whitespace and conflict-marker validation passes: `git diff --check`.

#### Manual Verification:

- Review the failure-probe transcript and confirm command failure, pre-commit rejection, hook feedback, cleanup, and final green recovery were all observed.
- Confirm no `AGENTS.md`, `.agents/skills/**`, archived plan, or reviewed Progress title was modified.

**Implementation Note**: The deliberate error is verification state, never a commit boundary. Cleanup and a final green `npm run typecheck` are mandatory before staging.

---

## Testing Strategy

### Unit Tests:

- Preserve Worker fetch/scheduled delegation and aggregate-only logging while generated runtime types become authoritative.
- Exercise the narrow Supabase auth/table/RPC capabilities used by repositories and routes rather than recreating the full SDK in mocks.
- Cover authorization narrowing and missing provider-key behavior where type corrections correspond to real branches.
- Keep compile-only evaluator fixes under `npm run typecheck` unless extraction creates a useful independently testable unit.

### Integration Tests:

- Run existing middleware and API route tests with the corrected SSR client and provider contracts.
- Treat `wrangler types --check` plus `astro check` as the static integration boundary across Worker, Astro, scripts, tests, and route code.
- Verify CI, Husky, and the Codex hook all delegate to the same package command rather than asserting duplicated subcommand text.

### Manual Testing Steps:

1. Generate and review `worker-configuration.d.ts`, confirming no secret values are present.
2. Run `npm.cmd run typecheck` and confirm zero errors; warnings and hints are informational.
3. Create the uniquely named temporary type-error probe.
4. Confirm `npm.cmd run typecheck` fails.
5. Invoke the Husky pre-commit script directly and confirm it exits nonzero without creating a commit.
6. Invoke the Codex static-check hook and confirm its JSON feedback contains `decision: "block"` for the canonical failure.
7. Remove the probe and confirm Git status contains no probe path.
8. Run `npm.cmd run typecheck`, `npm.cmd run test:unit`, `npm.cmd run lint`, and `npm.cmd run build` successfully.
9. Review the lesson and workflow files to confirm phase completion, commits, and CI share the same command.

## Performance Considerations

The current full Astro check takes roughly 13 seconds on this Windows checkout. The approved policy accepts that cost before each phase commit in exchange for preventing red baselines from being preserved. The post-edit hook may run more often and remains feedback rather than a hard process gate; do not add type generation or the full test suite to that static feedback path.

Generated declaration drift checking is local and deterministic. It adds no production runtime cost, provider calls, database access, or network dependency beyond installed project tooling.

## Migration Notes

There is no data or deployment migration. `worker-configuration.d.ts` becomes a versioned generated artifact and must be regenerated whenever `wrangler.jsonc`, its compatibility date/flags, or bindings change. `npm run typecheck` detects stale output but intentionally does not repair it; contributors use `npm run types:generate` and review the resulting diff.

Existing reviewed Progress rows remain unchanged. Existing completed changes are historical evidence, not targets for retroactive rewriting. The new lesson and executable gates govern future phase transitions, including pending phases of already-open changes.

## References

- Frame brief: `context/changes/enforced-typecheck-quality-contract/frame.md`
- Change identity: `context/changes/enforced-typecheck-quality-contract/change.md`
- Quality strategy: `context/foundation/test-plan.md:122`
- Durable lessons registry: `context/foundation/lessons.md`
- Package scripts: `package.json:6`
- CI workflow: `.github/workflows/ci.yml:19`
- Pre-commit hook: `.husky/pre-commit:1`
- Codex static hook: `.codex/hooks/post-tool-use-astro-check.mjs:3`
- Wrangler configuration: `wrangler.jsonc:1`
- TypeScript project: `tsconfig.json:1`
- SSR client facade: `src/lib/supabase.ts:27`
- Diagnosis retrieval boundary: `src/lib/diagnosis/retrieval.ts:28`
- Worker entrypoint: `src/worker.ts:10`
- Runtime environment import: `src/lib/runtime-env.ts:1`
- Auth narrowing: `src/pages/api/auth/signin.ts:35`
- Provider optional-key boundary: `src/pages/api/diagnosis/selected-log.ts:119`
- Evaluator narrowing: `scripts/evaluate-diagnosis-cases-live.ts:343`
- Current Astro and Cloudflare/Wrangler documentation verified through Context7 on 2026-08-01.
- Local Wrangler 4.94 command surface verified with `npx.cmd wrangler types --help` on 2026-08-01.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Restore A Baseline-Zero Canonical Typecheck

#### Automated

- [x] 1.1 Cloudflare declarations generate successfully: `npm.cmd run types:generate`. — 967d9d1
- [x] 1.2 Committed Cloudflare declarations are current without regeneration: `npx.cmd wrangler types --check`. — 967d9d1
- [x] 1.3 Canonical static verification reports zero errors: `npm.cmd run typecheck`. — 967d9d1
- [x] 1.4 Focused Worker, auth, Supabase, retrieval, provider, middleware, and route tests pass. — 967d9d1
- [x] 1.5 Full unit and integration suite passes: `npm.cmd run test:unit`. — 967d9d1
- [x] 1.6 Lint passes: `npm.cmd run lint`. — 967d9d1
- [x] 1.7 Production build passes: `npm.cmd run build`. — 967d9d1
- [x] 1.8 Search confirms no `as unknown as SupabaseServerClient` boundary or handwritten Cloudflare ambient fallback remains. — 967d9d1

#### Manual

- [x] 1.9 Review `worker-configuration.d.ts` and confirm it contains type declarations only, no secret values or local credentials. — 967d9d1
- [x] 1.10 Confirm the changed type contracts preserve existing authentication, account-deletion, Worker scheduling, and diagnosis error behavior. — 967d9d1

### Phase 2: Enforce The Contract Across Repository Workflows

#### Automated

- [x] 2.1 CI invokes `npm run typecheck` after Astro sync and before tests, lint, and build. — 3027c2d
- [x] 2.2 Husky retains lint-staged and rejects a deliberate type error through the canonical typecheck command. — 3027c2d
- [x] 2.3 The Codex hook delegates to `npm.cmd run typecheck` and emits a block payload for the deliberate type error. — 3027c2d
- [x] 2.4 The reversible probe is removed and absent from Git status before final verification. — 3027c2d
- [x] 2.5 `context/foundation/lessons.md` contains the phase-closing invariant read by implement, TDD, and E2E workflows. — 3027c2d
- [x] 2.6 `context/foundation/test-plan.md` names the canonical static gate without falsely completing the broader rollout phase. — 3027c2d
- [x] 2.7 Canonical static verification returns to zero errors: `npm.cmd run typecheck`. — 3027c2d
- [x] 2.8 Full unit and integration suite passes: `npm.cmd run test:unit`. — 3027c2d
- [x] 2.9 Lint passes: `npm.cmd run lint`. — 3027c2d
- [x] 2.10 Production build passes: `npm.cmd run build`. — 3027c2d
- [x] 2.11 Repository whitespace and conflict-marker validation passes: `git diff --check`. — 3027c2d

#### Manual

- [x] 2.12 Review the failure-probe transcript and confirm command failure, pre-commit rejection, hook feedback, cleanup, and final green recovery were all observed. — 3027c2d
- [x] 2.13 Confirm no `AGENTS.md`, `.agents/skills/**`, archived plan, or reviewed Progress title was modified. — 3027c2d
