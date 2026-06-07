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

## 10xDevs AI Toolkit - Module 2, Lesson 5

Scale the single-change cycle into parallel work with **worktrees, goal-directed delegation, and multi-session orchestration**:

```
worktree per change -> /goal or your AI coding assistant -p -> PR -> review -> merge
```

The lesson focus is safe throughput: isolated contexts, choosing the right execution mode, and capping parallelism at review capacity.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code isolation** | |
| `git worktree add` | You need a separate working directory for a parallel change. One change per worktree, one fresh agent context per worktree. |
| **Complex changes** | |
| `/10x-implement <change-id> phase <n>` | The change has multiple phases, needs manual gates, or benefits from interactive decision-making during execution. |
| **Simple changes** | |
| `/goal` | You have a clear, bounded task and want goal-directed delegation. The agent works autonomously toward the stated goal with a stop condition. |
| `your AI coding assistant -p` | You want headless execution for a well-defined task. The Ralph Wiggum loop (run, check, retry) is the universal autonomous pattern. |
| **Multi-session orchestration** | |
| Superset / Conductor / Antigravity / VS Code Agent View | You are running multiple agent sessions in parallel and need visibility, coordination, or session management across them. |

### Parallel work rules

- One change per worktree or isolated workspace. One fresh agent context per change.
- Choose interactive `/10x-implement` for complex changes, `/goal` or `your AI coding assistant -p` for simple ones.
- Parallelism is capped by review capacity. More agents without review means more unreviewed code, not higher throughput.
- The quality pain from faster shipping is intentional — it bridges into Module 3 testing gates.

### Lesson boundaries

- Do not reteach interactive `/10x-implement` or `/10x-impl-review`; those are Lessons 2 and 3.
- Do not introduce testing strategy here. The quality pain is the motivation for Module 3.
- Worktrees are a mechanism for isolation, not the topic of a full git tutorial.

### Paths used by this lesson

- `context/changes/<change-id>/` - active change folder
- `context/changes/<change-id>/plan.md` - implementation input for any execution mode

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
