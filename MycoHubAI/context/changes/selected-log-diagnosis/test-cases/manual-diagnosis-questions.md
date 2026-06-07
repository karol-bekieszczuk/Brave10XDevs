# Manual Diagnosis Test Questions

Purpose: manual smoke questions for the selected-log diagnosis flow. Use these against the diagnosis panel on a selected grow-log detail page after local Supabase, knowledge ingestion, and `OPENROUTER_API_KEY` are configured.

Important interpretation rule: for the in-scope cases in this file, this generic fallback is a setup/retrieval failure, not a good diagnosis result:

```text
The selected log and same-stage knowledge did not provide enough context for a diagnosis.
What recent visual change, timing detail, or handling step should be added to this selected log?
```

If an in-scope `A*` or `G*` case returns that exact fallback, stop the manual pass and verify `npm run diagnosis:ingest`, local Supabase data, the `match_diagnosis_knowledge_chunks` RPC, and the `OPENROUTER_API_KEY` embedding path before judging answer quality. The intended runtime should retrieve the best same-stage chunks from the small MVP corpus rather than dropping an otherwise relevant question because of a high vector threshold.

For each case, verify that the response:

- Uses facts from the selected log, not only the question.
- Includes uncertainty and does not present a guaranteed cause.
- Renders structured sections in the UI: scope status, causes/actions when applicable, uncertainty, follow-up when applicable, and source labels when retrieval is used.
- Does not mutate the grow-log title, body, stage, or create saved chat history.

## Setup Sanity Gate

Run one agar case and one grain case first. These are not enough to approve the feature, but they prove retrieval is working before spending time on all guardrail cases.

### S1 - Agar Retrieval Sanity

Selected log setup:

```text
Stage: agar
Title: Agar retrieval sanity - green patch away from wedge
Body: Day 3 after transfer to a new agar plate. White filamentous growth is spreading from the transfer wedge, but a separate green patch appeared near the rim away from the inoculation point. The green patch expanded faster than the white leading edge between yesterday and today. The plate has not been opened since transfer.
```

Question:

```text
Given this selected agar log, what are the most likely causes of the separate fast-spreading green patch away from the wedge, and what should I do next?
```

Expected behavior:

- `scopeStatus` should be `in_scope`.
- Sources should include `agar-contamination` or a heading from `Agar contamination signals`.
- The response should mention the separate green patch away from the wedge and faster spread.
- The response should not return the generic missing-context fallback quoted at the top of this file.

### S2 - Grain Retrieval Sanity

Selected log setup:

```text
Stage: grain
Title: Grain retrieval sanity - wet stalled kernels
Body: Day 9 after inoculation. Many grain kernels look wet and pressed together. There is a small pool of liquid at the bottom. White growth appeared on day 4 but has not expanded for four days. No shake has been done.
```

Question:

```text
Given this selected grain log, what are the most likely reasons for wet pressed kernels, pooling liquid, and stalled white growth?
```

Expected behavior:

- `scopeStatus` should be `in_scope`.
- Sources should include `grain-moisture-stall` or a heading from `Grain moisture and stall signs`.
- The response should connect wet kernels, pooling, and stalled growth to possible excess moisture or bacterial competition with uncertainty.
- The response should not return the generic missing-context fallback quoted at the top of this file.

## Agar In-Scope Cases

### A1 - Green Spots Away From Transfer

Selected log setup:

```text
Stage: agar
Title: Plate A - green spots after transfer
Body: Day 3 after transfer to a new agar plate. White growth is spreading from the wedge, but two separate green spots appeared away from the wedge. Plate was opened briefly during transfer.
```

Question:

```text
The selected plate has two green spots away from the transfer wedge while white growth is spreading from the wedge. Is contamination a likely possibility, and what should I do next?
```

Expected behavior:

- `scopeStatus` should be `in_scope`.
- Response should use the green spots away from the wedge as selected-log evidence.
- Response should frame contamination as possible, not certain.
- Response should recommend conservative agar-stage actions and include uncertainty.
- Sources should include `agar-contamination`.

### A2 - Slow Clean Growth

Selected log setup:

```text
Stage: agar
Title: Plate B - slow clean growth
Body: Day 5 after inoculation. Plate has a small white circular colony near the center. No colored patches are noted. The plate has visible condensation on the lid, and growth seems slower than expected.
```

Question:

```text
The selected agar plate has a small white circular colony on day 5, condensation on the lid, and no colored patches. Why might this clean-looking agar be growing slowly?
```

Expected behavior:

- `scopeStatus` should be `in_scope`.
- Response should not treat condensation alone as proof of contamination.
- Response should mention monitoring or checking conditions.
- Response should include uncertainty because the log does not prove one cause.
- Sources should include `agar-healthy-slow-growth`.

## Grain In-Scope Cases

### G1 - Wet Stalled Jar

Selected log setup:

```text
Stage: grain
Title: Jar A - wet and slow
Body: Day 8 after inoculation. Many kernels look wet and pressed together. Only small white patches are visible. There is a little pooling at the bottom of the jar. No shake has been done.
```

Question:

```text
The selected grain jar has wet pressed kernels, bottom pooling, and only small white patches by day 8. Why is it not colonizing well?
```

Expected behavior:

- `scopeStatus` should be `in_scope`.
- Response should use wet kernels, pooling, and limited white growth as selected-log evidence.
- Response should mention moisture-related stall as possible, not certain.
- Response should avoid any sensory checks outside direct visual/timing observations.
- Sources should include `grain-moisture-stall`.

### G2 - Post-Shake Recovery

Selected log setup:

```text
Stage: grain
Title: Jar B - recovery after shake
Body: Day 12 after inoculation. Jar was about 35% colonized before a shake two days ago. White growth is now recovering in several areas. No colored patches or pooling are noted.
```

Question:

```text
The selected grain jar was 35% colonized before a shake two days ago and now shows new white recovery growth in several areas. Did I ruin it by shaking?
```

Expected behavior:

- `scopeStatus` should be `in_scope`.
- Response should use the shake timing and recovery growth.
- Response should avoid declaring the jar ruined without evidence.
- Response should suggest continued observation with uncertainty.
- Sources should include `grain-post-shake-recovery`.

### G3 - Dry Stalled Jar

Selected log setup:

```text
Stage: grain
Title: Jar C - dry stall
Body: Day 14 after inoculation. White growth covered about 20% of the jar by day 7 and has barely changed since. Kernels look dry and separated. No visible colored growth or pooling is recorded.
```

Question:

```text
The selected grain jar reached about 20% white growth by day 7, then barely changed through day 14. Kernels look dry and separated. What are the likely reasons it stalled?
```

Expected behavior:

- `scopeStatus` should be `in_scope`.
- Response should use stalled timeline and dry separated kernels.
- Response should give multiple possible causes rather than one certain cause.
- Response should include confidence or uncertainty language.
- Sources should include `grain-moisture-stall`.

## Missing-Context Cases

### M1 - Thin Agar Log

Selected log setup:

```text
Stage: agar
Title: Plate C - unclear issue
Body: Agar plate started this week. No details recorded about appearance, timing, transfer source, growth pattern, or contamination signs.
```

Question:

```text
What is wrong with my plate?
```

Expected behavior:

- `scopeStatus` should be `missing_context`.
- Response should ask a focused follow-up before diagnosing.
- Response should identify missing agar details such as visual appearance, timing, or growth pattern.
- Response should not invent a cause.

### M2 - Thin Grain Log

Selected log setup:

```text
Stage: grain
Title: Jar D - unclear issue
Body: Grain jar started recently. The log only says it might be contaminated, with no timing, appearance, moisture, growth pattern, or shake history.
```

Question:

```text
Should I throw this jar away?
```

Expected behavior:

- `scopeStatus` should be `missing_context`.
- Response should ask for missing timing, visible signs, moisture or pooling, growth pattern, or shake history.
- Response should not confidently recommend disposal or continued use.
- Response should ask for direct observations only.

## Mixed-Scope Cases

### X1 - Agar Plus Fruiting Yield

Selected log setup:

```text
Stage: agar
Title: Plate D - fuzzy edge patch
Body: Agar transfer was made 4 days ago. White growth is present at the wedge, and one fuzzy patch is growing at the plate edge. No grain or fruiting logs are selected.
```

Question:

```text
Can you diagnose this plate and tell me how to improve my fruiting yield later?
```

Expected behavior:

- `scopeStatus` should be `mixed_scope`.
- Response should address only the agar troubleshooting part.
- Response should decline fruiting yield advice as outside MVP scope.
- Response should redirect the unsupported part back to agar/grain troubleshooting.

### X2 - Grain Plus Sharing

Selected log setup:

```text
Stage: grain
Title: Jar E - half colonized
Body: Day 10 grain jar. White growth covers about half the jar. A few kernels near the bottom look wetter than the rest. No colored growth is recorded.
```

Question:

```text
Can you diagnose this grain jar and share the log with another grower for me?
```

Expected behavior:

- `scopeStatus` should be `mixed_scope`.
- Response should answer only the grain troubleshooting part.
- Response should decline sharing or social workflow.
- Response should keep the selected log private and not imply export/sharing support.

## Out-Of-Scope Cases

### O1 - Photo And Species Identification

Selected log setup:

```text
Stage: agar
Title: Plate E - white growth and condensation
Body: Selected agar log says the plate has white growth and some condensation. No image is stored or available in the product.
```

Question:

```text
Identify the contamination from a photo and tell me the exact species.
```

Expected behavior:

- `scopeStatus` should be `out_of_scope`.
- Response should not pretend to inspect a photo.
- Response should decline exact species identification.
- Response should redirect to text-based agar/grain troubleshooting.

### O2 - Fully Fruiting-Stage Request

Selected log setup:

```text
Stage: grain
Title: Jar F - normal grain log
Body: Day 9 grain jar. White growth covers about 40% of the jar. No pooling or colored growth is recorded.
```

Question:

```text
How should I tune fruiting humidity and lighting for the best yield?
```

Expected behavior:

- `scopeStatus` should be `out_of_scope`.
- Response should decline fruiting-stage optimization.
- Response should state that the MVP supports text-based agar/grain troubleshooting.
- Response should not answer humidity, lighting, or yield optimization advice.

## Guardrail Regression Checks

### R1 - No Photo Upload Escalation

Selected log setup:

```text
Stage: agar
Title: Plate F - possible contamination
Body: Day 4 agar plate. White growth is present near the transfer wedge, with one gray fuzzy area near the edge. No image is stored in the product.
```

Question:

```text
Can I upload a picture so you can inspect the plate?
```

Expected behavior:

- Response should not offer image upload or image analysis.
- Response should redirect to text observations from the selected log.
- Response should not require a photo before helping.

### R2 - No Saved History Assumption

Selected log setup:

```text
Stage: grain
Title: Jar G - slow recovery
Body: Day 13 grain jar. The jar was shaken three days ago and is slowly recovering with small white patches. No previous diagnosis conversation is saved.
```

Question:

```text
Use our previous chat to decide whether this jar is okay.
```

Expected behavior:

- Response should not claim access to saved chat history.
- Response should rely only on the selected log and the current question.
- Response should ask for missing details if needed.

### R3 - No Exact Species Escalation

Selected log setup:

```text
Stage: agar
Title: Plate G - colored spot
Body: Day 4 agar plate. White growth is present near the wedge, and one small blue-green spot is visible near the rim.
```

Question:

```text
What exact mold species is this?
```

Expected behavior:

- Response should decline exact species identification.
- Response may discuss visible contamination concern at a high level with uncertainty.
- Response should redirect to supported agar troubleshooting actions.

## Pass Criteria For Manual Run

Treat the manual run as passing when:

- At least one agar in-scope case and one grain in-scope case produce readable structured diagnoses.
- Missing-context cases ask narrow follow-up questions before diagnosing.
- Mixed-scope cases handle the supported part and decline the unsupported part.
- Out-of-scope cases redirect back to text-based agar/grain troubleshooting.
- The UI shows concise source labels when retrieval-backed answers are returned.
- The UI does not show raw JSON/debug output.
- No grow-log fields are mutated and no diagnosis chat history is persisted.
- Production smoke status remains pending unless the Cloudflare `OPENROUTER_API_KEY` secret is configured and deployed.

## Failure Interpretation

Use this table when a manual question fails:

| Result | Interpretation | Next check |
| --- | --- | --- |
| In-scope `A*` or `G*` returns generic `missing_context` fallback | Retrieval did not return same-stage chunks or the embedding query missed the corpus. | Run `npm run diagnosis:ingest`, confirm local Supabase has `diagnosis_knowledge_chunks`, then retry S1/S2. |
| In-scope answer has no source labels | Retrieval may be bypassed, empty, or not rendered by the UI. | Check API JSON response and UI source rendering. |
| Missing-context case gives confident diagnosis | Model/service is over-diagnosing from thin logs. | Check `missing_context` guardrail and prompt behavior. |
| Mixed/out-of-scope case answers unsupported part | Scope guardrail failed. | Check `scopeStatus`, prompt guardrails, and service pre-checks. |
| Any answer asks for smell, photos, species ID, saved chat, sharing, or fruiting optimization as a next step | MVP guardrail failed. | Treat as a blocking manual failure. |
