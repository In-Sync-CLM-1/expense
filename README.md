# In-Sync Expense Claims

Employee expense claim management system with multi-tenant organisation support, OTP-based onboarding, and email notifications.

## Tech Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS + shadcn-ui (PWA via vite-plugin-pwa)
- **Backend:** Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **Hosting:** Cloudflare Pages
- **Integrations:** Resend (transactional email)

## Local Development

```sh
npm install
npm run dev          # http://localhost:8080
npm run build        # outputs to dist/
npm run lint
```

`.env` (gitignored) must contain at minimum:

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

For deploys, also include:

```env
CLOUDFLARE_API_TOKEN=cfut_...
CLOUDFLARE_ACCOUNT_ID=...
SUPABASE_ACCESS_TOKEN=sbp_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # server-only, never bundled
SUPABASE_DB_PASSWORD=...
SUPABASE_PROJECT_REF=<ref>
```

Only values prefixed `VITE_` are inlined into the browser bundle. Anything that grants write access (service role key, sbp_ token, Cloudflare API token) must NOT be prefixed `VITE_`.

## Deploy — Frontend (Cloudflare Pages)

The frontend ships directly from a local working tree using Wrangler. There is no GitHub Actions step for the frontend; pushing code does not deploy it.

```powershell
npm run build
Set-Content -Path dist\_redirects -Value "/*  /index.html  200"
wrangler pages deploy dist --project-name=expense-sync --branch=main
```

The Cloudflare Pages project is `expense-sync`, served at `https://expense-sync.pages.dev`. The custom domain `expense.in-sync.co.in` points at it via a proxied CNAME on the `in-sync.co.in` zone.

## Deploy — Supabase (CI)

Migrations and edge functions deploy automatically on push to `main` when files under `supabase/**` change. See `.github/workflows/supabase-deploy.yml`.

Required GitHub Actions secrets:

- `SUPABASE_ACCESS_TOKEN` (`sbp_…`)
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `FROM_EMAIL`

Edge functions in this repo: `admin-create-user`, `send-expense-notification`, `send-otp`, `verify-otp`.

## Custom Domain

Production: `https://expense.in-sync.co.in`

DNS is managed in Cloudflare; the record is a proxied CNAME pointing at `expense-sync.pages.dev`.

## Rollback

Forward-rollback (bad new deploy, Pages itself fine): use the Cloudflare Pages dashboard to roll back to a previous deployment of `expense-sync`.

Full rollback to Azure (only viable while the legacy SWA still exists): PATCH the production CNAME back to the Azure target (`witty-mushroom-0af0ce31e.7.azurestaticapps.net`) via the Cloudflare API.
