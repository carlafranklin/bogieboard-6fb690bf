import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function errorResponse(step: string, detail: string, status = 500) {
  console.error(`[ingest-events] FAIL at "${step}": ${detail}`)
  return new Response(JSON.stringify({ error: detail, step }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface NormalizedEvent {
  title: string
  description_short: string | null
  description_long: string | null
  start_time: string
  end_time: string | null
  all_day: boolean
  is_free: boolean
  price_min: number | null
  price_max: number | null
  ticket_url: string | null
  image_url: string | null
  age_restriction: number | null
  venue_name: string
  venue_address: string | null
  venue_city: string
  venue_state: string
  venue_zip: string | null
  venue_lat: number | null
  venue_lon: number | null
  external_event_id: string
  source_url: string | null
  category_names: string[]
}

// ── Ticketmaster ──────────────────────────────────
async function fetchTicketmaster(apiKey: string, metroLatLon: { lat: number; lon: number; radius: number }[]): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = []

  for (const geo of metroLatLon) {
    let page = 0
    let totalPages = 1

    while (page < totalPages && page < 2) {
      const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json')
      url.searchParams.set('apikey', apiKey)
      url.searchParams.set('latlong', `${geo.lat},${geo.lon}`)
      url.searchParams.set('radius', String(geo.radius))
      url.searchParams.set('unit', 'miles')
      url.searchParams.set('size', '100')
      url.searchParams.set('page', String(page))
      url.searchParams.set('sort', 'date,asc')
      url.searchParams.set('countryCode', 'US')

      const resp = await fetch(url.toString())
      if (!resp.ok) {
        console.error(`Ticketmaster API error: ${resp.status} ${await resp.text()}`)
        break
      }

      const data = await resp.json()
      totalPages = data?.page?.totalPages ?? 0

      const items = data?._embedded?.events ?? []
      for (const ev of items) {
        try {
          const venue = ev._embedded?.venues?.[0]
          const startDate = ev.dates?.start
          const priceRanges = ev.priceRanges?.[0]

          events.push({
            title: ev.name,
            description_short: ev.info?.substring(0, 500) ?? null,
            description_long: ev.pleaseNote ?? null,
            start_time: startDate?.dateTime ?? `${startDate?.localDate}T00:00:00Z`,
            end_time: ev.dates?.end?.dateTime ?? null,
            all_day: !startDate?.dateTime,
            is_free: false,
            price_min: priceRanges?.min ?? null,
            price_max: priceRanges?.max ?? null,
            ticket_url: ev.url ?? null,
            image_url: ev.images?.find((i: any) => i.ratio === '16_9' && i.width > 500)?.url ?? ev.images?.[0]?.url ?? null,
            age_restriction: ev.ageRestrictions?.legalAgeEnforced ? 18 : null,
            venue_name: venue?.name ?? 'TBA',
            venue_address: venue?.address?.line1 ?? null,
            venue_city: venue?.city?.name ?? '',
            venue_state: venue?.state?.stateCode ?? 'NC',
            venue_zip: venue?.postalCode ?? null,
            venue_lat: venue?.location?.latitude ? parseFloat(venue.location.latitude) : null,
            venue_lon: venue?.location?.longitude ? parseFloat(venue.location.longitude) : null,
            external_event_id: `tm_${ev.id}`,
            source_url: ev.url ?? null,
            category_names: [
              ev.classifications?.[0]?.segment?.name,
              ev.classifications?.[0]?.genre?.name,
            ].filter(Boolean),
          })
        } catch (e) {
          console.error('Error parsing TM event:', e)
        }
      }
      page++
    }
  }

  return events
}

// ── Eventbrite ────────────────────────────────────
async function fetchEventbrite(token: string, locations: { lat: string; lon: string; within: string }[]): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = []

  for (const loc of locations) {
    let page = 1
    let hasMore = true

    while (hasMore && page <= 5) {
      const url = new URL('https://www.eventbriteapi.com/v3/events/search/')
      url.searchParams.set('location.latitude', loc.lat)
      url.searchParams.set('location.longitude', loc.lon)
      url.searchParams.set('location.within', loc.within)
      url.searchParams.set('start_date.keyword', 'this_month')
      url.searchParams.set('expand', 'venue,ticket_availability')
      url.searchParams.set('page', String(page))

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        console.error(`Eventbrite API error: ${resp.status} ${await resp.text()}`)
        break
      }

      const data = await resp.json()
      hasMore = data.pagination?.has_more_items ?? false

      for (const ev of data.events ?? []) {
        try {
          const venue = ev.venue
          const isFree = ev.is_free ?? ev.ticket_availability?.is_free ?? false

          events.push({
            title: ev.name?.text ?? ev.name?.html ?? 'Untitled',
            description_short: ev.summary?.substring(0, 500) ?? ev.description?.text?.substring(0, 500) ?? null,
            description_long: ev.description?.text ?? null,
            start_time: ev.start?.utc ?? ev.start?.local ?? '',
            end_time: ev.end?.utc ?? ev.end?.local ?? null,
            all_day: false,
            is_free: isFree,
            price_min: ev.ticket_availability?.minimum_ticket_price?.major_value ? parseFloat(ev.ticket_availability.minimum_ticket_price.major_value) : null,
            price_max: ev.ticket_availability?.maximum_ticket_price?.major_value ? parseFloat(ev.ticket_availability.maximum_ticket_price.major_value) : null,
            ticket_url: ev.url ?? null,
            image_url: ev.logo?.original?.url ?? ev.logo?.url ?? null,
            age_restriction: null,
            venue_name: venue?.name ?? 'Online',
            venue_address: venue?.address?.address_1 ?? null,
            venue_city: venue?.address?.city ?? '',
            venue_state: venue?.address?.region ?? 'NC',
            venue_zip: venue?.address?.postal_code ?? null,
            venue_lat: venue?.latitude ? parseFloat(venue.latitude) : null,
            venue_lon: venue?.longitude ? parseFloat(venue.longitude) : null,
            external_event_id: `eb_${ev.id}`,
            source_url: ev.url ?? null,
            category_names: [],
          })
        } catch (e) {
          console.error('Error parsing EB event:', e)
        }
      }
      page++
    }
  }

  return events
}

// ── Validation helpers ─────────────────────────────
function isValidUrl(url: string | null): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function truncate(val: string | null | undefined, max: number): string | null {
  if (!val) return null
  return val.trim().substring(0, max)
}

function sanitizeEvent(ev: NormalizedEvent): NormalizedEvent | null {
  if (!ev.title || typeof ev.title !== 'string' || ev.title.trim().length === 0) return null
  if (!ev.start_time || typeof ev.start_time !== 'string') return null
  if (!ev.venue_city || typeof ev.venue_city !== 'string') return null

  return {
    ...ev,
    title: ev.title.trim().substring(0, 500),
    description_short: truncate(ev.description_short, 500),
    description_long: truncate(ev.description_long, 5000),
    venue_name: (ev.venue_name || 'TBA').trim().substring(0, 200),
    venue_city: ev.venue_city.trim().substring(0, 100),
    venue_state: (ev.venue_state || '').trim().substring(0, 50),
    venue_address: truncate(ev.venue_address, 300),
    venue_zip: truncate(ev.venue_zip, 20),
    ticket_url: isValidUrl(ev.ticket_url) ? ev.ticket_url : null,
    image_url: isValidUrl(ev.image_url) ? ev.image_url : null,
    source_url: isValidUrl(ev.source_url) ? ev.source_url : null,
    category_names: (ev.category_names || [])
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0 && c !== 'Undefined')
      .map(c => c.trim().substring(0, 50))
      .slice(0, 10),
  }
}

// ── Upsert Logic ──────────────────────────────────
async function upsertEvents(
  supabase: any,
  events: NormalizedEvent[],
  sourceId: string,
  metroAreas: any[],
) {
  let created = 0, updated = 0, skipped = 0, errors = 0

  for (const rawEv of events) {
    const ev = sanitizeEvent(rawEv)
    if (!ev) {
      console.warn('Skipping invalid event:', rawEv.title)
      skipped++
      continue
    }
    try {
      // Determine metro area from city
      let metroAreaId: string | null = null
      for (const metro of metroAreas) {
        const cities = (metro.core_cities as string[]).map((c: string) => c.toLowerCase())
        if (cities.includes(ev.venue_city.toLowerCase())) {
          metroAreaId = metro.id
          break
        }
      }

      // Upsert venue
      let venueId: string | null = null
      if (ev.venue_name && ev.venue_name !== 'TBA' && ev.venue_name !== 'Online') {
        const { data: existingVenue, error: venueSelectErr } = await supabase
          .from('venues')
          .select('id')
          .eq('name', ev.venue_name)
          .eq('city', ev.venue_city)
          .maybeSingle()

        if (venueSelectErr) {
          console.error(`[venues select] Failed for "${ev.venue_name}" in "${ev.venue_city}":`, venueSelectErr.message)
          // Continue without venue
        } else if (existingVenue) {
          venueId = existingVenue.id
        } else {
          const { data: newVenue, error: venueInsertErr } = await supabase
            .from('venues')
            .insert({
              name: ev.venue_name,
              address_1: ev.venue_address,
              city: ev.venue_city,
              state: ev.venue_state,
              zip: ev.venue_zip,
              latitude: ev.venue_lat,
              longitude: ev.venue_lon,
              metro_area_id: metroAreaId,
            })
            .select('id')
            .single()
          if (venueInsertErr) {
            console.error(`[venues insert] Failed for "${ev.venue_name}":`, venueInsertErr.message)
          } else if (newVenue?.id) {
            venueId = newVenue.id
          } else {
            console.warn(`[venues insert] No id returned for "${ev.venue_name}"`)
          }
        }
      }

      // Generate hash for dedup
      const { data: hash, error: hashErr } = await supabase.rpc('generate_event_hash', {
        p_title: ev.title,
        p_start_time: ev.start_time,
        p_city: ev.venue_city,
        p_venue_name: ev.venue_name,
      })

      if (hashErr || !hash) {
        console.error(`[generate_event_hash] Failed for "${ev.title}":`, hashErr?.message ?? 'returned null')
        errors++
        continue
      }

      // Check for existing event by hash
      const { data: existingEvent, error: existingEventErr } = await supabase
        .from('canonical_events')
        .select('id')
        .eq('normalized_hash', hash)
        .maybeSingle()

      if (existingEventErr) {
        console.error(`[canonical_events select] Failed for hash "${hash}":`, existingEventErr.message)
        errors++
        continue
      }

      let canonicalEventId: string

      if (existingEvent) {
        // Update existing
        const { error: updateErr } = await supabase
          .from('canonical_events')
          .update({
            description_short: ev.description_short,
            end_time: ev.end_time,
            price_min: ev.price_min,
            price_max: ev.price_max,
            ticket_url: ev.ticket_url,
            image_url: ev.image_url,
            last_seen_at: new Date().toISOString(),
            last_refreshed_at: new Date().toISOString(),
          })
          .eq('id', existingEvent.id)

        if (updateErr) {
          console.error(`[canonical_events update] Failed for "${ev.title}":`, updateErr.message)
          errors++
          continue
        }
        canonicalEventId = existingEvent.id
        updated++
      } else {
        // Create new
        const { data: newEvent, error: eventErr } = await supabase
          .from('canonical_events')
          .insert({
            title: ev.title,
            description_short: ev.description_short,
            description_long: ev.description_long,
            start_time: ev.start_time,
            end_time: ev.end_time,
            all_day: ev.all_day,
            is_free: ev.is_free,
            price_min: ev.price_min,
            price_max: ev.price_max,
            ticket_url: ev.ticket_url,
            image_url: ev.image_url,
            age_restriction: ev.age_restriction,
            venue_id: venueId,
            metro_area_id: metroAreaId,
            normalized_hash: hash,
            status: 'active',
            source_url: ev.source_url,
          })
          .select('id')
          .single()

        if (eventErr || !newEvent?.id) {
          console.error(`[canonical_events insert] Failed for "${ev.title}":`, eventErr?.message ?? 'no id returned')
          errors++
          continue
        }
        canonicalEventId = newEvent.id
        created++
      }

      // Link categories
      if (ev.category_names.length > 0) {
        const mappedSlugs = new Set<string>()
        for (const catName of ev.category_names) {
          if (!catName || catName === 'Undefined') continue

          const { data: appSlug, error: mapErr } = await supabase.rpc('map_to_app_category', { p_source_category: catName })
          if (mapErr) {
            console.warn(`[map_to_app_category] Failed for "${catName}":`, mapErr.message)
          } else if (appSlug) {
            mappedSlugs.add(appSlug)
          }

          const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          const { data: cat, error: catSelectErr } = await supabase
            .from('categories')
            .select('id')
            .eq('slug', slug)
            .maybeSingle()

          if (catSelectErr) {
            console.warn(`[categories select] Failed for slug "${slug}":`, catSelectErr.message)
            continue
          }

          let catId = cat?.id
          if (!catId) {
            const { data: newCat, error: catInsertErr } = await supabase
              .from('categories')
              .insert({ name: catName, slug })
              .select('id')
              .single()
            if (catInsertErr || !newCat?.id) {
              console.warn(`[categories insert] Failed for "${catName}":`, catInsertErr?.message ?? 'no id')
              continue
            }
            catId = newCat.id
          }

          const { error: ecErr } = await supabase
            .from('event_categories')
            .upsert({ event_id: canonicalEventId, category_id: catId }, { onConflict: 'event_id,category_id' })
          if (ecErr) {
            console.warn(`[event_categories upsert] Failed for event ${canonicalEventId}, cat ${catId}:`, ecErr.message)
          }
        }

        for (const appSlug of mappedSlugs) {
          const { data: appCat, error: appCatErr } = await supabase
            .from('categories')
            .select('id')
            .eq('slug', appSlug)
            .maybeSingle()
          if (appCatErr) {
            console.warn(`[categories select app] Failed for slug "${appSlug}":`, appCatErr.message)
            continue
          }
          if (appCat?.id) {
            const { error: ecErr } = await supabase
              .from('event_categories')
              .upsert({ event_id: canonicalEventId, category_id: appCat.id }, { onConflict: 'event_id,category_id' })
            if (ecErr) {
              console.warn(`[event_categories upsert app] Failed:`, ecErr.message)
            }
          }
        }
      }

      // Track source event
      const { error: sourceEventErr } = await supabase.from('source_events').insert({
        source_id: sourceId,
        external_event_id: ev.external_event_id,
        source_url: ev.source_url,
        canonical_event_id: canonicalEventId,
        parse_status: 'matched',
        normalized_hash: hash,
      })
      if (sourceEventErr) {
        console.warn(`[source_events insert] Failed for "${ev.title}":`, sourceEventErr.message)
      }
    } catch (e) {
      console.error('Error processing event:', ev.title, e)
      errors++
    }
  }

  return { created, updated, skipped, errors }
}

// ── Main Handler ──────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const tmApiKey = Deno.env.get('TICKETMASTER_API_KEY')
    const ebToken = Deno.env.get('EVENTBRITE_PRIVATE_TOKEN')

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse('env', 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    if (!tmApiKey && !ebToken) {
      return errorResponse('env', 'No API keys configured (TICKETMASTER_API_KEY or EVENTBRITE_PRIVATE_TOKEN)')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get metro areas
    const { data: metroAreas, error: metroErr } = await supabase.from('metro_areas').select('*')
    if (metroErr) {
      return errorResponse('metro_areas_select', `Query failed: ${metroErr.message}`)
    }
    if (!metroAreas?.length) {
      return errorResponse('metro_areas_select', 'No metro areas configured', 400)
    }
    console.log(`[ingest-events] Loaded ${metroAreas.length} metro areas`)

    // Get or create sources
    const getOrCreateSource = async (name: string, type: string, baseUrl: string): Promise<string | null> => {
      const { data: existing, error: selectErr } = await supabase
        .from('sources')
        .select('id')
        .eq('name', name)
        .maybeSingle()

      if (selectErr) {
        console.error(`[getOrCreateSource] Select failed for "${name}":`, selectErr.message)
        return null
      }
      if (existing?.id) return existing.id

      const { data: newSource, error: insertErr } = await supabase
        .from('sources')
        .insert({ name, type, base_url: baseUrl, is_active: true, trust_score: 80 })
        .select('id')
        .single()

      if (insertErr || !newSource?.id) {
        console.error(`[getOrCreateSource] Insert failed for "${name}":`, insertErr?.message ?? 'no id returned')
        return null
      }
      return newSource.id
    }

    // Geo points for our metros
    const geoPoints = [
      { lat: 35.2271, lon: -80.8431, radius: 30 },
      { lat: 36.0726, lon: -79.7920, radius: 25 },
      { lat: 35.7796, lon: -78.6382, radius: 30 },
    ]

    const results: any[] = []

    // ── Ticketmaster ──
    if (tmApiKey) {
      const sourceId = await getOrCreateSource('Ticketmaster', 'api', 'https://app.ticketmaster.com/discovery/v2')
      if (!sourceId) {
        return errorResponse('getOrCreateSource', 'Failed to get or create Ticketmaster source')
      }

      const { data: run, error: runErr } = await supabase.from('ingestion_runs').insert({
        source_id: sourceId, status: 'running',
      }).select('id').single()

      if (runErr || !run?.id) {
        return errorResponse('ingestion_runs_insert', `Failed to create ingestion run: ${runErr?.message ?? 'no id returned'}`)
      }

      console.log(`[ingest-events] Fetching Ticketmaster events (run ${run.id})...`)
      const tmEvents = await fetchTicketmaster(tmApiKey, geoPoints)
      console.log(`[ingest-events] Ticketmaster: ${tmEvents.length} events fetched`)

      const stats = await upsertEvents(supabase, tmEvents, sourceId, metroAreas)

      const { error: updateRunErr } = await supabase.from('ingestion_runs').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        records_fetched: tmEvents.length,
        records_created: stats.created,
        records_updated: stats.updated,
        records_skipped: stats.skipped,
        errors_count: stats.errors,
      }).eq('id', run.id)

      if (updateRunErr) {
        console.error(`[ingestion_runs update] Failed for run ${run.id}:`, updateRunErr.message)
      }

      results.push({ source: 'Ticketmaster', ...stats, total_fetched: tmEvents.length })
    }

    // ── Eventbrite ──
    if (ebToken) {
      const sourceId = await getOrCreateSource('Eventbrite', 'api', 'https://www.eventbriteapi.com/v3')
      if (!sourceId) {
        return errorResponse('getOrCreateSource', 'Failed to get or create Eventbrite source')
      }

      const { data: run, error: runErr } = await supabase.from('ingestion_runs').insert({
        source_id: sourceId, status: 'running',
      }).select('id').single()

      if (runErr || !run?.id) {
        return errorResponse('ingestion_runs_insert', `Failed to create Eventbrite ingestion run: ${runErr?.message ?? 'no id returned'}`)
      }

      console.log(`[ingest-events] Fetching Eventbrite events (run ${run.id})...`)
      const ebLocations = geoPoints.map(g => ({
        lat: String(g.lat), lon: String(g.lon), within: `${g.radius}mi`,
      }))
      const ebEvents = await fetchEventbrite(ebToken, ebLocations)
      console.log(`[ingest-events] Eventbrite: ${ebEvents.length} events fetched`)

      const stats = await upsertEvents(supabase, ebEvents, sourceId, metroAreas)

      const { error: updateRunErr } = await supabase.from('ingestion_runs').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        records_fetched: ebEvents.length,
        records_created: stats.created,
        records_updated: stats.updated,
        records_skipped: stats.skipped,
        errors_count: stats.errors,
      }).eq('id', run.id)

      if (updateRunErr) {
        console.error(`[ingestion_runs update] Failed for run ${run.id}:`, updateRunErr.message)
      }

      results.push({ source: 'Eventbrite', ...stats, total_fetched: ebEvents.length })
    }

    console.log(`[ingest-events] Complete. Results:`, JSON.stringify(results))
    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[ingest-events] Unhandled error:', msg)
    return new Response(JSON.stringify({ error: msg, step: 'unhandled' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
