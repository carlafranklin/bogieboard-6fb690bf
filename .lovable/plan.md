# Branching Model Flip: `main` = staging, `production` = live

Lovable continues to commit to **`main`** (its default tracked branch — no Labs needed). A new long-lived **`production`** branch becomes the live release. Promotion is a PR from `main` → `production`.

---

## Environment Matrix (revised)

| Environment | Branch       | Domain                | Supabase project | `VITE_APP_ENV` | Badge |
|-------------|--------------|-----------------------|------------------|----------------|-------|
| Production  | `production` | `www.bogieboard.com`  | Prod             | `production`   | none  |
| Develop     | `main`       | `dev.bogieboard.com`  | Dev              | `develop`      | yellow `DEV` |
| Preview     | n/a          | Lovable preview / localhost | whichever `.env` points to | unset → `preview` | gray `PREVIEW` |

Note: the **branch** is `main`, but its **logical environment** is "develop". `VITE_APP_ENV=develop` on the `main` branch in Amplify is what drives the `DEV` badge and any `isDevelop()` checks.

---

## File Changes

### 1. `.github/workflows/*.yml` (all 6)
Already updated to accept an `environment` input with options `production` / `develop` and bind `environment: ${{ inputs.environment || 'production' }}`. **No further code change needed** — these names refer to GitHub *Environments*, not branches, so they remain correct under the flipped model.

Only adjustment: scheduled cron runs currently default to the `production` Environment. That stays correct (we still want scheduled ingestion to hit the prod Supabase project).

### 2. `README.md` — rewrite the Environments / Release Workflow sections
Replace the previous `develop` → `main` narrative with the flipped model:

- Environment Matrix table (above).
- Release flow diagram:
  ```text
  Lovable ──► main ──► Amplify (main branch) ──► dev.bogieboard.com ──► Supabase Dev
                                                                          │
                                                  PR + review + QA        │
                                                            ▼             │
                production ──► Amplify (production branch) ──► www.bogieboard.com ──► Supabase Production
  ```
- Explicit callout: "The `main` branch is the **staging** environment. The `production` branch is **live**. Never commit directly to `production`; always promote via PR from `main`."
- GitHub Environments table unchanged (`production` / `develop` Environments still hold the right secrets).
- Amplify per-branch env vars table updated:
  - `production` branch → `VITE_APP_ENV=production` + prod Supabase values
  - `main` branch → `VITE_APP_ENV=develop` + dev Supabase values

### 3. No changes to
- `src/lib/env.ts`, `src/components/EnvBadge.tsx`, `src/vite-env.d.ts`, `src/App.tsx` — env detection is driven by `VITE_APP_ENV`, which is set per Amplify branch, so the flipped branch model needs no code change.
- `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`
- Any auth code, edge function source, cron schedules, or `supabase/config.toml`.

---

## Manual Setup Checklist (revised for flipped model)

### GitHub
1. From current `main`, create a new branch **`production`** (GitHub UI → branch dropdown → "Create branch: production from main"). This becomes the live branch.
2. **Settings → Branches → Default branch**: leave `main` as default (Lovable keeps tracking it).
3. **Settings → Branches → Branch protection rules**: protect `production` — require PR from `main`, no direct pushes, optionally require review.
4. **Settings → Environments**, create (if not already):
   - `production` → secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` (prod project values).
   - `develop` → secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` (dev project values).
   - Optional: add required reviewers on the `production` Environment so manual workflow runs against prod need approval.

### Lovable
- No action. Lovable's tracked branch stays as `main`. Skip Labs entirely.

### AWS Amplify
1. In the existing Amplify app, **Connect branch** → add `production` as a second branch deployment.
2. **App settings → Environment variables**, scope per branch:
   - `production` branch:
     - `VITE_APP_ENV=production`
     - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` → **prod** values
   - `main` branch:
     - `VITE_APP_ENV=develop`
     - same three keys → **dev** values
3. **Hosting → Domain management**:
   - `production` branch → `www.bogieboard.com` (+ apex `bogieboard.com` redirect to www)
   - `main` branch → `dev.bogieboard.com`
4. Trigger a build on each branch to verify env vars are picked up.

### Supabase (Dev project)
1. Create new Supabase project (e.g. `bogieboard-dev`).
2. Apply all migrations from `supabase/migrations/` via `supabase db push --project-ref <dev-ref>`.
3. Deploy all 5 edge functions to the dev project.
4. Set the same Edge Function secrets as prod (`TICKETMASTER_API_KEY`, `EVENTBRITE_PRIVATE_TOKEN`, `GOOGLE_AI_API_KEY`, etc.). `SUPABASE_SERVICE_ROLE_KEY` is auto-provisioned.
5. Auth → URL Configuration:
   - Site URL: `https://dev.bogieboard.com`
   - Additional Redirect URLs: `https://dev.bogieboard.com/auth/callback`, `http://localhost:8080/auth/callback`
6. Auth → Providers: configure Google (and Apple/Facebook if used) with **dev** OAuth client and dev callback URLs.

### Supabase (Prod project — audit only)
- Site URL: `https://www.bogieboard.com`
- Additional Redirect URLs include: `https://www.bogieboard.com/auth/callback`, `https://bogieboard.com/auth/callback`

### DNS (at registrar)
1. Add `CNAME` record `dev` → Amplify target for the **`main`** branch.
2. Verify `www` and apex still point to Amplify target for the **`production`** branch.

### Google OAuth (and Apple/Facebook if used)
1. In Google Cloud Console, create a second OAuth 2.0 client for dev (or extend existing):
   - Authorized JavaScript origins: `https://dev.bogieboard.com`
   - Authorized redirect URIs: `https://<dev-supabase-ref>.supabase.co/auth/v1/callback`
2. Paste dev client ID/secret into Supabase Dev → Auth → Providers → Google.
3. Confirm prod OAuth client still lists `https://www.bogieboard.com` and the prod Supabase callback URL.

---

## Promotion Workflow (day-to-day)

1. Lovable commits land on `main` → auto-deploys to `dev.bogieboard.com` (Supabase Dev).
2. QA on dev domain.
3. Open PR `main` → `production`. Review and merge.
4. Amplify auto-deploys `production` branch to `www.bogieboard.com` (Supabase Prod).
5. For the data pipelines, use **Actions → Run workflow → environment: production** (or `develop`) to manually target either backend. Scheduled runs continue to hit production.

---

## Deliverables After Implementation
1. Diff: only `README.md` is rewritten this round (workflows already updated last round).
2. Build/TS check result.
3. Final manual checklist (above) reproduced verbatim in chat for your tracking.
