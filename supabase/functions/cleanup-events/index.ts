import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    let dryRun = false
    try {
      const body = await req.json()
      dryRun = body.dry_run || false
    } catch { /* no body */ }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90)
    const cutoffISO = cutoffDate.toISOString()

    // Find events older than 90 days that are still active
    const { data: staleEvents, error: queryErr } = await supabase
      .from('canonical_events')
      .select('id, title, start_time')
      .eq('status', 'active')
      .lt('start_time', cutoffISO)
      .order('start_time', { ascending: true })

    if (queryErr) throw queryErr

    const total = staleEvents?.length || 0

    // Find which of these are saved by users
    const staleIds = (staleEvents || []).map(e => e.id)
    let savedIds: Set<string> = new Set()

    if (staleIds.length > 0) {
      // Query in batches of 500
      for (let i = 0; i < staleIds.length; i += 500) {
        const batch = staleIds.slice(i, i + 500)
        const { data: savedRows } = await supabase
          .from('saved_events')
          .select('canonical_event_id')
          .in('canonical_event_id', batch)
        if (savedRows) {
          savedRows.forEach(r => {
            if (r.canonical_event_id) savedIds.add(r.canonical_event_id)
          })
        }
      }
    }

    const toExpire = staleIds.filter(id => !savedIds.has(id))
    const preserved = staleIds.filter(id => savedIds.has(id))

    if (dryRun) {
      return new Response(JSON.stringify({
        dry_run: true,
        total_stale: total,
        would_expire: toExpire.length,
        preserved_by_saves: preserved.length,
        cutoff_date: cutoffISO,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark non-saved events as expired in batches
    let expired = 0
    for (let i = 0; i < toExpire.length; i += 200) {
      const batch = toExpire.slice(i, i + 200)
      const { error } = await supabase
        .from('canonical_events')
        .update({ status: 'expired' })
        .in('id', batch)
      if (!error) expired += batch.length
    }

    // Also expire saved stale events but keep them accessible (just mark status)
    let expiredSaved = 0
    for (let i = 0; i < preserved.length; i += 200) {
      const batch = preserved.slice(i, i + 200)
      const { error } = await supabase
        .from('canonical_events')
        .update({ status: 'expired' })
        .in('id', batch)
      if (!error) expiredSaved += batch.length
    }

    return new Response(JSON.stringify({
      success: true,
      total_stale: total,
      expired: expired,
      expired_saved: expiredSaved,
      preserved_in_saved_events: preserved.length,
      cutoff_date: cutoffISO,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
