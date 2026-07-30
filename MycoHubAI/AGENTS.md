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

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
