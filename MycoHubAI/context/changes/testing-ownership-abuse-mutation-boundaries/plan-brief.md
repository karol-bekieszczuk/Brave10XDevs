# Ownership, Abuse, And Mutation Boundaries — Plan Brief

> Full plan: `context/changes/testing-ownership-abuse-mutation-boundaries/plan.md`  
> Research: `context/changes/testing-ownership-abuse-mutation-boundaries/research.md`

## What & Why

Rollout Phase 2 protects private grow logs, diagnosis/provider work, bulk mutations, and privileged account deletion against ownership drift, hostile input, and repeated-cost abuse. It replaces query-shape confidence with persisted two-principal proof and adds the controls that valid repeated requests currently lack.

## Starting Point

Routes derive owners from authenticated locals, repositories add owner filters, grow logs have RLS, and diagnosis loads the selected owner log before provider work. Missing proof and controls remain: malformed diagnosis UUIDs become 502s, pending deletion has no owner-select policy, server/DB size bounds drift, current tests do not execute RLS with two identities, and provider/Admin work has concurrency gaps.

## Desired End State

Invalid, unavailable, non-owner, unsupported, oversized, duplicate, and concurrent requests stop at the earliest correct boundary with generic HTTP errors and no unintended private-data, mutation, or provider effect. A loopback-only local Supabase smoke proves real RLS and survivor state with two JWT principals, while durable atomic admission bounds diagnosis and account-deletion work across Worker isolates.

## Key Decisions Made

| Decision                | Choice                                                                                      | Why                                                                                     | Source   |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Pending deletion        | Owner-only authenticated SELECT; no client mutations                                        | Middleware must see the owner's pending row without widening mutation rights.           | Research |
| Diagnosis admission     | 10 attempts/10 minutes, one in flight, 60-second duplicate cooldown                         | Bounds sequential and concurrent cost across isolates.                                  | Plan     |
| Admission storage       | Atomic Supabase-backed RPC/state                                                            | Current Worker has no KV/Durable Object binding; memory is not global.                  | Research |
| Grow-log limits         | Title 160, body 8,000 Unicode code points                                                   | Bounds stored provider context while retaining useful text logs.                        | Plan     |
| Existing oversized rows | Truncate before adding DB constraints                                                       | User selected migration continuity over preserving oversized legacy values.             | Plan     |
| Bulk behavior           | Ignore malformed entries, dedupe, cap at 100 valid IDs                                      | Preserves current partial-success behavior while bounding query size.                   | Plan     |
| Diagnosis bounds        | 16 KiB raw JSON, 2,000-character question, 1,200 output tokens, five causes/actions/sources | Bounds request and generation amplification.                                            | Plan     |
| RLS proof               | Two temporary local Auth users with distinct JWTs                                           | Proves PostgREST/RLS persisted behavior rather than SQL text or mocks.                  | Research |
| Single-user gate        | Do not change `.dev.vars` or `AUTHORIZED_USER_ID`                                           | RLS principals authenticate directly to Supabase; app middleware is outside this proof. | Plan     |
| HTTP/log redaction      | New sentinel assertions cover HTTP only                                                     | User chose not to expand Phase 2 into a logging-redaction subsystem.                    | Plan     |
| Account deletion race   | Atomic two-minute processing lease                                                          | Prevents duplicate concurrent Admin API work for the authenticated target.              | Plan     |
| Browser scenario        | Reserve create-two/bulk-delete-one/reload for rollout Phase 3                               | It proves runtime wiring, not cross-owner or abuse boundaries.                          | Research |

## Scope

**In scope:**

- Malformed/missing/non-owner ID classification, fail-before-work ordering, mutation validation, owner spoof rejection, and explicit bounds.
- Forward migrations for length constraints, pending-state SELECT, and atomic leases/admission.
- Real local two-principal RLS, DB constraint, selected-row, and survivor proof.
- Diagnosis rate/concurrency/deduplication, bounded request/output contracts, and concurrent account-deletion protection.
- Test-plan §6 cookbook updates after the controls ship.

**Out of scope:**

- Multi-user product access, sharing, saved diagnosis history, caching, images, broader diagnosis stages, or browser/e2e ownership proof.
- CI-hosted Supabase in this rollout.
- A new server-log sanitization system.

## Architecture / Approach

Cheap Vitest route/service tests establish classification and ordering first. Forward migrations align application and database invariants. A loopback-only TypeScript smoke creates two local Auth users, exercises RLS through separate session clients, verifies outcomes through an admin persisted-state oracle, and cleans up exact fixture IDs. Atomic Supabase functions then admit diagnosis/provider work and account-deletion processing before the costly/privileged boundary.

## Phases at a Glance

| Phase                                                 | What it delivers                                                   | Key risk                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| 1. Classify IDs And Fail Before Work                  | Controlled malformed/non-owner behavior and zero unintended work   | Happy-path or 502 misclassification hides boundary drift  |
| 2. Bound Server And Database Inputs                   | Explicit input/output/cardinality contracts and matching migration | Oversized data amplifies cost; truncation is irreversible |
| 3. Prove Two-Principal RLS And Persisted Survivors    | JWT-backed RLS, pending visibility, and survivor proof             | Local stack/reset and cleanup discipline                  |
| 4. Enforce Durable Cost And Privileged-Work Admission | Global diagnosis bounds and one concurrent Admin call              | Atomicity, stale leases, and retry semantics              |
| 5. Run Gates And Ship Cookbook Patterns               | Full verification and reusable Phase 2 patterns                    | Documentation must not overclaim proof                    |

**Prerequisites:** Local Docker/Supabase CLI for Phase 3+, permission to reset only the disposable local database, and local Supabase credentials exported into the shell.  
**Estimated effort:** Approximately 5 implementation sessions, one per gated phase; Phases 3–4 carry most database/concurrency cost.

## Open Risks & Assumptions

- Truncating existing oversized grow-log content is intentional but irreversible; non-local rollout needs an explicit human checkpoint.
- A fixed window may permit a boundary burst, mitigated by the one-in-flight lease.
- The manual RLS gate cannot be replaced by static migration inspection when local Supabase is unavailable.
- Account deletion and diagnosis leases rely on expiry/release behavior being proved under failure and concurrency.
- The controlled knowledge corpus remains callable by authenticated Supabase users; this phase treats it as non-private product knowledge.

## Success Criteria (Summary)

- Hostile/unavailable requests cannot read or mutate another owner's data or start unintended provider/Admin work.
- Real local JWT-backed tests prove grow-log and pending-deletion RLS, DB constraints, atomic admission, and exact survivor state.
- Valid provider work is bounded to the selected policy, all deterministic/full gates pass, and §6 documents only shipped patterns.
