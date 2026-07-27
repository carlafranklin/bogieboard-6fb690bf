// supabase/functions/lifecycle-expire-events/index.ts
//
// Phase 1 of the new event lifecycle cleanup process. Manual-only (no
// schedule, no GitHub Actions). Marks canonical_events as 'expired' once
// they are unambiguously over — replaces reliance on the legacy
// cleanup-events function, which stays disabled and untouched.
//
// Rule: status = 'active' AND COALESCE(end_time, start_time) < now()
//   - end_time is used when present so multi-day events aren't expired
//     on their first day; falls back to start_time otherwise.
//
// Only ever updates canonical_events.status. Never touches source_events,
// saved_events, partner_events, price fields, raw_payload, venue_id, or
// metro_area_id. Never deletes any row.
//
// Required secrets (Dashboard → Project Settings → Edge Functions → Secrets):
//   BOGIEBOARD_SERVICE_ROLE_KEY  — service_role JWT (same convention as ingest-worker)
//
// SUPABASE_URL is injected automatically by the runtime.
//
// Every invocation writes one audit row to ingestion_runs, attributed to a
// dedicated "Lifecycle Cleanup" system source (created on first use), the
// same self-registration pattern monitor-feeds uses for "Feed Health Monitor".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LIFECYCLE_SOURCE_NAME = 'Lifecycle Cleanup'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startedAt = new Date()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('BOGIEBOARD_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({
      error: 'BOGIEBOARD_SERVICE_ROLE_KEY or SUPABASE_URL is not set. ' +
        'Add BOGIEBOARD_SERVICE_ROLE_KEY in Dashboard → Project Settings → Edge Functions → Secrets.',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let dryRun = false
  try {
    const body = await req.json()
    dryRun = body?.dry_run === true
  } catch { /* no body: defaults to dry_run=false, matching cleanup-events' convention */ }

  const nowISO = startedAt.toISOString()
  // COALESCE(end_time, start_time) < now(), expressed as PostgREST or() groups.
  const staleFilter = `and(end_time.not.is.null,end_time.lt.${nowISO}),and(end_time.is.null,start_time.lt.${nowISO})`

  try {
    // Exact candidate count, immune to PostgREST's default row cap.
    const { count: candidateCount, error: countErr } = await supabase
      .from('canonical_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .or(staleFilter)

    if (countErr) throw countErr

    let sample: { id: string; title: string; start_time: string; end_time: string | null }[] = []
    let expiredCount = 0

    if (dryRun) {
      const { data: sampleRows, error: sampleErr } = await supabase
        .from('canonical_events')
        .select('id, title, start_time, end_time')
        .eq('status', 'active')
        .or(staleFilter)
        .order('start_time', { ascending: true })
        .limit(25)

      if (sampleErr) throw sampleErr
      sample = sampleRows || []
    } else {
      // Single atomic UPDATE, same filter as the candidateCount query above.
      // Chaining .select(..., { count: 'exact', head: true }) onto an UPDATE
      // to read its affected-row count back was tried and observed to be
      // unreliable (supabase-js returned null even though the UPDATE itself
      // succeeded) — so instead we trust candidateCount, computed moments
      // earlier via the identical filter, as this update's row count. Not
      // re-selecting the updated rows to count them directly on purpose:
      // that would reintroduce the PostgREST Max Rows cap for any backlog
      // over 1,000, the same issue count:'exact' head:true was chosen to avoid.
      const { error: updateErr } = await supabase
        .from('canonical_events')
        .update({ status: 'expired' })
        .eq('status', 'active')
        .or(staleFilter)

      if (updateErr) throw updateErr
      expiredCount = candidateCount ?? 0
    }

    const endedAt = new Date()
    const sourceId = await getOrCreateLifecycleSourceId(supabase)

    const { error: auditErr } = await supabase.from('ingestion_runs').insert({
      source_id: sourceId,
      status: 'completed',
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      records_fetched: candidateCount ?? 0,
      records_updated: dryRun ? 0 : expiredCount,
      errors_count: 0,
      metadata: {
        type: 'lifecycle_expire_events',
        dry_run: dryRun,
        candidate_count: candidateCount ?? 0,
        expired_count: dryRun ? null : expiredCount,
        cutoff: nowISO,
      },
    })

    if (auditErr) {
      // The data operation above already succeeded (or was a no-op dry run) —
      // an audit-write failure alone must not turn that into an HTTP 500.
      // Report it clearly in the body so a manual Dashboard invocation surfaces
      // it immediately, since there's no other UI watching ingestion_runs yet.
      console.error('Lifecycle expire: audit insert failed:', auditErr.message)
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      candidate_count: candidateCount ?? 0,
      expired_count: dryRun ? null : expiredCount,
      cutoff: nowISO,
      sample: dryRun ? sample : undefined,
      audit_logged: !auditErr,
      audit_error: auditErr ? auditErr.message : undefined,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Lifecycle expire error:', message)

    try {
      const sourceId = await getOrCreateLifecycleSourceId(supabase)
      await supabase.from('ingestion_runs').insert({
        source_id: sourceId,
        status: 'failed',
        started_at: startedAt.toISOString(),
        ended_at: new Date().toISOString(),
        errors_count: 1,
        metadata: { type: 'lifecycle_expire_events', dry_run: dryRun, error: message },
      })
    } catch (auditError) {
      console.error('Lifecycle expire: failed to write audit row:', auditError)
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function getOrCreateLifecycleSourceId(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data: existing } = await supabase
    .from('sources')
    .select('id')
    .eq('name', LIFECYCLE_SOURCE_NAME)
    .maybeSingle()

  if (existing) return existing.id as string

  const { data: created, error } = await supabase
    .from('sources')
    .insert({ name: LIFECYCLE_SOURCE_NAME, type: 'manual', is_active: true, trust_score: 100 })
    .select('id')
    .single()

  if (error) throw error
  return created!.id as string
}
