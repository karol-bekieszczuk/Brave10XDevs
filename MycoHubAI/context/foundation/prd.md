---
project: MycoHubAI
version: 1
status: draft
created: 2026-05-20
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-07-05
  after_hours_only: true
---

## Vision & Problem Statement

Mushroom hobbyists can lose momentum when troubleshooting cultivation problems because manually searching for answers is slow, tedious, and discouraging. The painful moment is when a hobbyist sees a problem during the agar or grain stage, has notes about the grow, and still has to search manually for possible causes and next steps.

The product insight is that diagnosis can be more useful when the answer is bound to a selected grow log and to an internal knowledge base limited to agar and grain stages, instead of relying on a generic chat or disconnected notes app.

## User & Persona

Primary persona: a mushroom hobbyist cultivating at home who keeps text notes about grows and needs help diagnosing agar or grain-stage problems.

They reach for MycoHubAI when they have a grow-log entry and a concrete troubleshooting question, but do not want to manually search through scattered sources or ask a generic assistant without cultivation context.

## Success Criteria

### Primary

- The chat reaches 75% correct diagnoses on prepared agar/grain troubleshooting test cases.
- For a selected agar or grain grow log, the user receives likely causes, suggested actions, and confidence bands with explanatory uncertainty, or a follow-up question when context is missing.

### Secondary

- A hobbyist can create, revisit, edit, and delete text grow logs without friction.

### Guardrails

- The product does not present diagnoses as guaranteed or authoritative.
- Grow-log text remains private to the single-user MVP surface.
- Questions outside agar/grain scope are refused with a redirect back to supported scope.

## User Stories

### US-01: Diagnose a selected grow log

- **Given** a mushroom hobbyist has a text grow log marked with either agar or grain stage
- **When** they select that grow log and ask a troubleshooting question
- **Then** they receive possible causes, suggested actions, and confidence bands with explanatory uncertainty, or a follow-up question if the provided context is not enough to diagnose

#### Acceptance Criteria

- The answer visibly depends on the selected grow log and stage, not only on the raw question.
- If the selected grow log or question lacks key context, the chat asks for missing context instead of guessing.
- If the question is outside agar/grain cultivation scope, the chat refuses and redirects the user back to the supported scope.
- The answer includes possible causes, suggested actions, and a confidence band when enough context is available.

## Functional Requirements

### Grow Logs

- FR-001: User can create, view, edit, and delete their own text grow logs with a minimal agar/grain stage field. Priority: must-have
  > Socratic: Counter-argument considered: plain text may be too loose for useful diagnosis compared with stage/problem fields. Resolution: revised; keep text logs, but require a minimal agar/grain stage field so diagnosis can stay scoped and useful.

### Diagnosis

- FR-002: User can ask a troubleshooting question against one selected grow log. Priority: must-have
  > Socratic: Counter-argument considered: one selected log may be limiting because some diagnoses might require comparing multiple grows or prior attempts. Resolution: kept one selected log for MVP, but the chat asks follow-up questions when context is missing.

- FR-003: User can receive possible causes, suggested actions, and confidence bands with explanatory uncertainty based on the selected grow log and internal agar/grain knowledge. Priority: must-have
  > Socratic: Counter-argument considered: confidence may mislead and create false certainty for a hobbyist. Resolution: kept confidence, but expressed through confidence bands with explanatory uncertainty rather than guaranteed diagnosis.

- FR-004: User is redirected when asking questions outside agar/grain cultivation scope. Priority: must-have
  > Socratic: Counter-argument considered: strict refusal may feel unhelpful when issues overlap later stages or species-specific context. Resolution: refuse with a redirect that explains the MVP supports only agar/grain and suggests rephrasing within scope.

### Access

- FR-005: User can use the MVP in a single-user-first mode without full multi-user accounts. Priority: must-have
  > Socratic: Counter-argument considered: account storage was part of the original seed idea, but auth may slow the first proof of value. Resolution: demoted full accounts out of MVP; prove grow-log diagnosis first with a single-user access model.

## Non-Functional Requirements

- Grow-log text is not exposed to other users or unrelated product surfaces.
- Diagnostic answers use confidence bands with explanatory uncertainty and do not present recommendations as guaranteed outcomes.
- The product remains constrained to agar/grain scope and gives a clear redirect for unsupported topics.
- The MVP should acknowledge user input quickly and provide visible progress during diagnosis if the response takes longer than a short interaction pause.

## Business Logic

Given a staged grow log and troubleshooting question, MycoHubAI identifies likely agar or grain-stage problem causes and next actions, or asks for missing context before diagnosing.

The rule consumes user-facing inputs: the selected grow log text, its agar/grain stage, and the user's troubleshooting question.

The rule outputs a diagnostic response containing possible causes, suggested actions, and confidence bands with explanatory uncertainty when enough context exists.

The user encounters this rule in the chat flow after selecting a grow log and asking a cultivation problem question.

## Access Control

Single-user-first MVP; no full account system is included in the first version.

The user can manage only their own grow logs within the MVP surface. Full multi-user account storage is explicitly outside MVP scope.

## Non-Goals

- No species-specific advice; the MVP is limited to agar and grain-stage troubleshooting.
- No photo storage or image analysis; grow logs are text-only.
- No local export or download of grow logs.
- No social media integrations.
- No sharing grow logs between users.
- No full multi-user account system in MVP.
- No saved chat history; only grow logs are persisted.

## Open Questions

None.
