## Plan: Disable Legacy Scrape-Events Invocation in Admin

### Objective
Remove the ability to manually trigger the legacy `scrape-events` Edge Function from the Admin UI and replace it with a read-only MVP notice, without altering any backend functions, pipelines, or other tabs.

### Changes

**File: `src/pages/Admin.tsx`**

1. **Remove `handleRunScraper()` entirely**
   - Confirmed: no remaining references after the "Run Scraper Now" button is removed.
   - Also remove the `scrapeRunning` / `setScrapeRunning` state variable (used only by this legacy action).
   - `Globe` and `Loader2` imports remain because they are used by legitimate UI elements (tab trigger and loading spinners elsewhere).

2. **Remove "Run Scraper Now" button**
   - Remove the button and its surrounding action container in the "Scrape Sources" tab.

3. **Add read-only MVP notice**
   - Insert a static informational block in the same action area with:
     - **Title:** Controlled HTML Sources
     - **Message:** No HTML sources are enabled for the MVP. Ticketmaster ingestion runs through the managed ingest-dispatcher → ingest_queue → ingest-worker pipeline. HTML source onboarding will be enabled only after source-by-source compliance, robots.txt, terms, rate-limit, source-lineage, and monitoring controls are approved.

### Boundaries (no changes)
- No edits to `scrape-events` Edge Function source.
- No edits to `ingest-dispatcher`, `ingest-worker`, `feed_registry`, `ingest_queue`, migrations, Supabase secrets, schedules, or other Edge Functions.
- No edits to other Admin tabs (Users, Categories, Stats, Moderation, Feed Health, Metro Areas).
- No backend RPC or database changes.

### Deployment Target
- Branch: `main`
- Environment: Dev only (`https://dev.bogieboard.com`)
- No promotion to Production.

### Verification
- Build passes (`tsc` / `vite build`).
- Preview/render of Admin page "Scrape Sources" tab shows the MVP notice and no "Run Scraper" button.
- Browser validation steps will be provided post-implementation.