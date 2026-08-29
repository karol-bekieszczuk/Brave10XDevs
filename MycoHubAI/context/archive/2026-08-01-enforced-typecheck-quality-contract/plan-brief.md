# Enforced Typecheck Quality Contract — Plan Brief

> Full plan: `context/changes/enforced-typecheck-quality-contract/plan.md`
> Frame brief: `context/changes/enforced-typecheck-quality-contract/frame.md`

## What & Why

MycoHubAI has no enforceable, baseline-zero definition of static correctness shared by local scripts, CI, hooks, and 10x phase completion. Tests and runtime checks can pass while 26 deterministic Astro/TypeScript errors remain, so the change must both clear that accumulated evidence and repair the workflow that allowed it.

## Starting Point

`astro check` reports 26 errors: 11 missing Cloudflare runtime declarations, 10 dishonest Supabase/RPC contracts, and 5 genuine narrowing or optional-value problems. `package.json`, CI, Husky, the Codex hook, and 10x phases currently use different definitions of green.

## Desired End State

`npm run typecheck` is a non-mutating, zero-error contract that first checks committed Wrangler declarations for drift and then runs Astro diagnostics. CI, pre-commit, Codex feedback, and every 10x phase-closing workflow use that same authority, and a reversible failure probe proves they reject a real type error.

## Key Decisions Made

| Decision               | Choice                                                        | Why                                                                       | Source           |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------- |
| Diagnostic threshold   | Errors block; warnings/hints inform                           | Restores strict correctness without blocking on dependency deprecations   | Plan             |
| Cloudflare types       | Commit generated declaration and use `wrangler types --check` | Keeps typecheck non-mutating and detects config drift                     | Plan             |
| Gate frequency         | Before every phase close and commit                           | Prevents another red intermediate baseline from landing                   | Plan             |
| Recovery order         | Clear all 26 errors before first commit                       | The new rule cannot coexist with committed red sub-phases                 | Plan             |
| 10x policy storage     | Append-only `context/foundation/lessons.md`                   | All execution skills read it; 10x-cli manages AGENTS and installed skills | Plan             |
| Executable authorities | npm, Husky, CI, and Codex hook                                | Prose alone already failed to enforce the declared strategy               | Frame / Research |
| Upstream toolkit       | Separate future work                                          | Ignored CLI-managed skills are not a durable repo boundary                | Plan             |

## Scope

**In scope:**

- Wrangler-generated runtime/environment declarations and drift checking.
- All 26 current Astro/TypeScript errors and proportionate regression tests.
- Canonical `types:generate` and `typecheck` package scripts.
- CI, Husky, Codex hook, lessons registry, and test-plan reconciliation.
- Reversible proof that local enforcement rejects a deliberate type error.

**Out of scope:**

- Making warnings or hints blocking.
- Runtime/product behavior changes or data migrations.
- Editing `AGENTS.md`, ignored `.agents/skills/**`, reviewed Progress titles, or archives.
- Publishing an upstream 10x-cli correction.
- Marking the broader Quality Gates And Cookbook rollout complete prematurely.

## Architecture / Approach

Wrangler configuration generates the committed Worker declaration. The canonical typecheck verifies that declaration is current, then runs Astro diagnostics. Every durable consumer calls the package command: the Codex hook gives immediate feedback, Husky blocks local commits, CI blocks integration, and `lessons.md` makes the same command a phase-closing invariant for implement/TDD/E2E workflows.

## Phases at a Glance

| Phase            | What it delivers                                                                             | Key risk                                                |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1. Baseline-zero | Generated Worker types, honest SDK contracts, all 26 errors cleared, canonical command green | Type-only fixes accidentally change runtime behavior    |
| 2. Enforcement   | Shared CI/pre-commit/hook/10x gate plus reversible failure proof                             | A consumer duplicates or bypasses the canonical command |

**Prerequisites:** Installed project dependencies and Wrangler 4.94; no database, provider credentials, or secret-file access required.

**Estimated effort:** Approximately two implementation sessions across two phases, with one commit per phase after its full green gate.

## Open Risks & Assumptions

- The first phase is intentionally broad because no partial red commit is permitted after accepting the every-phase invariant.
- Generated Wrangler output may change when compatibility settings or CLI versions change; drift is expected to require reviewed regeneration.
- The current full typecheck costs roughly 13 seconds locally; the user explicitly accepted that phase/pre-commit cost.
- The Codex hook remains advisory by process exit and relies on its structured block payload; Husky and CI are the hard authorities.

## Success Criteria (Summary)

- `npm run typecheck` is non-mutating, reports zero errors, and rejects stale Worker declarations.
- Tests, lint, typecheck, and production build all pass after the 26-error cleanup.
- CI, Husky, Codex feedback, and 10x phase closure use the canonical command.
- A temporary deliberate type error is rejected, fully removed, and followed by a verified green recovery.
