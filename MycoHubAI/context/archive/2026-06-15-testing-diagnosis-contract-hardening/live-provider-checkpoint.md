# Live Provider Checkpoint

This checkpoint is the manual Phase 4 gate for `testing-diagnosis-contract-hardening`.

It is intentionally separate from CI and from `npm run diagnosis:evaluate`. This run uses:

- the real OpenRouter-backed diagnosis provider,
- the real Supabase retrieval/RPC path,
- temporary owner-scoped grow-log fixtures created from the prepared F-03 cases.

## Required Environment Variables

Set these in your shell before running the command:

- `OPENROUTER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVE_EVALUATION_OWNER_ID`

`LIVE_EVALUATION_OWNER_ID` must be a real `auth.users.id` UUID in the target Supabase project. The script inserts temporary `grow_logs` rows for that owner and deletes them in cleanup.

If `.dev.vars` exists locally, the script also loads any missing values from that file using the same repo-local pattern as `npm run diagnosis:ingest`.

## Prerequisites

Before running the live checkpoint:

1. Dependencies are installed.
2. Diagnosis knowledge has already been ingested into `diagnosis_knowledge_chunks`.
3. The target Supabase environment contains the owner referenced by `LIVE_EVALUATION_OWNER_ID`.
4. You accept that the run uses network calls and may incur provider cost.

## Command

```bash
npm run diagnosis:evaluate:live
```

## What The Script Verifies

- Prepared F-03 cases are loaded from `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`.
- `diagnosis_knowledge_chunks` contains both `agar` and `grain` knowledge.
- The real service path is used through `diagnoseSelectedLog(...)`.
- The real provider path is used through `createDiagnosisProvider(OPENROUTER_API_KEY)`.
- The real retrieval path is used through the production retrieval RPC contract.
- Temporary grow-log fixtures are cleaned up after the run.

## Failure Classification

The script prints per-case failures using these buckets:

- `model_contract_failure`
- `provider_runtime_failure`
- `supabase_rpc_setup_failure`
- `fixture_setup_failure`
- `case_threshold_ambiguity`

Use the classification before deciding what to change:

- `model_contract_failure`: adjust code, prompt, validator, or contract logic.
- `provider_runtime_failure`: inspect OpenRouter/provider behavior, timeouts, or transient runtime faults.
- `supabase_rpc_setup_failure`: inspect `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, RPC access, and ingested knowledge.
- `fixture_setup_failure`: inspect `LIVE_EVALUATION_OWNER_ID`, fixture insertion, or cleanup behavior.
- `case_threshold_ambiguity`: inspect whether the live answer is acceptable but phrased differently from the prepared-case expectations before changing code.

## Important Notes

- This checkpoint is not part of CI in Phase 4.
- `npm run diagnosis:evaluate` must remain deterministic and must not require `OPENROUTER_API_KEY`.
- The live script touches configured Supabase data through temporary fixtures only; it does not require or read committed secrets.
