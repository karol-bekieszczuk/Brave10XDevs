# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Set a kill date for feature flags

- **Context**: Whole system
- **Problem**: Whenever a feature is implemented behind a feature flag, the flag can be removed by the agent unless its removal is planned explicitly. Without a kill date, agent doesnt know when feature flags should be removed and decides by himself.
- **Rule**: Whenever a feature is implemented with a feature flag, set an explicit `kill date` parameter for that flag. State when the flag should be removed as part of the feature work and this should never be ommited by the agent.
- **Applies to**: all

## Do Not Decide Review Triage Outcomes

- **Context**: Any triage of review findings from `/10x-rule-review`, `/10x-plan-review`, `/10x-impl-review`, `rule-review.md` `plan-review.md`, or `impl-review.md`.
- **Problem**: If the agent marks findings as fixed, skipped, accepted, dismissed, or changes the review verdict without the user's explicit triage decision, it silently replaces the user's product and risk judgment.
- **Rule**: Never decide review triage outcomes on behalf of the user. Present each pending finding, wait for the user's decision, and only then update the plan, code, saved review decision, or final verdict.
- **Applies to**: rule-review, plan-review, impl-review

## Keep Agent-Created Markdown Documents Under Context

- **Context**: Skills that produce `.md` files, `/10x-plan`, `/10x-new`, `/10x-plan-review`, `/10x-implement`, `/10x-shape`, .
- **Problem**: The agent creates unnecessary extra folders when the repository already has `context/` as the intended place for planning and skill-produced documents.
- **Rule**: Always write Markdown documents created by the agent under `context/`, unless the user explicitly says otherwise.
- **Applies to**: plan, new, plan-review, implement, shape

## Never Use Smell Checks For Agar Or Grain

- **Context**: Diagnosis rubric, evaluation cases, prompts, research, and implementation work for agar/grain troubleshooting.
- **Problem**: AI-generated cultivation advice often suggests judging agar or grain by smell, which is unreliable and exactly the kind of low-quality guidance this product must avoid.
- **Rule**: Never ask or suggest that the user check agar or grain by smell. Use grow-log facts and direct visual observations instead.
- **Applies to**: research, plan, plan-review, implement, impl-review
