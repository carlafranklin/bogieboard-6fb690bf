
# Develop → Production Release Plumbing (Focused Scope)

Implements environment-awareness for the `develop` (staging) and `main` (production) release model. **No changes** to Supabase client, generated types, `.env`, auth flow, edge function source, or cron schedules.

---

## File-by-File Changes

### 1. `src/vite-env.d.ts` — augment ImportMeta types
Add typed declarations for `VITE_APP_ENV` (and the Supabase vars already in use) so `import.meta.env.VITE_APP_ENV` is typed as `'production' | 'develop' | 'preview' | undefined` without modifying generated files.

### 2. `src/lib/env.ts` — NEW
Small helper module:
```ts
export type AppEnv = 'production' | 'develop' | 'preview';
export const APP_ENV: AppEnv = (import.meta.env.VITE_APP_ENV as AppEnv) || 'preview';
export const isProduction = () => APP_ENV === 'production';
export const isDevelop = () => APP_ENV === 'develop';
export const isPreview = () => APP_ENV === 'preview';
```
- Strict: reads only `VITE_APP_ENV`. No hostname inference.
- Defaults to `preview` when the var is missing (Lovable preview, local dev).

### 3. `src/components/EnvBadge.tsx` — NEW
Small fixed pill, bottom-right, `z-50`, hidden in production:
- `develop` → yellow pill, label `DEV`
- `preview` → gray pill, label `PREVIEW`
- `production` → renders `null`

Uses existing Tailwind tokens (no new colors, no new deps). Accessible (`role="status"`, `aria-label`).

### 4. `src/App.tsx` — mount the badge
Add one import and `<EnvBadge />` next to `<CookieConsent />` inside `<BrowserRouter>`. No other changes.

### 5. GitHub Actions — bind to `develop` / `production` Environments
Update all 6 workflows under `.github/workflows/`:
- `ingest-events.yml`
- `ingest-events-full.yml`
- `ingest-feeds.yml`
- `scrape-events.yml`
- `cleanup-events.yml`
- `monitor-feeds.yml`

For each workflow:
- Add a `workflow_dispatch` input `environment` with options `production` and `develop`, default `production`.
- Add `environment: ${{ inputs.environment || 'production' }}` to the job so GitHub resolves `SUPABASE_URL` / `SUPABASE_ANON_KEY` from the chosen Environment.
- Schedules unchanged → continue running against `production` by default.
- No edits to the curl bodies, payloads, or cron strings.

GitHub Environment name: **`develop`** (lowercase, matches branch name; GitHub accepts this exactly).

### 6. `README.md` — additive updates only
Preserve all existing content. Append/update:
- **Environments** section — table of `production` / `develop` / `preview` with branch, domain, Supabase project, `VITE_APP_ENV` value, badge color.
- **Release Workflow** section — Lovable commits to `develop` → tested at `dev.bogieboard.com` → PR `develop` → `main` for production.
- **GitHub Environments** subsection — how to create `production` and `develop` Environments and which secrets each needs (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- **Manual workflow runs** subsection — how to use the new `environment` input on Actions → Run workflow.

No removal of existing README content.

---

## Explicitly NOT Changed
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `.env`
- Any auth code (`Auth.tsx`, `AuthCallback.tsx`, `ResetPassword.tsx`, `profileSync.ts`)
- Any edge function under `supabase/functions/**`
- Any cron schedule in any workflow
- `supabase/config.toml`

---

## Build / Test
- Run `bun run build` (or `npx vite build`) after edits to confirm no TS errors from the `vite-env.d.ts` augmentation or the new badge component.
- Spot-check that `EnvBadge` renders nothing when `VITE_APP_ENV=production` and renders `PREVIEW` in the Lovable preview (no env var set).

---

## Manual Setup Checklist (provided after implementation)

### GitHub
1. Create `develop` branch from current `main`.
2. In Lovable: **Connectors → GitHub → Settings**, change tracked branch to `develop`.
3. **Settings → Environments**, create:
   - `production` → secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` (production project values).
   - `develop` → secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` (dev project values).
4. (Optional) Protect `main` branch: require PR from `develop`, no direct pushes.

### Supabase (Dev project)
1. Create new Supabase project `bogieboard-dev`.
2. Apply all migrations from `supabase/migrations/` via `supabase db push --project-ref <dev-ref>`.
3. Deploy all 5 edge functions to dev project.
4. Set the same Edge Function secrets as prod: `TICKETMASTER_API_KEY`, `EVENTBRITE_PRIVATE_TOKEN`, `GOOGLE_AI_API_KEY`, etc. (`SUPABASE_SERVICE_ROLE_KEY` is auto-provisioned).
5. Auth → URL Configuration:
   - Site URL: `https://dev.bogieboard.com`
   - Additional Redirect URLs: `https://dev.bogieboard.com/auth/callback`, `http://localhost:8080/auth/callback`
6. Auth → Providers: configure Google/Apple/Facebook with dev OAuth client IDs and dev callback URLs.

### Supabase (Prod project — audit only)
1. Confirm Site URL: `https://www.bogieboard.com`
2. Confirm Additional Redirect URLs include: `https://www.bogieboard.com/auth/callback`, `https://bogieboard.com/auth/callback`

### AWS Amplify
1. Connect the `develop` branch as a second environment.
2. **App Settings → Environment variables**, scope per branch:
   - `main` branch: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (production values), `VITE_APP_ENV=production`
   - `develop` branch: same keys with dev values, `VITE_APP_ENV=develop`
3. **Hosting → Domain management**:
   - `main` → `www.bogieboard.com` (+ apex redirect to www)
   - `develop` → `dev.bogieboard.com`
4. Trigger a build on each branch to verify env vars are picked up.

### DNS (at registrar)
1. Add `CNAME` record: `dev` → Amplify-provided target for the develop branch.
2. Verify `www` and apex still resolve correctly to the production Amplify branch.

### Google OAuth (and Apple/Facebook if used)
1. In Google Cloud Console, create a **second OAuth 2.0 Client** for dev (or add URIs to the existing client):
   - Authorized JavaScript origins: `https://dev.bogieboard.com`
   - Authorized redirect URIs: `https://<dev-supabase-ref>.supabase.co/auth/v1/callback`
2. Paste the dev client ID/secret into Supabase Dev → Auth → Providers → Google.
3. Confirm production OAuth client still lists `https://www.bogieboard.com` and the prod Supabase callback URL.

---

## Deliverables After Implementation
1. File-by-file diff summary.
2. Build output / TS check result.
3. The full manual setup checklist above, with anything I discovered during implementation appended.

