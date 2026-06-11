# MycoHubAI

Private single-user grow-log workspace for agar and grain troubleshooting.

## Tech Stack

- [Astro](https://astro.build/) v6 - server-first web framework
- [React](https://react.dev/) v19 - interactive islands
- [TypeScript](https://www.typescriptlang.org/) v5 - type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - utility-first CSS
- [Supabase](https://supabase.com/) - authentication
- [Cloudflare Workers](https://workers.cloudflare.com/) - edge runtime

## Prerequisites

- Node.js v22.14.0, as specified in `.nvmrc`
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

## Supabase Configuration

This project uses Supabase Auth as the credential provider, but MycoHubAI authorizes exactly one configured owner account. Environment variables are declared through Astro's server-only env schema and are never exposed to client code.

Required local values in both `.env` and `.dev.vars`:

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key used by SSR auth |
| `AUTHORIZED_USER_ID` | Allowed owner ID from Supabase Auth `auth.users.id` |
| `SUPABASE_ADMIN_KEY` | Server-only Supabase service-role/admin key used only for account deletion and scheduled purge |
| `OPENROUTER_API_KEY` | Server-only OpenRouter key for selected-log diagnosis |

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

| Route | Description |
| --- | --- |
| `/auth/signin` | Email/password sign-in form |
| `/api/auth/signout` | Sign-out endpoint |
| `/dashboard` | Protected owner-only page |

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

GitHub Actions runs lint and build on every push and pull request to `master`. Configure `SUPABASE_URL`, `SUPABASE_KEY`, and `AUTHORIZED_USER_ID` as repository secrets so the validation build can satisfy Astro's required server env schema.

## License

MIT
