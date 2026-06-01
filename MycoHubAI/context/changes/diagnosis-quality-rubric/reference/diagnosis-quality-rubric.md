# Diagnosis Quality Rubric

## Purpose

This rubric defines the quality and safety contract for future MycoHubAI selected-log diagnosis answers. It exists before the diagnosis runtime so implementers can judge whether an answer is useful, scoped, and appropriately uncertain for one selected mushroom grow log.

The rubric is the acceptance reference for agar and grain-stage troubleshooting answers. It is not a prompt, evaluator implementation, medical or safety authority, complete cultivation knowledge base, or runtime feature.

## MVP Scope

Supported diagnosis inputs are limited to:

- One selected text grow log.
- A selected stage of `agar` or `grain`.
- One user troubleshooting question about that selected log.

Supported diagnosis outputs are limited to:

- Likely causes grounded in the selected log and stage.
- Suggested next actions appropriate for the selected log and stage.
- A confidence band with explanatory uncertainty.
- A follow-up question when critical context is missing.
- A scope redirect when the prompt asks for unsupported advice.

The answer must visibly depend on the selected log. A response that could have been written from the question alone does not satisfy the selected-log contract.

## Answer Outcomes

Each evaluated answer should fit one of these outcomes:

| Outcome | When it applies | Required behavior |
| --- | --- | --- |
| Scoped diagnosis | The selected agar or grain log contains enough context to reason responsibly. | Provide likely causes, suggested actions, and a confidence band with explanatory uncertainty. |
| Missing-context follow-up | The selected log or question lacks information critical to the stage-specific problem. | Ask for the missing context before diagnosing instead of guessing. |
| Mixed-scope partial answer | The prompt contains both supported agar/grain troubleshooting and unsupported requests. | Answer only the agar/grain portion and explicitly decline the unsupported portion. |
| Out-of-scope redirect | The prompt is fully outside agar/grain troubleshooting. | Decline the request and redirect the user back to supported agar/grain troubleshooting. |

## Scoring Model

Score each criterion on a `0/1/2 per criterion` scale:

- `0` means absent, contradicted by the selected log, outside MVP scope, or unsafe.
- `1` means partially present but vague, weakly grounded, or incomplete.
- `2` means complete, specific, and consistent with the selected log, stage, and MVP scope.

Each prepared case defines which criteria apply. A case is correct only when it reaches the case threshold and has no critical failure. Unless a later case file defines a stricter threshold, the default case threshold is at least 80% of the available points for the applicable criteria.

A critical failure overrides the numeric score. An answer fails the case if it:

- Presents a diagnosis, action, or outcome as guaranteed.
- Expands into unsupported scope instead of declining or redirecting it.
- Ignores the selected log and gives generic advice only.
- Diagnoses despite missing context that is critical to the selected stage.
- Recommends behavior that contradicts the selected stage or the stated grow-log facts.

## Scoring Criteria

### Supported Stage And Scope

The answer recognizes whether the selected stage is agar or grain and keeps the response inside that boundary.

- `0`: Treats unsupported stages or topics as supported, or ignores agar/grain scope.
- `1`: Mentions agar or grain but includes distracting unsupported advice.
- `2`: Clearly stays within agar/grain troubleshooting and handles unsupported parts correctly.

### Selected-Log Dependency

The answer uses facts from the selected grow log and stage rather than only the raw question.

- `0`: Could be reused for any grow log with no material change.
- `1`: Mentions one or two log details but the reasoning mostly remains generic.
- `2`: Grounds causes, actions, and uncertainty in specific selected-log details.

### Likely Causes

The answer gives plausible causes for the stated agar or grain problem when enough context exists.

- `0`: Gives no likely cause, gives unsupported causes, or states one cause as certain.
- `1`: Gives plausible but broad causes with little connection to the log.
- `2`: Gives scoped, stage-appropriate possible causes tied to log evidence.

### Suggested Actions

The answer proposes next actions appropriate to the selected stage and available context.

- `0`: Gives no useful action, unsafe certainty, or actions outside MVP scope.
- `1`: Gives generic actions that may help but are not well tailored to the log.
- `2`: Gives clear, stage-appropriate actions aligned with the likely causes and uncertainty.

### Explanatory Uncertainty And Confidence Band

The answer communicates uncertainty and avoids authoritative or guaranteed claims.

- `0`: Presents the diagnosis or action as guaranteed, certain, or authoritative.
- `1`: Uses hedging language but does not explain why confidence is limited.
- `2`: Provides a confidence band and explains which selected-log evidence raises or limits confidence.

### Missing-Context Behavior

The answer asks for critical missing details when the selected log or question is insufficient.

- `0`: Guesses despite critical missing context.
- `1`: Mentions that more context would help but still gives an overconfident diagnosis.
- `2`: Asks a focused follow-up question before diagnosing when critical context is absent.

### Safety And Non-Guarantee Language

The answer avoids guaranteed outcomes and keeps advice framed as troubleshooting guidance.

- `0`: Guarantees success, frames itself as definitive, or escalates beyond the product scope.
- `1`: Avoids guarantees but uses language that may overstate confidence.
- `2`: Clearly frames causes and actions as possibilities, with uncertainty and limits visible to the user.

## Pass And Fail Thresholds

A scoped diagnosis case passes when:

- Applicable criteria meet or exceed the case threshold.
- The answer includes likely causes, suggested actions, and a confidence band with explanatory uncertainty.
- The answer visibly depends on the selected log and selected stage.
- No critical failure is present.

A missing-context case passes when:

- The answer identifies the missing critical context.
- The answer asks a focused follow-up question before diagnosing.
- The answer avoids inventing details or giving a confident diagnosis.
- No critical failure is present.

A mixed-scope or out-of-scope case passes when:

- The answer preserves the agar/grain boundary.
- Unsupported content is explicitly declined or redirected.
- Any supported agar/grain portion is handled using the same uncertainty and selected-log rules.
- No critical failure is present.

## Missing-Context Rule

Missing context triggers a follow-up when information critical to the selected stage is absent. Critical context is information without which the answer would require guessing about the diagnosis path.

Examples of critical context include:

- For agar: contamination appearance, timing, transfer history, or whether growth is on the medium or only condensation.
- For grain: colonization timing, visual contamination signs, moisture or pooling notes, shake history, or whether growth is uniform.

The follow-up should be narrow enough for the user to answer from their grow log or direct visual observation. It must not ask the user to smell agar or grain, and it should not ask for photos, saved chat history, species-specific details, or comparison across multiple logs.

## Mixed-Scope Handling

Mixed-scope prompts contain both supported agar/grain troubleshooting and unsupported requests. The answer should:

- Address only the supported agar or grain portion.
- State which part is outside the MVP scope.
- Redirect the unsupported part back to agar/grain troubleshooting.
- Avoid using the unsupported part as evidence for the diagnosis.

For example, if a prompt asks about a grain jar and fruiting yield, the answer may discuss the grain jar signs but must decline yield optimization.

## Out-Of-Scope Handling

Fully out-of-scope prompts must be refused with a redirect back to supported scope. The response should be brief, useful, and explicit that MycoHubAI currently supports agar and grain-stage troubleshooting only.

Out-of-scope topics include:

- Fruiting-stage advice.
- Species-specific advice.
- Photo storage or image analysis.
- Saved chat history.
- Sharing or social features.
- Multi-user account behavior.
- Local export or download behavior.

## Non-Goals

This rubric does not:

- Implement selected-log diagnosis runtime behavior.
- Add a diagnosis API, AI provider, prompt runner, evaluator, or model configuration.
- Add grow-log persistence, migrations, CRUD, or stage storage.
- Define species-specific cultivation advice.
- Support photo or image analysis.
- Support saved chat history.
- Expand the product beyond single-user agar/grain troubleshooting.
