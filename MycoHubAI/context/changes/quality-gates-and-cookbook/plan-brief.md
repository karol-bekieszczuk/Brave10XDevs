# Quality Gates And Cookbook — Plan Brief

> Full plan: `context/changes/quality-gates-and-cookbook/plan.md`
> Research: `context/foundation/test-plan.md` and current repository configuration

## What & Why

Phase 4 closes the testing rollout by making the current static quality floor
explicit and by keeping the future-test cookbook accurate. The repository
already has strong targeted proof for diagnosis, ownership, runtime failure,
and browser/SSR behavior; this change makes those boundaries easier to follow
without rebuilding them.

## Starting Point

CI currently runs Astro sync, typecheck, unit tests, lint, and build, while a
separate job runs the reviewed Playwright flow against disposable local
Supabase. The repository has a write-mode Prettier command but no non-mutating
`format:check`, and its cookbook/version notes have drifted from the current
manifest.

## Desired End State

The main CI job has a clear static floor including `format:check`; the E2E job
remains separate and local-only. `test-plan.md`, `README.md`, and `CLAUDE.md`
accurately describe commands, test-layer selection, cleanup, manual gates,
freshness, and the limits of each proof.

## Key Decisions Made

| Decision              | Choice                                                      | Why                                                                                   |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Static gate scope     | Format check plus existing typecheck, unit, lint, and build | Keeps the cheapest deterministic checks together without making runtime proof brittle |
| Local command surface | Add only `format:check`                                     | Fills the concrete missing gate without introducing a wrapper command                 |
| ESLint warnings       | Preserve current warning policy                             | Avoids unrelated lint triage in this documentation/workflow phase                     |
| Worker declarations   | Keep `types:generate` manual and outside the gate           | Respects the previously removed cross-shell-unstable hard check                       |
| Cookbook structure    | Align and complete existing `test-plan.md` §6               | Avoids duplicate sources of truth                                                     |

## Scope

**In scope:**

- Add `format:check` to `package.json` and the main CI static sequence.
- Align `context/foundation/test-plan.md` cookbook, freshness notes, and Phase 4 status.
- Correct CI/script descriptions in `README.md` and `CLAUDE.md`.
- Verify static commands and documentation/proof boundaries.

**Out of scope:**

- New runtime, RLS, abuse, provider, or browser tests.
- `verify` aggregator, coverage thresholds, `wrangler types --check`, or warning policy changes.
- Hosted/production/preview environments and direct secret-file inspection.

## Architecture / Approach

The static path remains `astro sync → typecheck → unit → lint → format check →
build` in the existing CI job. Persisted database, built Worker, and browser
proof remain separate targeted layers with their existing disposable fixtures
and cleanup contracts.

## Phases at a Glance

| Phase                   | What it delivers                                      | Key risk                                         |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| 1. Static quality floor | Non-mutating format gate and explicit CI contract     | Accidental scope expansion into runtime gates    |
| 2. Cookbook alignment   | Current, actionable test guidance and repository docs | Documentation claims drifting from configuration |

**Prerequisites:** Completed rollout phases 1–3 and the current `test-plan.md`.
**Estimated effort:** ~1 focused session across 2 small phases.

## Open Risks & Assumptions

- Formatting the repository may expose pre-existing drift; only changes within
  this phase should be addressed.
- Package versions and freshness dates must be rechecked against the checkout
  when the plan is implemented.
- Static CI does not prove hosted Cloudflare configuration, provider status,
  RLS persistence, or production readiness.

## Success Criteria (Summary)

- Contributors can run the documented static checks and CI enforces the same
  formatting/type/unit/lint/build floor.
- Cookbook instructions match the actual harnesses and preserve their proof
  boundaries and cleanup rules.
- No completed runtime/security/browser scope or secret-handling boundary is
  changed.
