---
change_id: testing-diagnosis-contract-hardening
title: Testing diagnosis contract hardening
status: implementing
created: 2026-06-15
updated: 2026-06-23
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Diagnosis Contract Hardening".
  Risks covered: #1 Diagnosis sounds confident while wrong or unsupported by the selected grow log; #2 Malformed or partial OpenRouter/provider responses leak through API/service/UI
  and produce nonsense output; #3 Missing-context, mixed-scope, or out-of-scope prompts are diagnosed instead of narrowed/refused.
  Test types planned: unit, integration, contract/evaluation.
  Risk response intent:
  - Risk #1: prove answer evidence visibly depends on selected log/stage and uncertainty stays bounded.
  - Risk #2: prove bad provider shapes are rejected or translated into controlled errors before UI render.
  - Risk #3: prove unsupported/missing/mixed cases follow rubric outcomes without invented diagnosis.
  After creating the folder, follow the downstream continuation rule.
