---
change_id: tool-loop-agent
title: Modular ToolLoopAgent code reviewer
status: planned
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

I want to convert '/packages/code-reviewer/src/index.ts' into well-organized, modular code review agent based on ai-sdk ToolLoopAgent. Use @packages/code-reviewer/.agents/skills/ai-sdk/SKILL.md to understand its API. Extract structured output schemas into separate modules, as well as prompts. Make sure agent module is reusable and exports our reviewer so that we can run promptfoo evals on it in the future. Do not configure eval environment in this change.
