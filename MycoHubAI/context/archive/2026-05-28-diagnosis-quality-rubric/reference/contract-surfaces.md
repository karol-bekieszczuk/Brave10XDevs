# Diagnosis Rubric Contract Surfaces

This registry lists the load-bearing reference artifacts for future selected-log diagnosis work. Read these before planning, implementing, or reviewing diagnosis behavior.

If this change is archived before selected-log diagnosis consumes these artifacts, resolve the same files under `context/archive/diagnosis-quality-rubric/reference/` instead of the active `context/changes/` path.

## Diagnosis Quality Rubric

Canonical path: `context/changes/diagnosis-quality-rubric/reference/diagnosis-quality-rubric.md`

Purpose: human-readable diagnosis quality contract for scoped agar/grain troubleshooting, selected-log dependency, uncertainty, missing context, mixed-scope handling, out-of-scope redirects, and non-goals.

## Diagnosis Evaluation Cases

Canonical path: `context/changes/diagnosis-quality-rubric/reference/diagnosis-evaluation-cases.json`

Purpose: prepared 10-case set for future S-02 selected-log diagnosis evaluation. Cases marked `counts_toward_prd_accuracy: true` define the denominator for the PRD 75% prepared-case diagnosis target; guardrail cases still must pass their scope and safety expectations.
