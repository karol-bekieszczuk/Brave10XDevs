<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Selected Log Diagnosis

- **Plan**: `context/changes/selected-log-diagnosis/plan.md`
- **Scope**: Phases 1-4 + Phase 5 automated checks
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verification

- `npm run test:unit` passed: 9 files, 44 tests.
- `npm run lint` passed with 1 warning: `scripts/ingest-diagnosis-knowledge.ts:246 no-console`.
- `npm run build` passed.
- `npm.cmd run diagnosis:evaluate` passed all 10 prepared cases.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Triage Summary

- F1: FIXED - Applied lazy provider creation after owner-scoped selected-log loading.
- F2: FIXED - Added post-upsert stale row cleanup scoped to `lib/diagnosis/knowledge/`.
- F3: FIXED - `change.md` now uses `status: impl_reviewed`; Phase 5 manual rows remain pending until actually verified.
- F4: FIXED - Added AI SDK abort-signal timeouts around embedding and generation calls.
- F5: DISMISSED - `AGENTS.md` changes are expected when new lesson materials are loaded.

## Findings

### F1 - Provider setup can mask selected-log ownership failures

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: `src/pages/api/diagnosis/selected-log.ts:76`
- **Detail**: The plan requires owner-scoped selected-log loading before provider work. The route validates/authenticates first, but constructs `createDiagnosisProvider(getOpenRouterApiKey())` before `diagnoseSelectedLog()` can load the selected log. If `OPENROUTER_API_KEY` is missing, a missing/non-owned log request can return `provider_failed` instead of the controlled `grow_log_not_found`.
- **Fix**: Pass a lazy provider factory into the service and construct the provider only after request validation, `getOwnerGrowLog`, stage check, and guardrail short-circuits.
  - Strength: Preserves the intended sequencing and keeps provider failures out of ownership/error paths.
  - Tradeoff: Requires a small service/API/test refactor.
  - Confidence: HIGH - the call ordering is visible in `selected-log.ts:76` and `service.ts:173`.
  - Blind spot: Did not exercise a live missing-key request against the running Astro endpoint.
- **Decision**: FIXED - Applied lazy provider creation after owner-scoped selected-log loading.

### F2 - Ingestion can leave stale knowledge chunks in Supabase

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `scripts/ingest-diagnosis-knowledge.ts:238`
- **Detail**: The script upserts current Markdown chunks by `source_path,chunk_index`, but does not delete rows for removed files or removed chunks. Since Markdown is the canonical knowledge source and Supabase rows are the runtime index, stale rows can continue influencing diagnoses after corpus edits.
- **Fix**: Reconcile the generated index during ingestion by deleting rows not present in the current run, ideally via a transaction/RPC or a carefully scoped service-role delete plus upsert.
  - Strength: Keeps runtime retrieval aligned with the Git-tracked corpus.
  - Tradeoff: Needs careful implementation to avoid accidental broad deletes.
  - Confidence: HIGH - no delete/reconcile step exists around the current upsert.
  - Blind spot: Did not inspect hosted Supabase contents for already-stale rows.
- **Decision**: FIXED - Added post-upsert stale row cleanup scoped to `lib/diagnosis/knowledge/`.

### F3 - Change is marked implemented while Phase 5 manual checks are pending

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/selected-log-diagnosis/plan.md:539`
- **Detail**: `change.md` said `status: implemented`, but Phase 5 manual checks 5.10-5.14 remain unchecked. Automated verification is complete, but local smoke/guardrail/prod-secret-boundary confirmation is still pending in the plan.
- **Fix**: Complete the Phase 5 manual checklist and check off 5.10-5.14, or keep `change.md` out of `implemented` until those checks are done.
- **Decision**: FIXED - `change.md` now uses `status: impl_reviewed`; Phase 5 manual rows remain pending until actually verified.

### F4 - Provider calls have retryable timeout mapping but no explicit timeout

- **Severity**: OBSERVATION
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/diagnosis/provider.ts:58`
- **Detail**: `provider_timeout` exists as an error category, but `embed()` and `generateText()` are called without an explicit timeout/abort boundary. A slow provider may wait for platform or client timeout rather than returning the controlled timeout path.
- **Fix**: Add explicit timeout handling around both provider calls and map it to `provider_timeout`.
  - Strength: Makes retryable timeout behavior deterministic.
  - Tradeoff: Requires choosing a timeout budget and verifying AI SDK/OpenRouter abort support.
  - Confidence: MEDIUM - timeout support was not part of the plan, but the error category exists.
  - Blind spot: Did not test OpenRouter latency behavior.
- **Decision**: FIXED - Added AI SDK abort-signal timeouts around embedding and generation calls.

### F5 - AGENTS.md changed outside the diagnosis plan

- **Severity**: OBSERVATION
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `AGENTS.md:28`
- **Detail**: The implementation commits changed the embedded 10x lesson block in `AGENTS.md`. It appears benign, but it is unrelated to selected-log diagnosis and was not part of the plan's changed-file surface.
- **Fix**: Confirm this repo-instruction update was intentional; otherwise revert or move it to a separate change.
- **Decision**: DISMISSED - `AGENTS.md` changes are expected when new lesson materials are loaded.
