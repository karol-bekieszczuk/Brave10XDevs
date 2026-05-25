# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Set a kill date for feature flags

- **Context**: Whole system
- **Problem**: Whenever a feature is implemented behind a feature flag, the flag can be removed by the agent unless its removal is planned explicitly. Without a kill date, agent doesnt know when feature flags should be removed and decides by himself.
- **Rule**: Whenever a feature is implemented with a feature flag, set an explicit `kill date` parameter for that flag. State when the flag should be removed as part of the feature work and this should never be ommited by the agent.
- **Applies to**: all
