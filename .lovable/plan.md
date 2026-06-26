## Phase 1B Frontend — Metro Areas tab (single-file edit)

Migration `20260626_admin_phase1b_metro_areas.sql` is already applied to Dev `wxmewdwqeeejoetwyiem`. This plan covers only the frontend.

### Single file changed
`src/pages/Admin.tsx`. No other files. `METRO_OPTIONS` untouched. Scrape tab, moderation labels, feed registry, ingestion, scheduler, Ticketmaster worker, public pages, Header, routing, layout — all untouched. No Delete control. No delete RPC.

### Edits, in order

1. **Imports (line 4)** — add `MapPin, Power, PowerOff` to the existing `lucide-react` import.
2. **Types (after line 28)** — add:
   ```ts
   type MetroArea = Tables<'metro_areas'>;
   ```
3. **State (after the existing feed-health state, ~line 90)**:
   - `metros: MetroArea[]`, `metrosLoading: boolean`, `metroSearch: string`
   - `editingMetroId: string | null` (`null` closed, `'new'` create, uuid edit)
   - `metroForm: { name, slug, core_cities, included_counties, included_zip_prefixes, latitude, longitude }` (strings)
   - `metroSaving: boolean`
   - `statusDialog: { open, metro: MetroArea|null, target: boolean, reason: string, submitting: boolean }`
4. **Loader + effect**:
   - `loadMetros()` → `supabase.from('metro_areas').select('*').order('name')`.
   - `useEffect(() => { if (isAdmin && activeTab === 'metros') loadMetros(); }, [isAdmin, activeTab])`.
5. **Handlers**:
   - `openCreateMetro()` / `openEditMetro(m)` — populate `metroForm` (jsonb arrays → comma-separated strings).
   - `cancelMetroEdit()` — clears form and `editingMetroId`.
   - `parseCsvList(s)` — `s.split(',').map(x => x.trim()).filter(Boolean)`.
   - `saveMetro()` — client validates non-empty `name` and lower-cased slug against `^[a-z0-9-]+$`, then `supabase.rpc('admin_upsert_metro_area', { p_id, p_name, p_slug, p_core_cities, p_included_counties, p_included_zip_prefixes, p_latitude, p_longitude })`. Friendly toast on `23505` unique violation ("A metro with that name or slug already exists"). Other errors via `getSafeErrorMessage`.
   - `requestStatusChange(metro, target)` opens `AlertDialog`; activate confirms immediately, deactivate requires reason `Textarea` (Confirm disabled until trimmed length ≥ 3).
   - `submitStatusChange()` → `supabase.rpc('admin_set_metro_area_status', { p_id, p_is_active, p_reason })`; reload + toast; close dialog.
6. **TabsTrigger** added after the Scrape Sources trigger (line 540):
   ```tsx
   <TabsTrigger value="metros" className="gap-2"><MapPin className="w-4 h-4" />Metro Areas</TabsTrigger>
   ```
7. **TabsContent** added before the closing `</Tabs>` at line 1099:
   - Header row: title + search `Input` + "Add Metro Area" `Button` (opens inline create form).
   - Inline form when `editingMetroId !== null`: Name, Slug (lowercased on blur), Core cities (CSV), Included counties (CSV), Included ZIP prefixes (CSV), Latitude, Longitude, Save / Cancel. Save shows `Loader2`.
   - `Table` columns: Name, Slug, Status (`Badge` "Active" / "Inactive"), Cities (count), Counties (count), Updated (locale date), Actions (Edit + Activate or Deactivate). Filter rows client-side by `metroSearch` against `name` and `slug`.
   - States rendered: loading spinner, empty ("No metro areas yet"), no-results ("No matches for 'X'").
   - Deactivate `AlertDialog`: required reason `Textarea`; Cancel + Confirm.
   - Activate `AlertDialog`: simple confirm.

### Explicit non-changes (per scope correction)
- `METRO_OPTIONS` constant retained as-is and still referenced by the Scrape Sources tab.
- No edits outside the new tab except the three minimal additions above (import, type alias, state block, effect, handlers, tab trigger, tab content).
- No delete UI or delete RPC.

### Post-implementation testing (Lovable Preview + Supabase Dashboard SQL Editor only, no CLI/psql)

QA data rule: any test metro is named **"BogieBoard Admin QA — Inactive"** with slug `bogieboard-admin-qa-inactive`, and is left inactive at end of QA with reason **"Phase 1B QA test record — do not use for operations."**. The three seeded operational metros are not modified.

Browser steps (signed in as admin):
1. Admin → Metro Areas → list shows 3 seeded rows, all Active.
2. Add "BogieBoard Admin QA — Inactive" with one city + one county → row appears Active.
3. Edit it: add another city → updates; `updated_at` advances.
4. Search "qa" → narrows; clear → restored.
5. Deactivate with reason "Phase 1B QA test record — do not use for operations." → badge flips to Inactive.
6. Reactivate (simple confirm) → flips to Active.
7. Re-deactivate with the same QA reason → final state Inactive.
8. Attempt to add a duplicate-slug row (`charlotte-nc`) → toast surfaces friendly error; no row created.
9. Devtools call `supabase.rpc('admin_upsert_metro_area', …)` while signed in as a non-admin (open in incognito with a non-admin account) → returns `forbidden`.

Supabase Dashboard SQL Editor verification queries:
```sql
-- Operational metros unchanged
SELECT name, slug, is_active FROM public.metro_areas
WHERE slug IN ('charlotte-nc','greensboro-nc','raleigh-durham-nc')
ORDER BY name;

-- QA record final state
SELECT name, slug, is_active, updated_at FROM public.metro_areas
WHERE slug = 'bogieboard-admin-qa-inactive';

-- Audit trail for the QA record (expect: created, updated, deactivated, activated, deactivated)
SELECT created_at, action, actor_id, reason,
       old_value->>'name' AS old_name,
       new_value->>'name' AS new_name,
       old_value->>'is_active' AS old_active,
       new_value->>'is_active' AS new_active
FROM public.admin_audit_log
WHERE entity_type = 'metro_area'
ORDER BY created_at DESC
LIMIT 20;
```

Confirmations to report back:
- `METRO_OPTIONS` still present and unchanged; Scrape Sources tab dropdown unchanged.
- No Delete control rendered; no delete RPC exists (only `admin_upsert_metro_area` and `admin_set_metro_area_status`).
- Only `src/pages/Admin.tsx` changed.

Stop after Phase 1B.
