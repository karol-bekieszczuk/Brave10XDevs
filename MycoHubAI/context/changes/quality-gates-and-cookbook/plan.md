# Quality Gates And Cookbook Implementation Plan

## Overview

Close rollout Phase 4 by making the existing static quality floor explicit and
non-mutating in local/CI workflows, then align the test cookbook and repository
documentation with the current Astro, Vitest, Supabase, Cloudflare, and
Playwright implementation. The change is intentionally documentation- and
workflow-focused; completed runtime, RLS, abuse, and browser proof remains in
its existing changes.

## Current State Analysis

The repository already has `npm run typecheck`, `npm run test:unit`,
`npm run lint`, and `npm run build` in the main CI job, preceded by `npx astro
sync` (`.github/workflows/ci.yml:18-27`). A separate CI job owns Chromium,
disposable local Supabase, and the reviewed Playwright scenario
(`.github/workflows/ci.yml:29-57`). The pre-commit hook runs `lint-staged` and
then the canonical typecheck (`.husky/pre-commit:1-4`).

The missing static gate is a non-mutating Prettier check: the repository has a
write-mode `format` script but no `format:check`, and CI does not validate
Markdown/YAML/workflow formatting independently. The cookbook in
`context/foundation/test-plan.md:139-209` already contains the accepted test
patterns, but has a `TBD` content-build subsection and stale tool/version
freshness notes. `README.md` and `CLAUDE.md` also describe CI more narrowly than
the actual workflow.

## Desired End State

The static CI floor is reproducible and visible: `format:check` runs as a
non-mutating gate alongside typecheck, unit tests, lint, and build. The existing
E2E job remains separate and local-only. Documentation accurately describes
the commands, current versions, cookbook patterns, manual gates, fixture
hygiene, and proof boundaries.

Verification consists of the static commands passing, the workflow and package
script being structurally reviewed, and a documentation review confirming that
no production, preview/staging, secret-file, broad-E2E, RLS, or provider-outage
scope was introduced.

### Key Discoveries:

- The canonical static type contract is `npm run typecheck` (`package.json:14`,
  `.husky/pre-commit:4`, `.github/workflows/ci.yml:20`).
- `wrangler types` is intentionally a separate manual generation step; the
  previously attempted hard check was removed for cross-shell instability
  (`package.json:13`, `context/foundation/test-plan.md:203-209`).
- Persisted RLS/admission and browser/SSR proof already have dedicated smoke
  and cookbook patterns (`scripts/smoke-ownership-rls.ts`,
  `scripts/smoke-runtime-provider-failure.ts`,
  `tests/e2e/e2e-quality-rules.md`).
- The checked-in package versions differ from stale test-plan notes: Astro 7.0.2
  and Vitest 4.1.7 (`package.json:31-32`, `package.json:78`).

## What We're NOT Doing

- Rebuilding or broadening the completed diagnosis, ownership, abuse, runtime,
  RLS, admission, or Playwright phases.
- Adding `wrangler types --check`, generated-declaration comparison, coverage
  thresholds, or a new `verify` aggregator command.
- Promoting smoke/E2E commands into the static gate or adding hosted,
  preview/staging, production-mutation, outage-simulation, or live-provider CI.
- Changing the existing ESLint warning policy or converting warnings to errors.
- Reading or modifying `.env`, `.dev.vars`, or other secret-bearing files.

## Implementation Approach

Make the smallest workflow contract change first: add `format:check` and run it
in the existing main CI job without changing the separate E2E topology. Then
update the foundation cookbook and short repository guidance from the actual
scripts/configuration, explicitly preserving the established cost × signal,
boundary-mocking, disposable-fixture, cleanup, and manual-confirmation rules.

## Phase 1: Establish the Static Quality Floor

### Overview

Add the missing non-mutating formatting gate and make the main CI sequence
explicit. Keep typecheck, lint warnings, generated Worker declarations, and
the separate E2E job under their existing policies.

### Changes Required:

#### 1. Package scripts

**File**: `package.json`

**Intent**: Add a canonical `format:check` script that validates repository
formatting without changing files, while retaining the existing write-mode
`format` command.

**Contract**: `format:check` invokes Prettier in check mode over the repository;
it must be usable locally and from CI and must not inspect secret contents.

#### 2. Main CI static job

**File**: `.github/workflows/ci.yml`

**Intent**: Run `npm run format:check` in the main validation job as part of the
static floor, alongside the existing Astro sync, typecheck, unit, lint, and
build steps.

**Contract**: The workflow remains validation-only for the main job; the E2E
job continues to own disposable local Supabase and Playwright execution. Do
not add provider, hosted Supabase, production, or generated-Worker hard gates.

### Success Criteria:

#### Automated Verification:

- `npm run format:check` passes and does not modify tracked files.
- `npm run typecheck` passes with zero diagnostics.
- `npm run test:unit` passes.
- `npm run lint` passes with the existing warning policy unchanged.
- `npm run build` passes using the repository's existing non-secret build env contract.

#### Manual Verification:

- Inspect `package.json` and `.github/workflows/ci.yml` to confirm the static
  gate order is explicit and E2E remains a separate job.
- Confirm the diff contains no `.env`, `.dev.vars`, hosted/production target,
  `wrangler types --check`, coverage policy, or `verify` script.
- Run `git diff --check` and review the workflow diff for valid YAML structure.

**Implementation Note**: After automated checks pass, pause for human
confirmation of the workflow/script diff before Phase 2.

## Phase 2: Align the Cookbook and Repository Guidance

### Overview

Bring the frozen test-plan cookbook and concise repository documentation into
agreement with the current quality floor and completed test infrastructure.

### Changes Required:

#### 1. Foundation test plan cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Complete Phase 4 documentation by updating the cookbook, static
gate description, stack/version freshness notes, and rollout status while
preserving the frozen strategy and deliberate exclusions.

**Contract**: Retain the existing sections for unit, integration, E2E,
endpoint, abuse/security, and static quality patterns. Replace the `TBD`
content-build subsection with a narrowly scoped rule for deterministic
content/build validation, document `format:check`, and update checked dates
and versions from committed configuration. State clearly which claims require
local persisted smoke or browser proof and which are not proven by static CI.

#### 2. Short repository guidance

**Files**: `README.md`, `CLAUDE.md`

**Intent**: Correct the abbreviated CI/script descriptions so contributors and
agents can discover the canonical static gate and understand the separate
runtime/E2E checks.

**Contract**: Document `format:check` and the actual typecheck/unit/lint/build
CI floor without expanding deployment instructions or secret handling. Keep
the repository's existing Astro/Cloudflare and single-user privacy guidance.

### Success Criteria:

#### Automated Verification:

- `npm run format:check` passes after all Markdown/YAML/documentation edits.
- `npm run typecheck` passes with zero diagnostics.
- `npm run test:unit` passes.
- `npm run lint` passes with no change to warning policy.
- `npm run build` passes.
- `git diff --check` passes.

#### Manual Verification:

- Read `context/foundation/test-plan.md` §6 end-to-end and confirm every
  cookbook subsection is actionable, has a local command where applicable,
  and preserves the cost × signal/proof-boundary rules.
- Confirm the freshness ledger and package-version references match the
  checked-in manifests and configuration.
- Confirm `README.md` and `CLAUDE.md` no longer claim CI is only lint/build and
  do not imply production readiness from local checks.
- Confirm no smell-based agar/grain checks, photo/image scope, sharing, saved
  chat, species/fruiting support, or additional environment was introduced.

**Implementation Note**: After automated checks pass, pause for human
confirmation of the documentation review before marking the change complete.

## Testing Strategy

### Static Checks:

- `npm run format:check` catches formatting drift without mutation.
- `npm run typecheck`, `npm run test:unit`, `npm run lint`, and `npm run build`
  preserve the existing static CI floor.

### Runtime and Persisted Proof:

- Keep `npm run test:rls`, `npm run test:runtime:provider-failure`,
  `npm run test:worker-runtime`, and `npm run test:e2e` as separate targeted
  commands. They are documented proof layers, not part of the new static gate.

### Documentation Review:

- Compare cookbook claims against `package.json`, `.github/workflows/ci.yml`,
  `.husky/pre-commit`, `playwright.config.ts`, and the existing smoke/E2E
  assets.

## Performance Considerations

Prettier check adds a deterministic repository scan to the main CI job. No
runtime request path, provider call, database query, or browser suite is
changed.

## Migration Notes

No database or data migration is required. This is a package-script, CI, and
documentation change. Existing local Supabase and Playwright setup remains
disposable and loopback-only.

## References

- Foundation strategy and cookbook: `context/foundation/test-plan.md`
- CI workflow: `.github/workflows/ci.yml`
- Local hook: `.husky/pre-commit`
- E2E rules: `tests/e2e/e2e-quality-rules.md`
- E2E harness: `scripts/run-e2e.ts`
- Persisted RLS/admission smoke: `scripts/smoke-ownership-rls.ts`
- Runtime provider-failure smoke: `scripts/smoke-runtime-provider-failure.ts`
- Existing invariant: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Establish the Static Quality Floor

#### Automated

- [x] 1.1 `npm run format:check` passes and does not modify tracked files. — 7507b7a
- [x] 1.2 `npm run typecheck` passes with zero diagnostics. — 7507b7a
- [x] 1.3 `npm run test:unit` passes. — 7507b7a
- [x] 1.4 `npm run lint` passes with the existing warning policy unchanged. — 7507b7a
- [x] 1.5 `npm run build` passes using the existing build env contract. — 7507b7a

#### Manual

- [x] 1.6 Package/CI diff confirms the static floor and separate E2E topology. — 7507b7a
- [x] 1.7 Diff contains no secret files, production target, Wrangler hard gate, coverage policy, or `verify` script. — 7507b7a
- [x] 1.8 `git diff --check` and workflow structure review pass. — 7507b7a

### Phase 2: Align the Cookbook and Repository Guidance

#### Automated

- [x] 2.1 `npm run format:check` passes after documentation edits.
- [x] 2.2 `npm run typecheck` passes with zero diagnostics.
- [x] 2.3 `npm run test:unit` passes.
- [x] 2.4 `npm run lint` passes with no warning-policy change.
- [x] 2.5 `npm run build` passes.
- [x] 2.6 `git diff --check` passes.

#### Manual

- [x] 2.7 `test-plan.md` §6 is actionable and preserves proof boundaries.
- [x] 2.8 Freshness ledger and package-version references match the checkout.
- [x] 2.9 `README.md` and `CLAUDE.md` describe the actual CI floor.
- [x] 2.10 Final documentation review confirms MVP scope and no extra environment or secret handling.
