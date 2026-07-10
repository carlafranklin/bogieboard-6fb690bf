# BogieBoard

Local events and experiences marketplace platform. Multi-tenant architecture
supporting general, business, admin, partner, and creator roles.

## Tech Stack

- Frontend: React + Vite
- Backend: Supabase
- Hosting/Infra: AWS Amplify
- No-code/low-code layer: Lovable.dev
- CI/CD: GitHub Actions

## Environments & Release Workflow

| Environment | Branch       | Domain               | Backend                                  |
|-------------|--------------|------------------------|--------------------------------------------|
| Staging/Dev | `main`       | `dev.bogieboard.com`   | Supabase Dev (`abkijvqhrvduqqzglfkj`)      |
| Production  | `production` | `www.bogieboard.com`   | Supabase Production (`cjvnuzsimsvrbbqzcion`) |

**Note:** Lovable Cloud connects to a separate Supabase project
(`wxmewdwqeeejoetwyiem`) and is isolated from both environments above. Do not
treat Lovable Cloud as the Dev baseline.

Changes are developed and tested against `main` (staging/Dev) before being
merged into `production` for release. Do not commit directly to `production`.

## Project Structure

├── .github/          # GitHub Actions workflows / repo config
├── .lovable/          # Lovable.dev project configuration
├── public/            # Static assets served as-is
├── src/               # Application source (React + Vite)
├── supabase/          # Supabase config, migrations, Edge Functions
├── index.html         # Vite entry HTML
├── package.json       # Dependencies and scripts
├── vite.config.ts     # Vite build configuration
├── tailwind.config.ts
└── tsconfig*.json      # TypeScript configuration

> Top-level overview only. `src/` and `supabase/` internals are not yet
> documented here pending a deeper inspection pass.

## Current Pilot Markets

Charlotte, Greensboro/Winston-Salem, Durham, Raleigh, Wilmington (North Carolina).
