# MycoHubAI

Private single-user grow-log workspace for agar and grain troubleshooting.

## Tech Stack

- [Astro](https://astro.build/) v7 - server-first web framework
- [React](https://react.dev/) v19 - interactive islands
- [TypeScript](https://www.typescriptlang.org/) v5 - type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - utility-first CSS
- [Supabase](https://supabase.com/) - authentication
- [Cloudflare Workers](https://workers.cloudflare.com/) - edge runtime

## Prerequisites

- Node.js v24.15.0, as specified in `.nvmrc`
- npm

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure Supabase and the owner user ID. See [Supabase Configuration](#supabase-configuration).

3. Create `.env` for Astro/Node tooling and `.dev.vars` for Cloudflare-style local runtime:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

4. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run format:check` - Check repository formatting without modifying files
- `npm run typecheck` - Run Astro/TypeScript checks
- `npm run test:unit` - Run unit and integration tests
- `npm run test:e2e` - Run the reviewed browser suite against disposable local infrastructure
- `npm run diagnosis:evaluate` - Run the deterministic offline diagnosis contract checks
- `npm run diagnosis:evaluate:live` - Run the live-provider diagnosis checkpoint against real retrieval/RPC

## Supabase Configuration

This project uses Supabase Auth as the credential provider, but MycoHubAI authorizes exactly one configured owner account. Environment variables are declared through Astro's server-only env schema and are never exposed to client code.

Required local values in both `.env` and `.dev.vars`:

| Variable             | Description                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`       | Supabase project URL                                                                           |
| `SUPABASE_KEY`       | Supabase anon/public key used by SSR auth                                                      |
| `AUTHORIZED_USER_ID` | Allowed owner ID from Supabase Auth `auth.users.id`                                            |
| `SUPABASE_ADMIN_KEY` | Server-only Supabase service-role/admin key used only for account deletion and scheduled purge |
| `OPENROUTER_API_KEY` | Server-only OpenRouter key for selected-log diagnosis                                          |

Local example:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
AUTHORIZED_USER_ID=<owner auth.users.id>
SUPABASE_ADMIN_KEY=<service-role key used only by server/admin flows>
OPENROUTER_API_KEY=<openrouter api key>
```

Hosted Supabase example:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
AUTHORIZED_USER_ID=<owner auth.users.id>
SUPABASE_ADMIN_KEY=<service-role key used only by server/admin flows>
OPENROUTER_API_KEY=<openrouter api key>
```

To find `AUTHORIZED_USER_ID`, open Supabase dashboard -> Authentication -> Users, select the intended owner account, and copy its user ID. Use the user ID, not the email address.

### Disable Public Signup

Public signup is not part of this MVP. The app has no signup page or signup API route.

For hosted Supabase:

1. Open the Supabase dashboard for the project.
2. Go to Authentication -> Providers -> Email.
3. Disable public email signup.
4. Keep the intended owner account and use its `auth.users.id` as `AUTHORIZED_USER_ID`.

For local Supabase, `supabase/config.toml` disables `[auth]`, `[auth.email]`, and `[auth.sms]` signup.

### Auth Routes

| Route               | Description                 |
| ------------------- | --------------------------- |
| `/auth/signin`      | Email/password sign-in form |
| `/api/auth/signout` | Sign-out endpoint           |
| `/dashboard`        | Protected owner-only page   |

Route protection is handled in `src/middleware.ts`. The middleware default-denies app and API routes unless the active Supabase `user.id` equals `AUTHORIZED_USER_ID`. Static assets, sign-in, and sign-out are explicitly allowed.

## Deployment

This project deploys to Cloudflare Workers. Production deploy ownership is Cloudflare Workers Builds / Git integration; GitHub Actions is validation-only.

Before production smoke testing, configure:

- Cloudflare Worker runtime secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `AUTHORIZED_USER_ID`
- Cloudflare Workers Builds build variables/secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `AUTHORIZED_USER_ID`
- GitHub repository secrets for CI: `SUPABASE_URL`, `SUPABASE_KEY`, `AUTHORIZED_USER_ID`
- Cloudflare Worker runtime secret: `SUPABASE_ADMIN_KEY` for account deletion and scheduled purge
- Cloudflare Worker runtime secret: `OPENROUTER_API_KEY` for selected-log diagnosis
- Cloudflare Cron Trigger matching `wrangler.jsonc` for the scheduled account-purge worker
- Hosted Supabase public signup disabled

## Account Deletion

Account deletion is a two-step lifecycle:

- The owner requests deletion from `/dashboard`.
- The app disables the account immediately through Supabase Auth soft delete.
- Access stays blocked during a 30-day retention window.
- A scheduled Cloudflare Worker purge permanently hard-deletes the auth user after that window, and related `grow_logs` are removed by the existing `on delete cascade`.

Local verification requires `SUPABASE_ADMIN_KEY`. Production verification also requires the Cloudflare Worker runtime secret plus the deployed Cron Trigger for the purge schedule.

Manual fallback deploy command:

```bash
npx wrangler deploy
```

## CI

GitHub Actions runs `npx astro sync`, `format:check`, `typecheck`, unit tests, lint, and build on every push and pull request to `master`. The separate E2E job uses disposable loopback Supabase and Chromium. CI is validation-only; these checks do not prove hosted/production behavior, deployed Cloudflare configuration, RLS, or provider availability. Configure `SUPABASE_URL`, `SUPABASE_KEY`, and `AUTHORIZED_USER_ID` as repository secrets so the validation build can satisfy Astro's required server env schema.

### AI pull request review

The repository-root `.github/workflows/review.yml` runs an advisory AI review for same-repository pull requests to `master` when they are opened, reopened, marked ready for review, updated, or given the `ai-cr:review` label. It runs only when the pull request changes `MycoHubAI/**` or the review workflow/action. Fork and Dependabot pull requests are intentionally skipped because they must not receive the provider secret or a write-capable token.

In GitHub, open **Settings -> Secrets and variables -> Actions -> Repository secrets** and create a repository secret named `OPENROUTER_API_KEY`. Store the value only in GitHub; do not add it to the checkout, a comment, or workflow output. Each eligible run can make a paid provider request. Automated tests use injected models and do not make paid calls.

Configure these repository labels before live acceptance. The reviewer creates a missing result label when possible, but `ai-cr:review` is an operator command and should be created explicitly.

| Label          | Color     | Meaning                                             |
| -------------- | --------- | --------------------------------------------------- |
| `ai-cr:passed` | `#0E8A16` | The advisory review passed the score policy.        |
| `ai-cr:failed` | `#D93F0B` | The advisory review found issues needing attention. |
| `ai-cr:error`  | `#B60205` | The review automation failed operationally.         |
| `ai-cr:review` | `#1D76DB` | Request an on-demand retry.                         |

The pull request body is included up to 8,000 characters. A textual diff larger than 100 KiB, an empty diff, or an unreadable diff fails closed instead of sending an incomplete review. The comment reports Documentation, Test coverage, and Test quality and reliability on a 1-10 scale. A review passes only when the three-score average is at least 7, every score is at least 5, and there is no `error` finding. Both `ai-cr:passed` and `ai-cr:failed` are advisory outcomes and leave the workflow successful; only an operational error fails the workflow.

Runs are serialized per pull request and a newer run cancels an in-progress one. Immediately before publication, the reviewer checks the current head SHA and refuses to publish stale comment or label state. The marked bot comment is updated in place, unrelated labels and human comments are left unchanged, and exactly one result label is retained.

To retry, add `ai-cr:review` to the pull request. The workflow consumes the command label when the retry begins, updates the existing marked comment, and reconciles the result labels. Re-add the label after fixing an operational problem; do not expose or copy the provider secret while troubleshooting.

#### AI review troubleshooting

- Open the failed **AI Code Review** run and inspect the trusted reviewer step. The marked comment and `ai-cr:error` identify a redacted failure category when GitHub publication is still available.
- Provider authentication, rate-limit, timeout, or availability failures: verify that the repository secret is present and usable in **Settings -> Secrets and variables -> Actions**, then re-add `ai-cr:review`. Do not print, copy into the repository, or rotate the value merely to inspect it.
- Malformed model output: look for `MODEL_OUTPUT_INVALID`, then retry. Repeated failures require a schema/provider investigation; do not treat them as a negative code-review verdict.
- Permission failures: verify that repository or organization Actions policy permits the workflow's declared `contents: read`, `pull-requests: write`, and `issues: write` permissions.
- Label failures: verify the four names, colors, and descriptions above, and confirm Actions may write issue labels. Correct the label configuration and re-add `ai-cr:review`.
- Comment failures: verify pull-request write permission and GitHub API availability. The workflow cannot guarantee an `ai-cr:error` label or comment when GitHub itself rejects publication, so use the run log as the source of truth.
- Empty or over-limit diffs: push a small, reviewable in-scope change. The reviewer does not partially score an empty patch or a patch over 100 KiB.

From `MycoHubAI`, run the deterministic reviewer checks with:

```bash
npm.cmd --prefix packages/code-reviewer ci
npm.cmd --prefix packages/code-reviewer test
npm.cmd --prefix packages/code-reviewer run typecheck
```

These checks prove package behavior with controlled doubles; only a same-repository test pull request proves the live OpenRouter and GitHub comment/label integration. This workflow does not deploy the application. Production deployment remains owned by Cloudflare Workers Builds / Git integration as described above.

## License

MIT
