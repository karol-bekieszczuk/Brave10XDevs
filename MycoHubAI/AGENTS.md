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

## 10x Workflow References

For 10x skill behavior, read the invoked skill's `SKILL.md` instead of relying on duplicated lesson text here. Foundation contracts live in @context/foundation/;

<!-- END @przeprogramowani/10x-cli -->
