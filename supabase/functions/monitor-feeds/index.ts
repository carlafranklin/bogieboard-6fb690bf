import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FeedHealth {
  id: string
  feed_name: string
  feed_url: string
  metro_area_slug: string
  last_fetched_at: string | null
  last_error: string | null
  enabled: boolean
  hours_since_fetch: number | null
  status: 'healthy' | 'stale' | 'error' | 'never_fetched'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    let sendEmail = true
    try {
      const body = await req.json()
      sendEmail = body.send_email !== false
    } catch { /* default: send email */ }

    // Get all enabled feeds
    const { data: feeds, error: feedsErr } = await supabase
      .from('feed_registry')
      .select('*')
      .eq('enabled', true)
      .order('feed_name')

    if (feedsErr) throw feedsErr

    const now = new Date()
    const STALE_THRESHOLD_HOURS = 48 // feeds not fetched in 48h are stale

    const feedHealth: FeedHealth[] = (feeds || []).map(feed => {
      let hoursSinceFetch: number | null = null
      let status: FeedHealth['status'] = 'healthy'

      if (!feed.last_fetched_at) {
        status = 'never_fetched'
      } else {
        hoursSinceFetch = (now.getTime() - new Date(feed.last_fetched_at).getTime()) / (1000 * 60 * 60)
        
        if (feed.last_error) {
          status = 'error'
        } else if (hoursSinceFetch > STALE_THRESHOLD_HOURS) {
          status = 'stale'
        }
      }

      return {
        id: feed.id,
        feed_name: feed.feed_name,
        feed_url: feed.feed_url,
        metro_area_slug: feed.metro_area_slug,
        last_fetched_at: feed.last_fetched_at,
        last_error: feed.last_error,
        enabled: feed.enabled,
        hours_since_fetch: hoursSinceFetch ? Math.round(hoursSinceFetch) : null,
        status,
      }
    })

    const problemFeeds = feedHealth.filter(f => f.status !== 'healthy')
    const healthyCount = feedHealth.filter(f => f.status === 'healthy').length
    const errorCount = feedHealth.filter(f => f.status === 'error').length
    const staleCount = feedHealth.filter(f => f.status === 'stale').length
    const neverCount = feedHealth.filter(f => f.status === 'never_fetched').length

    // Store the health check results in a lightweight way
    // We'll use ingestion_runs with a special source
    const { data: monitorSource } = await supabase
      .from('sources')
      .select('id')
      .eq('name', 'Feed Health Monitor')
      .maybeSingle()

    let monitorSourceId: string
    if (monitorSource) {
      monitorSourceId = monitorSource.id
    } else {
      const { data: newSource } = await supabase
        .from('sources')
        .insert({ name: 'Feed Health Monitor', type: 'manual', is_active: true, trust_score: 100 })
        .select('id')
        .single()
      monitorSourceId = newSource!.id
    }

    await supabase.from('ingestion_runs').insert({
      source_id: monitorSourceId,
      status: problemFeeds.length > 0 ? 'partial' : 'completed',
      ended_at: now.toISOString(),
      records_fetched: feedHealth.length,
      errors_count: problemFeeds.length,
      metadata: {
        type: 'feed_health_check',
        healthy: healthyCount,
        errors: errorCount,
        stale: staleCount,
        never_fetched: neverCount,
        problem_feeds: problemFeeds.map(f => ({
          name: f.feed_name,
          status: f.status,
          error: f.last_error,
          hours_since_fetch: f.hours_since_fetch,
        })),
      },
    })

    // Send email alert to admin users if there are problems
    if (sendEmail && problemFeeds.length > 0) {
      // Get admin user emails
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')

      if (adminRoles && adminRoles.length > 0) {
        const adminUserIds = adminRoles.map(r => r.user_id)
        const { data: adminProfiles } = await supabase
          .from('profiles')
          .select('email')
          .in('user_id', adminUserIds)

        const adminEmails = (adminProfiles || [])
          .map(p => p.email)
          .filter(Boolean) as string[]

        if (adminEmails.length > 0) {
          // Build email body
          const emailBody = buildAlertEmail(problemFeeds, healthyCount)
          
          // Send via Supabase Auth admin API (or log for now)
          console.log(`Feed health alert would be sent to: ${adminEmails.join(', ')}`)
          console.log(`Problem feeds: ${problemFeeds.length}`)
          
          // Use Supabase's built-in email via edge function invocation
          // For now, we log the alert - admins see it on the dashboard
          for (const feed of problemFeeds) {
            console.warn(`⚠️ Feed issue: ${feed.feed_name} (${feed.status}) - ${feed.last_error || 'No fetch in ' + feed.hours_since_fetch + 'h'}`)
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      summary: {
        total_feeds: feedHealth.length,
        healthy: healthyCount,
        errors: errorCount,
        stale: staleCount,
        never_fetched: neverCount,
      },
      problem_feeds: problemFeeds,
      all_feeds: feedHealth,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Monitor error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function buildAlertEmail(problemFeeds: FeedHealth[], healthyCount: number): string {
  const lines = [
    '🚨 BogieBoard Feed Health Alert',
    '',
    `${problemFeeds.length} feed(s) need attention (${healthyCount} healthy)`,
    '',
  ]

  for (const feed of problemFeeds) {
    const icon = feed.status === 'error' ? '❌' : feed.status === 'stale' ? '⏰' : '❓'
    lines.push(`${icon} ${feed.feed_name} (${feed.metro_area_slug})`)
    if (feed.last_error) lines.push(`   Error: ${feed.last_error}`)
    if (feed.hours_since_fetch) lines.push(`   Last fetch: ${feed.hours_since_fetch}h ago`)
    lines.push('')
  }

  lines.push('Visit the Admin Dashboard → Scrape Sources tab to fix these feeds.')
  return lines.join('\n')
}
