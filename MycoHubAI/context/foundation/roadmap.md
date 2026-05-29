---
project: MycoHubAI
version: 1
status: draft
created: 2026-05-27
updated: 2026-05-29
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: MycoHubAI

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Mushroom hobbyists lose momentum when agar or grain-stage troubleshooting requires slow manual searching across scattered sources. MycoHubAI's product value is a diagnosis flow bound to one selected text grow log and an internal agar/grain knowledge boundary, with uncertainty shown instead of guaranteed answers.

The MVP must stay single-user-first, text-only, and constrained to agar and grain troubleshooting. With speed as the sequencing goal, the roadmap puts the shortest path to selected-log diagnosis first and parks everything outside that path.

## North star

**S-02: User can diagnose one selected agar or grain grow log** - The north star here means the smallest end-to-end slice whose successful delivery proves the core product idea: a user gets useful, scoped troubleshooting from their own selected log.

## At a glance

| ID | Change ID | Outcome (user can ...) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | single-user-access-gate | (foundation) only one authorized user can access the MVP and public registration is removed | - | FR-005, Access Control | done |
| F-02 | grow-log-data-contract | (foundation) grow-log persistence has the minimum staged text-log contract needed by the MVP | - | FR-001, FR-005, Access Control | ready |
| F-03 | diagnosis-quality-rubric | (foundation) diagnosis quality and safety checks are explicit enough to verify scoped uncertain answers | - | Success Criteria, NFRs, FR-003, FR-004 | ready |
| S-01 | staged-grow-log-crud | user can create, view, edit, and delete their own text grow logs with an agar/grain stage | F-02 | FR-001, FR-005 | proposed |
| S-02 | selected-log-diagnosis | user can ask about one selected agar or grain grow log and receive scoped causes, actions, uncertainty, or a follow-up question | S-01, F-03 | US-01, FR-002, FR-003, FR-004 | proposed |

## Streams

Navigation aid - groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Access path | `F-01` | Locks the MVP to one authorized user before later slices expand app behavior. |
| B | Grow-log path | `F-02` -> `S-01` | Fastest route to the selected log that the diagnosis flow needs. |
| C | Diagnosis path | `F-03` -> `S-02` | Joins Stream B after `S-01`; keeps safety checks ready before the diagnosis slice. |

## Baseline

What's already in place in the codebase as of `2026-05-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present - Astro SSR + React islands, Tailwind, file routes, and shadcn/Radix/lucide evidence in `package.json`, `astro.config.mjs`, and `components.json`.
- **Backend / API:** present - Astro server output, Cloudflare adapter, auth API routes, and middleware request handling.
- **Data:** partial - Supabase client exists, but schema, migrations, and seeded data are absent; current usage is auth-only.
- **Auth:** present - Supabase auth, cookie handling, user verification, and protected dashboard routing are in place.
- **Deploy / infra:** present - Cloudflare Workers config and documented Cloudflare Workers Builds ownership are in place; GitHub Actions remains validation-only by design.
- **Observability:** partial - Worker log access and local Supabase analytics exist, but there is no app-level diagnosis logging, error tracking, or custom metrics yet.

## Foundations
### F-01: Single-user access gate

- **Outcome:** (foundation) Only one authorized user can access the MVP, public registration is removed, and stale non-owner sessions are denied.
- **Change ID:** single-user-access-gate
- **PRD refs:** FR-005, Access Control
- **Unlocks:** S-01, S-02
- **Prerequisites:** -
- **Parallel with:** F-02, F-03
- **Blockers:** -
- **Unknowns:** -
- **Risk:** If access control stays at the starter-auth level, the single-user MVP can leak into unintended multi-user access and break the privacy contract.
- **Status:** done

### F-02: Grow-log data contract

- **Outcome:** (foundation) Grow-log persistence has the minimum staged text-log contract needed for the single-user MVP.
- **Change ID:** grow-log-data-contract
- **PRD refs:** FR-001, FR-005, Access Control
- **Unlocks:** S-01, S-02
- **Prerequisites:** -
- **Parallel with:** F-01, F-03
- **Blockers:** -
- **Unknowns:** -
- **Risk:** If this foundation drifts beyond staged text logs, the speed goal is lost before the first user-visible flow.
- **Status:** ready

### F-03: Diagnosis quality rubric

- **Outcome:** (foundation) Diagnosis quality and safety checks are explicit enough to verify scoped uncertain answers before expanding the flow.
- **Change ID:** diagnosis-quality-rubric
- **PRD refs:** Success Criteria, NFRs, FR-003, FR-004
- **Unlocks:** S-02
- **Prerequisites:** -
- **Parallel with:** F-01, F-02, S-01
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Without a compact rubric, the diagnosis slice can appear complete while missing uncertainty, scope refusal, or prepared-case correctness.
- **Status:** ready

## Slices

### S-01: Staged grow-log CRUD

- **Outcome:** user can create, view, edit, and delete their own text grow logs with an agar/grain stage.
- **Change ID:** staged-grow-log-crud
- **PRD refs:** FR-001, FR-005
- **Prerequisites:** F-02
- **Parallel with:** F-01, F-03
- **Blockers:** -
- **Unknowns:** -
- **Risk:** This is sequenced before diagnosis because selected-log diagnosis cannot be real until there is a staged log to select.
- **Status:** proposed

### S-02: Selected-log diagnosis

- **Outcome:** user can ask about one selected agar or grain grow log and receive scoped causes, suggested actions, confidence bands with explanatory uncertainty, or a follow-up question.
- **Change ID:** selected-log-diagnosis
- **PRD refs:** US-01, FR-002, FR-003, FR-004
- **Prerequisites:** S-01, F-03
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:** -
- **Risk:** This is the product proof point; delaying it behind non-essential surfaces would optimize the shell instead of the diagnosis value.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | single-user-access-gate | Enforce single-user access and remove public registration | yes | Already implemented; keep as historical roadmap record |
| F-02 | grow-log-data-contract | Define the staged grow-log data contract | yes | Run `/10x-plan grow-log-data-contract` |
| F-03 | diagnosis-quality-rubric | Define the diagnosis quality and safety rubric | yes | Run `/10x-plan diagnosis-quality-rubric` |
| S-01 | staged-grow-log-crud | Build staged grow-log CRUD | no | Depends on F-02 |
| S-02 | selected-log-diagnosis | Build selected-log diagnosis | no | Depends on S-01 and F-03 |

## Open Roadmap Questions

None.

## Parked

- **Species-specific advice** - Why parked: PRD Non-Goals limits the MVP to agar and grain-stage troubleshooting.
- **Photo storage or image analysis** - Why parked: PRD Non-Goals keeps grow logs text-only.
- **Local export or download of grow logs** - Why parked: not required for the shortest diagnosis path.
- **Social media integrations** - Why parked: outside the single-user troubleshooting surface.
- **Sharing grow logs between users** - Why parked: conflicts with private single-user data handling in the MVP.
- **Full multi-user account management** - Why parked: starter auth may remain plumbing, but account product features are out of scope.
- **Saved chat history** - Why parked: PRD keeps only grow logs persisted.

## Done

(Empty on first generation. `/10x-archive` appends an entry here - and flips that item's `Status` to `done` - when a change whose `Change ID` matches the item is archived.)
