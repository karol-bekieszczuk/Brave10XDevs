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
Supabase values are server-only secrets declared in @astro.config.mjs and read through `astro:env/server`. Keep local examples in `.env.example`; use `.env` for Node tooling and `.dev.vars` for Cloudflare local secrets.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
