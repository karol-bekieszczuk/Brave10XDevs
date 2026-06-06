# Repository Guidelines
MycoHubAI is an Astro 6 SSR app for an after-hours MVP: text grow logs plus AI-assisted agar/grain troubleshooting. The stack is Astro, React islands, TypeScript, Tailwind CSS, Supabase, and Cloudflare Workers; see @context/foundation/prd.md and @context/foundation/tech-stack.md for product and stack decisions.

## Hard Rules
- Keep diagnosis work inside the MVP scope: agar and grain stages only. Unsupported topics should redirect back to the supported scope, not expand the product surface.
- Diagnostic answers must include uncertainty and must not present causes or actions as guaranteed.
- Treat grow logs as private single-user data. Do not add sharing, social features, full multi-user account flows, saved chat history, photo storage, or image analysis unless the PRD changes.
- Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

## Commands
- Use @package.json for npm scripts and @.github/workflows/ci.yml for CI behavior.

## Project Structure
- `src/pages/api/` contains API routes with uppercase method exports.
- `src/middleware.ts` resolves the Supabase user and protects paths listed in `PROTECTED_ROUTES`.
- `src/components/ui/` contains shadcn/ui components.
- `context/foundation/` holds product planning artifacts.

## Coding Conventions
Use the `@/*` alias for imports from `src`, as configured in @tsconfig.json. Prefer Astro components for pages, layouts, and static UI; use React components only for interactive islands. Use `cn()` from `@/lib/utils` for conditional Tailwind classes instead of manual string concatenation. Follow the existing shadcn/ui `new-york` setup in @components.json and lucide icons for icon buttons.

## Configuration
Supabase and provider values are server-only secrets declared in @astro.config.mjs and read through `astro:env/server`. Keep local examples in `.env.example`; use shell/OS environment variables for local secret values and Cloudflare dashboard/Wrangler secrets for deployed Workers.
Do not read `.env`, `.dev.vars`, or any file that may contain real API keys or secrets unless the user explicitly instructs you to inspect that file in the current turn. Prefer `.env.example`, committed config schemas, and environment variable names for implementation work.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
