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

// ── Configurable limits ───────────────────────────
interface IngestConfig {
  maxMetroAreas: number
  tmPageLimit: number
  tmPageSize: number
  ebPageLimit: number
  enableTicketmaster: boolean
  enableEventbrite: boolean
  safeMode: boolean
}

const DEFAULT_CONFIG: IngestConfig = {
  maxMetroAreas: 3,
  tmPageLimit: 2,
  tmPageSize: 100,
  ebPageLimit: 5,
  enableTicketmaster: true,
  enableEventbrite: true,
  safeMode: false,
}

const SAFE_MODE_CONFIG: Partial<IngestConfig> = {
  maxMetroAreas: 1,
  tmPageLimit: 1,
  tmPageSize: 20,
  ebPageLimit: 1,
}

function resolveConfig(body: any): IngestConfig {
  const safeMode = body?.safeMode === true
  const base = safeMode ? { ...DEFAULT_CONFIG, ...SAFE_MODE_CONFIG, safeMode: true } : { ...DEFAULT_CONFIG }
  return {
    ...base,
    maxMetroAreas: body?.maxMetroAreas ?? base.maxMetroAreas,
    tmPageLimit: body?.tmPageLimit ?? base.tmPageLimit,
    tmPageSize: body?.tmPageSize ?? base.tmPageSize,
    ebPageLimit: body?.ebPageLimit ?? base.ebPageLimit,
    enableTicketmaster: body?.enableTicketmaster ?? base.enableTicketmaster,
    enableEventbrite: body?.enableEventbrite ?? base.enableEventbrite,
  }
}

// ── Timing helper ─────────────────────────────────
function elapsed(start: number): string {
  return `${(performance.now() - start).toFixed(0)}ms`
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
async function fetchTicketmaster(
  apiKey: string,
  metroLatLon: { lat: number; lon: number; radius: number }[],
  config: IngestConfig,
): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = []
  const t0 = performance.now()

  for (const geo of metroLatLon) {
    let page = 0
    let totalPages = 1

    while (page < totalPages && page < config.tmPageLimit) {
      const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json')
      url.searchParams.set('apikey', apiKey)
      url.searchParams.set('latlong', `${geo.lat},${geo.lon}`)
      url.searchParams.set('radius', String(geo.radius))
      url.searchParams.set('unit', 'miles')
      url.searchParams.set('size', String(config.tmPageSize))
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

  console.log(`[timing] Ticketmaster fetch: ${elapsed(t0)}, ${events.length} events`)
  return events
}

// ── Eventbrite ────────────────────────────────────
async function fetchEventbrite(
  token: string,
  locations: { lat: string; lon: string; within: string }[],
  config: IngestConfig,
): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = []
  const t0 = performance.now()

  for (const loc of locations) {
    let page = 1
    let hasMore = true

    while (hasMore && page <= config.ebPageLimit) {
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

  console.log(`[timing] Eventbrite fetch: ${elapsed(t0)}, ${events.length} events`)
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

// ── In-memory caches ──────────────────────────────
// Venue cache: "name|city" → venueId
const venueCache = new Map<string, string>()

// Category cache: slug → categoryId
const categoryCache = new Map<string, string>()

// Seen external IDs this run (dedup before DB)
const seenExternalIds = new Set<string>()

// Hash cache: hash → existing canonical_event id (or "new" if we just created it)
const hashCache = new Map<string, string>()

function venueKey(name: string, city: string): string {
  return `${name.toLowerCase().trim()}|${city.toLowerCase().trim()}`
}

// Compute hash client-side to avoid RPC round-trip
function computeHashLocal(title: string, startTime: string, city: string, venueName: string | null): string {
  // Replicate the DB function: md5(lower(trim(alphanum(title))) || '|' || utcDateTime || '|' || lower(city) || '|' || lower(venue))
  // We can't do md5 natively in Deno easily, so we use a simple hash approach
  // Actually we need to match the DB hash exactly, so we still need the RPC for correctness.
  // Instead, we'll use a local key for dedup and batch the RPC calls.
  const normalized = title.replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase()
  const datePart = startTime.substring(0, 16) // YYYY-MM-DDTHH:MM
  return `${normalized}|${datePart}|${(city || '').trim().toLowerCase()}|${(venueName || '').trim().toLowerCase()}`
}

// ── Optimized Upsert Logic ────────────────────────
async function upsertEvents(
  supabase: any,
  events: NormalizedEvent[],
  sourceId: string,
  metroAreas: any[],
) {
  let created = 0, updated = 0, skipped = 0, errors = 0
  const t0 = performance.now()

  // Pre-build metro lookup: lowercase city → metro_area_id
  const metroLookup = new Map<string, string>()
  for (const metro of metroAreas) {
    const cities = (metro.core_cities as string[]) || []
    for (const c of cities) {
      metroLookup.set(c.toLowerCase(), metro.id)
    }
  }

  // Pre-load all categories into cache
  const tCat = performance.now()
  const { data: allCats } = await supabase.from('categories').select('id, slug')
  if (allCats) {
    for (const cat of allCats) {
      categoryCache.set(cat.slug, cat.id)
    }
  }
  console.log(`[timing] Category cache loaded: ${elapsed(tCat)} (${categoryCache.size} categories)`)

  // Pre-load existing venues for our metro cities into cache
  const tVenue = performance.now()
  const metroCities = Array.from(metroLookup.keys())
  if (metroCities.length > 0) {
    // Load venues for relevant cities (case-insensitive via ilike would be expensive, just load all)
    const { data: existingVenues } = await supabase
      .from('venues')
      .select('id, name, city')
      .limit(2000)
    if (existingVenues) {
      for (const v of existingVenues) {
        if (v.name && v.city) {
          venueCache.set(venueKey(v.name, v.city), v.id)
        }
      }
    }
  }
  console.log(`[timing] Venue cache loaded: ${elapsed(tVenue)} (${venueCache.size} venues)`)

  // Pre-load existing hashes to skip duplicates without per-event queries
  const tHash = performance.now()
  const { data: existingHashes } = await supabase
    .from('canonical_events')
    .select('id, normalized_hash')
    .eq('status', 'active')
    .not('normalized_hash', 'is', null)
    .limit(5000)
  if (existingHashes) {
    for (const h of existingHashes) {
      if (h.normalized_hash) {
        hashCache.set(h.normalized_hash, h.id)
      }
    }
  }
  console.log(`[timing] Hash cache loaded: ${elapsed(tHash)} (${hashCache.size} hashes)`)

  const tProcess = performance.now()

  // Batch arrays for source_events inserts
  const sourceEventsBatch: any[] = []

  for (const rawEv of events) {
    const ev = sanitizeEvent(rawEv)
    if (!ev) {
      skipped++
      continue
    }

    // Dedup by external_event_id within this run
    if (seenExternalIds.has(ev.external_event_id)) {
      skipped++
      continue
    }
    seenExternalIds.add(ev.external_event_id)

    try {
      // Metro area from cache
      const metroAreaId = metroLookup.get(ev.venue_city.toLowerCase()) ?? null

      // Venue from cache or single DB call
      let venueId: string | null = null
      if (ev.venue_name && ev.venue_name !== 'TBA' && ev.venue_name !== 'Online') {
        const vk = venueKey(ev.venue_name, ev.venue_city)
        if (venueCache.has(vk)) {
          venueId = venueCache.get(vk)!
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
            // Might be duplicate — try select
            const { data: existing } = await supabase
              .from('venues')
              .select('id')
              .eq('name', ev.venue_name)
              .eq('city', ev.venue_city)
              .maybeSingle()
            if (existing?.id) {
              venueId = existing.id
              venueCache.set(vk, existing.id)
            }
          } else if (newVenue?.id) {
            venueId = newVenue.id
            venueCache.set(vk, newVenue.id)
          }
        }
      }

      // Generate hash via RPC (required for exact match with DB function)
      const { data: hash, error: hashErr } = await supabase.rpc('generate_event_hash', {
        p_title: ev.title,
        p_start_time: ev.start_time,
        p_city: ev.venue_city,
        p_venue_name: ev.venue_name,
      })

      if (hashErr || !hash) {
        console.error(`[hash] Failed for "${ev.title}":`, hashErr?.message ?? 'null')
        errors++
        continue
      }

      let canonicalEventId: string

      // Check hash cache first (avoid DB select)
      if (hashCache.has(hash)) {
        // Existing event — only update last_seen timestamp (skip expensive field updates
        // unless data has materially changed, which we can't cheaply detect here)
        canonicalEventId = hashCache.get(hash)!
        const { error: updateErr } = await supabase
          .from('canonical_events')
          .update({
            last_seen_at: new Date().toISOString(),
            last_refreshed_at: new Date().toISOString(),
          })
          .eq('id', canonicalEventId)

        if (updateErr) {
          console.error(`[update] Failed for "${ev.title}":`, updateErr.message)
          errors++
          continue
        }
        updated++
      } else {
        // New event — insert
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
          console.error(`[insert] Failed for "${ev.title}":`, eventErr?.message ?? 'no id')
          errors++
          continue
        }
        canonicalEventId = newEvent.id
        hashCache.set(hash, canonicalEventId)
        created++
      }

      // Link categories using cache (avoid per-event category selects)
      if (ev.category_names.length > 0) {
        for (const catName of ev.category_names) {
          if (!catName || catName === 'Undefined') continue

          // Try map_to_app_category — use cached result if available
          const mappedKey = `_mapped_${catName.toLowerCase()}`
          let appSlug: string | null = null
          if (categoryCache.has(mappedKey)) {
            appSlug = categoryCache.get(mappedKey) ?? null
          } else {
            const { data: slug } = await supabase.rpc('map_to_app_category', { p_source_category: catName })
            if (slug) {
              categoryCache.set(mappedKey, slug)
              appSlug = slug
            } else {
              categoryCache.set(mappedKey, '')
            }
          }

          // Link the mapped app category if it exists in our cache
          if (appSlug && categoryCache.has(appSlug)) {
            const catId = categoryCache.get(appSlug)!
            await supabase
              .from('event_categories')
              .upsert({ event_id: canonicalEventId, category_id: catId }, { onConflict: 'event_id,category_id' })
          }
        }
      }

      // Batch source_events insert
      sourceEventsBatch.push({
        source_id: sourceId,
        external_event_id: ev.external_event_id,
        source_url: ev.source_url,
        canonical_event_id: canonicalEventId,
        parse_status: 'matched',
        normalized_hash: hash,
      })
    } catch (e) {
      console.error('Error processing event:', ev.title, e)
      errors++
    }
  }

  // Batch insert source_events
  const tSource = performance.now()
  if (sourceEventsBatch.length > 0) {
    // Insert in chunks of 50
    for (let i = 0; i < sourceEventsBatch.length; i += 50) {
      const chunk = sourceEventsBatch.slice(i, i + 50)
      const { error: batchErr } = await supabase.from('source_events').insert(chunk)
      if (batchErr) {
        console.warn(`[source_events batch] Failed chunk ${i}:`, batchErr.message)
      }
    }
  }
  console.log(`[timing] Source events batch insert: ${elapsed(tSource)} (${sourceEventsBatch.length} records)`)

  console.log(`[timing] Event processing: ${elapsed(tProcess)} (${events.length} events → ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors)`)

  return { created, updated, skipped, errors }
}

// ── Main Handler ──────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const tTotal = performance.now()

  try {
    let body: any = {}
    try { body = await req.json() } catch { /* empty body is fine */ }

    const config = resolveConfig(body)
    console.log(`[ingest-events] Config:`, JSON.stringify(config))

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

    // Get metro areas (limited)
    const { data: metroAreas, error: metroErr } = await supabase
      .from('metro_areas')
      .select('*')
      .limit(config.maxMetroAreas)
    if (metroErr) {
      return errorResponse('metro_areas_select', `Query failed: ${metroErr.message}`)
    }
    if (!metroAreas?.length) {
      return errorResponse('metro_areas_select', 'No metro areas configured', 400)
    }
    console.log(`[ingest-events] Loaded ${metroAreas.length} metro areas (limit: ${config.maxMetroAreas})`)

    // Build geo points from metro areas (use their lat/lon, fallback to hardcoded)
    const geoPoints = metroAreas
      .filter((m: any) => m.latitude && m.longitude)
      .map((m: any) => ({ lat: m.latitude, lon: m.longitude, radius: 30 }))

    if (geoPoints.length === 0) {
      // Fallback to first hardcoded point only
      geoPoints.push({ lat: 35.7796, lon: -78.6382, radius: 30 })
    }

    // Limit geo points to config
    const limitedGeoPoints = geoPoints.slice(0, config.maxMetroAreas)

    // Get or create source (cached per invocation)
    const sourceCache = new Map<string, string>()
    const getOrCreateSource = async (name: string, type: string, baseUrl: string): Promise<string | null> => {
      if (sourceCache.has(name)) return sourceCache.get(name)!
      const { data: existing, error: selectErr } = await supabase
        .from('sources')
        .select('id')
        .eq('name', name)
        .maybeSingle()

      if (selectErr) {
        console.error(`[getOrCreateSource] Select failed for "${name}":`, selectErr.message)
        return null
      }
      if (existing?.id) {
        sourceCache.set(name, existing.id)
        return existing.id
      }

      const { data: newSource, error: insertErr } = await supabase
        .from('sources')
        .insert({ name, type, base_url: baseUrl, is_active: true, trust_score: 80 })
        .select('id')
        .single()

      if (insertErr || !newSource?.id) {
        console.error(`[getOrCreateSource] Insert failed for "${name}":`, insertErr?.message ?? 'no id returned')
        return null
      }
      sourceCache.set(name, newSource.id)
      return newSource.id
    }

    const results: any[] = []

    // ── Ticketmaster ──
    if (config.enableTicketmaster && tmApiKey) {
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

      const tmEvents = await fetchTicketmaster(tmApiKey, limitedGeoPoints, config)
      console.log(`[ingest-events] Ticketmaster: ${tmEvents.length} events fetched from ${limitedGeoPoints.length} geo points`)

      const stats = await upsertEvents(supabase, tmEvents, sourceId, metroAreas)

      await supabase.from('ingestion_runs').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        records_fetched: tmEvents.length,
        records_created: stats.created,
        records_updated: stats.updated,
        records_skipped: stats.skipped,
        errors_count: stats.errors,
      }).eq('id', run.id)

      results.push({ source: 'Ticketmaster', ...stats, total_fetched: tmEvents.length })
    }

    // ── Eventbrite ──
    if (config.enableEventbrite && ebToken) {
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

      const ebLocations = limitedGeoPoints.map(g => ({
        lat: String(g.lat), lon: String(g.lon), within: `${g.radius}mi`,
      }))
      const ebEvents = await fetchEventbrite(ebToken, ebLocations, config)
      console.log(`[ingest-events] Eventbrite: ${ebEvents.length} events fetched`)

      const stats = await upsertEvents(supabase, ebEvents, sourceId, metroAreas)

      await supabase.from('ingestion_runs').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        records_fetched: ebEvents.length,
        records_created: stats.created,
        records_updated: stats.updated,
        records_skipped: stats.skipped,
        errors_count: stats.errors,
      }).eq('id', run.id)

      results.push({ source: 'Eventbrite', ...stats, total_fetched: ebEvents.length })
    }

    console.log(`[timing] Total ingest-events: ${elapsed(tTotal)}`)
    console.log(`[ingest-events] Complete. Results:`, JSON.stringify(results))
    return new Response(JSON.stringify({ success: true, config, results, totalTime: elapsed(tTotal) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[ingest-events] Unhandled error after ${elapsed(tTotal)}:`, msg)
    return new Response(JSON.stringify({ error: msg, step: 'unhandled' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
