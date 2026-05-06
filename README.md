# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

# BogieBoard Environments & Release Workflow

BogieBoard runs a two-environment release model. Lovable commits to
**`main`** (logical = staging); a long-lived **`production`** branch is the
live release. Promotion is a PR from `main` → `production`.

> The branch name `main` and the logical environment name `develop` are
> intentionally different. Lovable keeps tracking `main` (its default), and
> Amplify sets `VITE_APP_ENV=develop` on that branch so the app behaves as
> staging.

## Environment Matrix

| Environment | Branch       | Domain                        | Backend (Supabase) | `VITE_APP_ENV` | UI badge |
|-------------|--------------|-------------------------------|--------------------|----------------|----------|
| Production  | `production` | `www.bogieboard.com`          | Production project | `production`   | (none)   |
| Develop     | `main`       | `dev.bogieboard.com`          | Dev project        | `develop`      | yellow `DEV` |
| Preview     | n/a          | Lovable preview / `localhost` | whichever `.env` points to | unset → `preview` | gray `PREVIEW` |

The current environment is exposed in code via `src/lib/env.ts`
(`APP_ENV`, `isProduction()`, `isDevelop()`, `isPreview()`).

## Release Workflow

```text
Lovable ──► main ──► Amplify (main branch) ──► dev.bogieboard.com ──► Supabase Dev
                                                                        │
                                                PR + review + QA        │
                                                          ▼             │
            production ──► Amplify (production branch) ──► www.bogieboard.com ──► Supabase Production
```

1. Lovable's tracked branch is **`main`**. All AI/agent commits land there.
2. `main` auto-deploys to `dev.bogieboard.com` via AWS Amplify.
3. Test on `dev.bogieboard.com`. Backend writes go to the Supabase Dev project.
4. When ready, open a PR from `main` → `production`.
5. Merging to `production` auto-deploys to `www.bogieboard.com` against Supabase Production.

The `production` branch is live. Never commit directly to it — always promote via PR.

## GitHub Environments (for Actions secrets)

The data-pipeline workflows under `.github/workflows/` resolve their
Supabase credentials from **GitHub Environments**, not repo-level secrets.

Create two environments under **Settings → Environments**:

| Environment name | `SUPABASE_URL`                              | `SUPABASE_ANON_KEY`              |
|------------------|---------------------------------------------|----------------------------------|
| `production`     | Production project URL                      | Production anon key              |
| `develop`        | Dev project URL                             | Dev anon key                     |

(Optional) Add required reviewers to the `production` environment if you
want manual approval before any workflow runs against production.

## Manual Workflow Runs

All six pipeline workflows expose an `environment` input on **Actions →
Run workflow**:

- `ingest-events.yml`
- `ingest-events-full.yml`
- `ingest-feeds.yml`
- `scrape-events.yml`
- `cleanup-events.yml`
- `monitor-feeds.yml`

Pick `production` or `develop`; the job's `environment:` binding
resolves the matching `SUPABASE_URL` / `SUPABASE_ANON_KEY` secrets.
Scheduled runs default to `production` (no input → fallback to `production`).

## Amplify Environment Variables (per branch)

Configure in **Amplify Console → App settings → Environment variables**,
scoped per branch:

| Variable                       | `main` (production)                 | `develop`                          |
|--------------------------------|-------------------------------------|------------------------------------|
| `VITE_APP_ENV`                 | `production`                        | `develop`                          |
| `VITE_SUPABASE_URL`            | Production project URL              | Dev project URL                    |
| `VITE_SUPABASE_PUBLISHABLE_KEY`| Production publishable/anon key     | Dev publishable/anon key           |
| `VITE_SUPABASE_PROJECT_ID`     | Production project ref              | Dev project ref                    |

The Lovable-managed files (`src/integrations/supabase/client.ts`,
`src/integrations/supabase/types.ts`, and the local `.env`) are **not**
edited as part of this setup. Amplify-injected env vars take effect at
build time.
